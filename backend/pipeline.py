"""
Pipeline orchestrator — runs all steps in sequence and assembles the output.
Includes a streaming generator for real-time step-by-step progress.
"""

import json
import time
from datetime import datetime, date

from backend.data_loader import DataStore, get_store
from backend.models import (
    ProcessRequest, PipelineResult, RequestInterpretation,
    Recommendation, AuditTrail, MissingField, ParameterOverride,
)
from backend.validation import validate_request, validate_feasibility
from backend.policy_engine import evaluate_policies
from backend.supplier_matcher import match_suppliers
from backend.scoring import score_and_rank_suppliers
from backend.escalation import evaluate_escalations
from backend.extraction import (
    extract_from_text, translate_text,
    generate_recommendation_note, generate_overall_narrative,
)
from backend.supplier_discovery import discover_suppliers
from backend.what_if import compute_what_if


def process_request(req: ProcessRequest) -> PipelineResult:
    """Main pipeline: process a single request (existing or new free-text)."""
    store = get_store()
    result = PipelineResult(request_id=req.request_id or "NEW-REQUEST")
    result.processed_at = datetime.utcnow().isoformat() + "Z"

    # --- Step 1: Request Intake ---
    # If request_id provided, look up from loaded data
    raw = None
    if req.request_id and req.request_id in store.requests:
        raw = store.requests[req.request_id]
        result.request_id = req.request_id

    # --- Step 2: Build interpretation (extraction) ---
    interp = _build_interpretation(req, raw)
    result.request_interpretation = interp

    # --- Step 3: Validation ---
    validation = validate_request(
        category_l1=interp.category_l1,
        category_l2=interp.category_l2,
        quantity=interp.quantity,
        budget=interp.budget_amount,
        currency=interp.currency,
        required_by_date=interp.required_by_date,
        days_until_required=interp.days_until_required,
        delivery_countries=interp.delivery_countries,
        preferred_supplier=interp.preferred_supplier_stated,
        request_text=raw.get("request_text") if raw else req.request_text,
        store=store,
    )
    result.validation = validation

    # --- Step 5: Supplier Matching ---
    candidates = []
    excluded = []
    if interp.category_l1 and interp.category_l2:
        # Estimate contract value for restriction checks
        estimated_value = interp.budget_amount
        if interp.quantity and not estimated_value:
            estimated_value = 0  # Will be refined after pricing

        candidates, excluded = match_suppliers(
            category_l1=interp.category_l1,
            category_l2=interp.category_l2,
            delivery_countries=interp.delivery_countries,
            currency=interp.currency or "EUR",
            quantity=interp.quantity,
            data_residency_required=interp.data_residency_required,
            esg_required=interp.esg_requirement,
            contract_value=estimated_value,
            store=store,
        )
    result.suppliers_excluded = excluded

    # --- Step 7: Pricing & Scoring ---
    shortlist = []
    if candidates:
        shortlist = score_and_rank_suppliers(
            candidates=candidates,
            category_l1=interp.category_l1,
            category_l2=interp.category_l2,
            delivery_countries=interp.delivery_countries,
            quantity=interp.quantity,
            days_available=interp.days_until_required,
            preferred_supplier_name=interp.preferred_supplier_stated,
            incumbent_supplier_name=interp.incumbent_supplier,
            data_residency_required=interp.data_residency_required,
            store=store,
        )
    # --- Step 7b: Generate recommendation notes via LLM ---
    narration_context = {
        "category_l2": interp.category_l2,
        "currency": interp.currency,
        "budget": interp.budget_amount,
    }
    for s in shortlist:
        s.recommendation_note = generate_recommendation_note(
            supplier_name=s.supplier_name,
            rank=s.rank,
            total_price=s.total_price,
            currency=s.currency,
            quality_score=s.quality_score,
            risk_score=s.risk_score,
            esg_score=s.esg_score,
            lead_time_status=s.lead_time_feasible,
            is_preferred=s.preferred,
            is_incumbent=s.incumbent,
            capacity_exceeded=getattr(s, "capacity_exceeded", False),
            context=narration_context,
        )

    result.supplier_shortlist = shortlist

    # --- Step 3b: Post-matching feasibility validation ---
    # Budget/lead-time advisories now use only eligible suppliers (not excluded ones)
    if shortlist:
        validation = validate_feasibility(
            validation=validation,
            shortlist=shortlist,
            budget=interp.budget_amount,
            currency=interp.currency,
            quantity=interp.quantity,
            days_until_required=interp.days_until_required,
        )
        result.validation = validation

    # --- Step 6: Supplier Discovery ---
    result.supplier_discovery = discover_suppliers(
        shortlist=shortlist,
        excluded=excluded,
        quantity=interp.quantity,
        budget=interp.budget_amount,
        currency=interp.currency or "EUR",
        category_l1=interp.category_l1,
        category_l2=interp.category_l2,
        delivery_countries=interp.delivery_countries,
    )

    # --- Step 4: Policy Evaluation ---
    # Done after scoring so we can use actual_cost for threshold determination
    actual_cost = shortlist[0].total_price if shortlist else None
    if interp.category_l1 and interp.category_l2:
        policy_eval = evaluate_policies(
            category_l1=interp.category_l1,
            category_l2=interp.category_l2,
            delivery_countries=interp.delivery_countries,
            budget=interp.budget_amount,
            actual_cost=actual_cost,
            currency=interp.currency or "EUR",
            preferred_supplier=interp.preferred_supplier_stated,
            quantity=interp.quantity,
            store=store,
        )
        result.policy_evaluation = policy_eval
    else:
        policy_eval = result.policy_evaluation

    # --- Step 9: Escalation ---
    escalations = evaluate_escalations(
        validation=validation,
        policy_eval=policy_eval,
        shortlist=shortlist,
        quantity=interp.quantity,
        budget=interp.budget_amount,
        category_l1=interp.category_l1,
        category_l2=interp.category_l2,
        data_residency_required=interp.data_residency_required,
        delivery_countries=interp.delivery_countries,
    )
    result.escalations = escalations

    # --- Step 10: Recommendation ---
    result.recommendation = _build_recommendation(shortlist, escalations, interp, store)

    # --- Step 10b: Overall Narrative ---
    request_summary = {
        "category_l2": interp.category_l2,
        "quantity": interp.quantity,
        "budget_amount": interp.budget_amount,
        "currency": interp.currency,
        "delivery_countries": interp.delivery_countries,
    }
    result.recommendation.narrative = generate_overall_narrative(
        request_summary=request_summary,
        shortlist=shortlist,
        escalations=escalations,
        validation_issues=validation.issues_detected,
        preferred_supplier_name=interp.preferred_supplier_stated,
        incumbent_supplier_name=interp.incumbent_supplier,
    )

    # --- What-If Analysis ---
    result.what_if = compute_what_if(
        category_l1=interp.category_l1,
        category_l2=interp.category_l2,
        quantity=interp.quantity,
        budget=interp.budget_amount,
        currency=interp.currency or "EUR",
        delivery_countries=interp.delivery_countries,
        days_until_required=interp.days_until_required,
        data_residency_required=interp.data_residency_required,
        esg_requirement=interp.esg_requirement,
        preferred_supplier_name=interp.preferred_supplier_stated,
        incumbent_supplier_name=interp.incumbent_supplier,
        shortlist=shortlist,
        excluded=excluded,
    )

    # --- Audit Trail ---
    policies_checked = []
    if policy_eval.approval_threshold:
        policies_checked.append(policy_eval.approval_threshold.rule_applied)
    for cr in policy_eval.category_rules_applied:
        policies_checked.append(cr.rule_id)
    for gr in policy_eval.geography_rules_applied:
        policies_checked.append(gr.rule_id)
    for esc in escalations:
        if esc.rule not in policies_checked:
            policies_checked.append(esc.rule)

    supplier_ids_evaluated = [s.supplier_id for s in shortlist]
    supplier_ids_evaluated += [e.supplier_id for e in excluded]

    # Historical awards
    awards = store.awards_by_request.get(result.request_id, [])
    hist_note = None
    if awards:
        winner = next((a for a in awards if a["awarded"]), None)
        if winner:
            hist_note = (
                f"Historical award: {winner['supplier_name']} at "
                f"{winner['currency']} {winner['total_value']:,.2f}. "
                f"Escalation required: {winner['escalation_required']}."
            )

    result.audit_trail = AuditTrail(
        policies_checked=policies_checked,
        supplier_ids_evaluated=list(set(supplier_ids_evaluated)),
        pricing_tiers_applied=shortlist[0].pricing_tier_applied if shortlist else "N/A",
        historical_awards_consulted=bool(awards),
        historical_award_note=hist_note,
        parameter_overrides=_detect_overrides(req, raw),
    )

    result.missing_fields = _compute_missing_fields(interp, shortlist, excluded, validation)
    result.is_preview = any(f.required for f in result.missing_fields)

    return result


def process_request_streaming(req: ProcessRequest):
    """Generator that yields (step_name, detail, partial_result) tuples for SSE streaming."""
    store = get_store()
    result = PipelineResult(request_id=req.request_id or "NEW-REQUEST")
    result.processed_at = datetime.utcnow().isoformat() + "Z"

    # --- Step 1: Request Intake ---
    yield "intake", "Looking up request data...", None
    raw = None
    if req.request_id and req.request_id in store.requests:
        raw = store.requests[req.request_id]
        result.request_id = req.request_id
        intake_data = {
            "request_id": req.request_id,
            "category": f"{raw.get('category_l1', '?')}/{raw.get('category_l2', '?')}",
            "language": raw.get("request_language", "en"),
            "country": raw.get("country"),
            "title": raw.get("title", ""),
            "scenario_tags": raw.get("scenario_tags", []),
        }
        yield "intake", f"Found request {req.request_id}: {raw.get('category_l1', '?')}/{raw.get('category_l2', '?')}, language={raw.get('request_language', 'en')}", intake_data
    elif req.request_text:
        yield "intake", f"New free-text request: \"{req.request_text[:80]}{'...' if len(req.request_text or '') > 80 else ''}\"", {"request_text": req.request_text[:200], "type": "free_text"}
    else:
        yield "intake", "No request_id found and no free text provided", None

    # --- Step 2: Extraction & Translation ---
    is_non_english = raw and raw.get("request_language") and raw.get("request_language") != "en"
    is_freetext = not raw and req.request_text

    if is_non_english:
        yield "extraction", f"Translating from {raw['request_language']}...", None
    elif is_freetext:
        yield "extraction", "Using LLM to extract structured fields from free text...", None
    else:
        yield "extraction", "Parsing structured fields...", None

    interp = _build_interpretation(req, raw)
    result.request_interpretation = interp

    extraction_details = []
    if interp.translated_text:
        extraction_details.append(f"Translated: \"{interp.translated_text[:100]}...\"")
    extraction_details.append(f"Category: {interp.category_l1}/{interp.category_l2}")
    if interp.quantity:
        extraction_details.append(f"Quantity: {interp.quantity}")
    if interp.budget_amount:
        extraction_details.append(f"Budget: {interp.currency} {interp.budget_amount:,.2f}")
    if interp.delivery_countries:
        extraction_details.append(f"Delivery: {', '.join(interp.delivery_countries)}")
    if interp.contradictions:
        extraction_details.append(f"Contradictions found: {len(interp.contradictions)}")
    if interp.flexibility_signals:
        extraction_details.append(f"Flexibility signals: {', '.join(interp.flexibility_signals)}")
    extraction_details.append(f"Confidence: {interp.extraction_confidence:.0%}")
    extraction_data = {
        "category_l1": interp.category_l1,
        "category_l2": interp.category_l2,
        "quantity": interp.quantity,
        "budget_amount": interp.budget_amount,
        "currency": interp.currency,
        "delivery_countries": interp.delivery_countries,
        "required_by_date": interp.required_by_date,
        "days_until_required": interp.days_until_required,
        "preferred_supplier": interp.preferred_supplier_stated,
        "translated_text": interp.translated_text,
        "contradictions": interp.contradictions,
        "flexibility_signals": interp.flexibility_signals,
        "constraints": interp.constraints,
        "confidence": interp.extraction_confidence,
    }
    yield "extraction", " | ".join(extraction_details), extraction_data

    # --- Step 3: Validation ---
    yield "validation", "Running completeness and feasibility checks...", None
    validation = validate_request(
        category_l1=interp.category_l1,
        category_l2=interp.category_l2,
        quantity=interp.quantity,
        budget=interp.budget_amount,
        currency=interp.currency,
        required_by_date=interp.required_by_date,
        days_until_required=interp.days_until_required,
        delivery_countries=interp.delivery_countries,
        preferred_supplier=interp.preferred_supplier_stated,
        request_text=raw.get("request_text") if raw else req.request_text,
        store=store,
    )
    result.validation = validation

    # Separate real issues from adaptations
    real_issues = [i for i in (validation.issues_detected or []) if not i.type.startswith("auto_adapt_")]
    adaptations = [i for i in (validation.issues_detected or []) if i.type.startswith("auto_adapt_")]
    validation_data = {
        "completeness": validation.completeness,
        "issues": [
            {"type": i.type, "severity": i.severity, "description": i.description, "action": i.action_required}
            for i in real_issues
        ],
        "adaptations": [
            {"type": i.type, "description": i.description, "action": i.action_required}
            for i in adaptations
        ],
    }
    parts = []
    if adaptations:
        adapted_fields = [a.type.replace("auto_adapt_", "") for a in adaptations]
        parts.append(f"Auto-adapted for missing: {', '.join(adapted_fields)}")
    if real_issues:
        parts.append(f"{len(real_issues)} advisory note(s)")
    if not parts:
        parts.append("All checks passed")
    yield "validation", " | ".join(parts), validation_data

    # --- Step 4: Supplier Matching ---
    yield "matching", f"Searching suppliers for {interp.category_l1}/{interp.category_l2} delivering to {', '.join(interp.delivery_countries or ['?'])}...", None
    candidates = []
    excluded = []
    if interp.category_l1 and interp.category_l2:
        estimated_value = interp.budget_amount
        if interp.quantity and not estimated_value:
            estimated_value = 0
        candidates, excluded = match_suppliers(
            category_l1=interp.category_l1,
            category_l2=interp.category_l2,
            delivery_countries=interp.delivery_countries,
            currency=interp.currency or "EUR",
            quantity=interp.quantity,
            data_residency_required=interp.data_residency_required,
            esg_required=interp.esg_requirement,
            contract_value=estimated_value,
            store=store,
        )
    result.suppliers_excluded = excluded
    matching_data = {
        "candidates": [
            {"supplier_id": c["supplier_id"], "supplier_name": c["supplier_name"],
             "quality_score": c.get("quality_score"), "risk_score": c.get("risk_score"),
             "esg_score": c.get("esg_score"), "preferred": c.get("preferred_supplier", False)}
            for c in candidates[:10]
        ],
        "excluded": [
            {"supplier_id": e.supplier_id, "supplier_name": e.supplier_name, "reason": e.reason}
            for e in excluded
        ],
        "total_candidates": len(candidates),
        "total_excluded": len(excluded),
    }
    yield "matching", f"Found {len(candidates)} eligible supplier(s), excluded {len(excluded)}" + (f" ({', '.join(e.reason for e in excluded[:3])})" if excluded else ""), matching_data

    # --- Step 5: Pricing & Scoring ---
    shortlist = []
    is_unit_pricing = interp.quantity is None
    if candidates:
        pricing_mode = "per-unit prices" if is_unit_pricing else f"prices and composite scores for {len(candidates)} supplier(s)"
        yield "scoring", f"Computing {pricing_mode}...", None
        shortlist = score_and_rank_suppliers(
            candidates=candidates,
            category_l1=interp.category_l1,
            category_l2=interp.category_l2,
            delivery_countries=interp.delivery_countries,
            quantity=interp.quantity,
            days_available=interp.days_until_required,
            preferred_supplier_name=interp.preferred_supplier_stated,
            incumbent_supplier_name=interp.incumbent_supplier,
            data_residency_required=interp.data_residency_required,
            store=store,
        )
        if shortlist:
            if is_unit_pricing:
                ranking = " > ".join(f"{s.supplier_name} ({s.currency} {s.unit_price:,.0f}/unit)" for s in shortlist[:3])
            else:
                ranking = " > ".join(f"{s.supplier_name} ({s.currency} {s.total_price:,.0f})" for s in shortlist[:3])
            scoring_data = {
                "shortlist": [
                    {"rank": s.rank, "supplier_name": s.supplier_name, "supplier_id": s.supplier_id,
                     "total_price": s.total_price, "currency": s.currency, "unit_price": s.unit_price,
                     "quality_score": s.quality_score, "risk_score": s.risk_score, "esg_score": s.esg_score,
                     "composite_score": s.composite_score, "preferred": s.preferred, "incumbent": s.incumbent,
                     "lead_time_feasible": s.lead_time_feasible, "pricing_tier": s.pricing_tier_applied}
                    for s in shortlist
                ],
                "unit_pricing_mode": is_unit_pricing,
            }
            yield "scoring", f"Ranked {len(shortlist)} supplier(s): {ranking}", scoring_data
        else:
            yield "scoring", "No suppliers with valid pricing found — supplier discovery triggered", {"shortlist": [], "unit_pricing_mode": is_unit_pricing}
    else:
        yield "scoring", "No candidates to score — broadening search via supplier discovery", {"shortlist": [], "unit_pricing_mode": is_unit_pricing}

    # --- Step 5b: LLM Narration ---
    if shortlist:
        yield "narration", f"Generating audit-ready recommendation notes for {len(shortlist)} supplier(s)...", None
        narration_context = {
            "category_l2": interp.category_l2,
            "currency": interp.currency,
            "budget": interp.budget_amount,
        }
        for s in shortlist:
            s.recommendation_note = generate_recommendation_note(
                supplier_name=s.supplier_name,
                rank=s.rank,
                total_price=s.total_price,
                currency=s.currency,
                quality_score=s.quality_score,
                risk_score=s.risk_score,
                esg_score=s.esg_score,
                lead_time_status=s.lead_time_feasible,
                is_preferred=s.preferred,
                is_incumbent=s.incumbent,
                capacity_exceeded=getattr(s, "capacity_exceeded", False),
                context=narration_context,
            )
        narration_data = {
            "notes": [
                {"supplier_name": s.supplier_name, "note": s.recommendation_note}
                for s in shortlist if s.recommendation_note
            ],
        }
        yield "narration", f"Generated notes for {len(shortlist)} supplier(s)", narration_data

    result.supplier_shortlist = shortlist

    # --- Post-matching feasibility validation ---
    if shortlist:
        validation = validate_feasibility(
            validation=validation,
            shortlist=shortlist,
            budget=interp.budget_amount,
            currency=interp.currency,
            quantity=interp.quantity,
            days_until_required=interp.days_until_required,
        )
        result.validation = validation

    # --- Step 6: Supplier Discovery ---
    yield "discovery", "Checking if new supplier search is needed...", None
    discovery = discover_suppliers(
        shortlist=shortlist,
        excluded=excluded,
        quantity=interp.quantity,
        budget=interp.budget_amount,
        currency=interp.currency or "EUR",
        category_l1=interp.category_l1,
        category_l2=interp.category_l2,
        delivery_countries=interp.delivery_countries,
    )
    result.supplier_discovery = discovery
    discovery_data = {
        "triggered": discovery.triggered,
        "trigger_reason": discovery.trigger_reason,
        "suppliers": [
            {"name": d.name, "source": d.source, "estimated_capability": d.estimated_capability,
             "status": d.status}
            for d in discovery.discovered_suppliers
        ] if discovery.triggered else [],
    }
    if discovery.triggered:
        names = ", ".join(d.name for d in discovery.discovered_suppliers[:3])
        yield "discovery", f"Triggered ({discovery.trigger_reason}): found {len(discovery.discovered_suppliers)} potential new supplier(s) — {names}", discovery_data
    else:
        yield "discovery", "No discovery needed — sufficient supplier coverage", discovery_data

    # --- Step 7: Policy Evaluation ---
    yield "policy", "Evaluating approval thresholds, preferred suppliers, category & geography rules...", None
    actual_cost = shortlist[0].total_price if shortlist else None
    if interp.category_l1 and interp.category_l2:
        policy_eval = evaluate_policies(
            category_l1=interp.category_l1,
            category_l2=interp.category_l2,
            delivery_countries=interp.delivery_countries,
            budget=interp.budget_amount,
            actual_cost=actual_cost,
            currency=interp.currency or "EUR",
            preferred_supplier=interp.preferred_supplier_stated,
            quantity=interp.quantity,
            store=store,
        )
        result.policy_evaluation = policy_eval
    else:
        policy_eval = result.policy_evaluation

    policy_data = {
        "approval_threshold": {
            "rule": policy_eval.approval_threshold.rule_applied,
            "quotes_required": policy_eval.approval_threshold.quotes_required,
            "basis": policy_eval.approval_threshold.basis,
        } if policy_eval.approval_threshold else None,
        "preferred_supplier": {
            "supplier": policy_eval.preferred_supplier.supplier,
            "status": policy_eval.preferred_supplier.status,
        } if policy_eval.preferred_supplier else None,
        "category_rules": [
            {"rule_id": cr.rule_id, "rule_text": cr.rule_text, "applies": cr.applies}
            for cr in policy_eval.category_rules_applied
        ],
        "geography_rules": [
            {"rule_id": gr.rule_id, "rule_text": gr.rule_text, "applies": gr.applies}
            for gr in policy_eval.geography_rules_applied
        ],
    }
    policy_details = []
    if policy_eval.approval_threshold:
        policy_details.append(f"Threshold: {policy_eval.approval_threshold.rule_applied} ({policy_eval.approval_threshold.quotes_required} quotes)")
    if policy_eval.preferred_supplier:
        policy_details.append(f"Preferred: {policy_eval.preferred_supplier.supplier or 'none'} ({policy_eval.preferred_supplier.status})")
    policy_details.append(f"{len(policy_eval.category_rules_applied)} category rules, {len(policy_eval.geography_rules_applied)} geography rules")
    yield "policy", " | ".join(policy_details), policy_data

    # --- Step 7: Escalation ---
    yield "escalation", "Checking escalation rules (ER-001 through ER-008)...", None
    escalations = evaluate_escalations(
        validation=validation,
        policy_eval=policy_eval,
        shortlist=shortlist,
        quantity=interp.quantity,
        budget=interp.budget_amount,
        category_l1=interp.category_l1,
        category_l2=interp.category_l2,
        data_residency_required=interp.data_residency_required,
        delivery_countries=interp.delivery_countries,
    )
    result.escalations = escalations
    escalation_data = {
        "escalations": [
            {"rule": e.rule, "trigger": e.trigger, "escalate_to": e.escalate_to, "blocking": e.blocking}
            for e in escalations
        ],
        "total": len(escalations),
        "blocking_count": len([e for e in escalations if e.blocking]),
    }
    if escalations:
        blocking = [e for e in escalations if e.blocking]
        advisories = [e for e in escalations if not e.blocking]
        if blocking:
            yield "escalation", f"{len(blocking)} compliance block(s), {len(advisories)} advisory note(s)", escalation_data
        elif advisories:
            yield "escalation", f"{len(advisories)} advisory note(s) — no blockers", escalation_data
        else:
            yield "escalation", "No escalations triggered", escalation_data
    else:
        yield "escalation", "No escalations triggered", escalation_data

    # --- Step 8: Recommendation ---
    yield "recommendation", "Building final recommendation...", None
    result.recommendation = _build_recommendation(shortlist, escalations, interp, store)

    # --- Step 8b: Overall Narrative ---
    yield "narrative", "Generating audit-ready narrative summary...", None
    request_summary = {
        "category_l2": interp.category_l2,
        "quantity": interp.quantity,
        "budget_amount": interp.budget_amount,
        "currency": interp.currency,
        "delivery_countries": interp.delivery_countries,
    }
    result.recommendation.narrative = generate_overall_narrative(
        request_summary=request_summary,
        shortlist=shortlist,
        escalations=escalations,
        validation_issues=validation.issues_detected,
        preferred_supplier_name=interp.preferred_supplier_stated,
        incumbent_supplier_name=interp.incumbent_supplier,
    )
    recommendation_data = {
        "status": result.recommendation.status,
        "reason": result.recommendation.reason,
        "chosen_supplier": shortlist[0].supplier_name if shortlist else None,
        "total_price": shortlist[0].total_price if shortlist else None,
        "currency": shortlist[0].currency if shortlist else None,
        "narrative": result.recommendation.narrative,
    }
    yield "narrative", f"Status: {result.recommendation.status.replace('_', ' ').upper()}", recommendation_data

    # --- What-If Analysis ---
    yield "what_if", "Computing alternative scenarios...", None
    result.what_if = compute_what_if(
        category_l1=interp.category_l1,
        category_l2=interp.category_l2,
        quantity=interp.quantity,
        budget=interp.budget_amount,
        currency=interp.currency or "EUR",
        delivery_countries=interp.delivery_countries,
        days_until_required=interp.days_until_required,
        data_residency_required=interp.data_residency_required,
        esg_requirement=interp.esg_requirement,
        preferred_supplier_name=interp.preferred_supplier_stated,
        incumbent_supplier_name=interp.incumbent_supplier,
        shortlist=shortlist,
        excluded=excluded,
    )
    what_if_data = {
        "scenarios": [
            {"scenario": s["scenario"], "title": s["title"], "description": s["description"],
             "parameter": s.get("parameter"), "current_value": s.get("current_value"),
             "suggested_value": s.get("suggested_value"), "impact": s.get("impact")}
            for s in result.what_if
        ],
    }
    if result.what_if:
        summaries = "; ".join(s["title"] for s in result.what_if[:3])
        yield "what_if", f"{len(result.what_if)} scenario(s): {summaries}", what_if_data
    else:
        yield "what_if", "No improvement scenarios found — current parameters are optimal", what_if_data

    # --- Audit Trail ---
    yield "audit", "Assembling audit trail...", None
    policies_checked = []
    if policy_eval.approval_threshold:
        policies_checked.append(policy_eval.approval_threshold.rule_applied)
    for cr in policy_eval.category_rules_applied:
        policies_checked.append(cr.rule_id)
    for gr in policy_eval.geography_rules_applied:
        policies_checked.append(gr.rule_id)
    for esc in escalations:
        if esc.rule not in policies_checked:
            policies_checked.append(esc.rule)

    supplier_ids_evaluated = [s.supplier_id for s in shortlist]
    supplier_ids_evaluated += [e.supplier_id for e in excluded]

    awards = store.awards_by_request.get(result.request_id, [])
    hist_note = None
    if awards:
        winner = next((a for a in awards if a["awarded"]), None)
        if winner:
            hist_note = (
                f"Historical award: {winner['supplier_name']} at "
                f"{winner['currency']} {winner['total_value']:,.2f}. "
                f"Escalation required: {winner['escalation_required']}."
            )

    overrides = _detect_overrides(req, raw)
    result.audit_trail = AuditTrail(
        policies_checked=policies_checked,
        supplier_ids_evaluated=list(set(supplier_ids_evaluated)),
        pricing_tiers_applied=shortlist[0].pricing_tier_applied if shortlist else "N/A",
        historical_awards_consulted=bool(awards),
        historical_award_note=hist_note,
        parameter_overrides=overrides,
    )
    audit_data = {
        "policies_checked": policies_checked,
        "suppliers_evaluated": len(set(supplier_ids_evaluated)),
        "pricing_tier": shortlist[0].pricing_tier_applied if shortlist else "N/A",
        "historical_award": hist_note,
        "parameter_overrides": [
            {"field": o.field, "original": o.original_value, "new": o.new_value}
            for o in overrides
        ],
    }
    override_note = f", {len(overrides)} parameter override(s)" if overrides else ""
    yield "audit", f"Checked {len(policies_checked)} policies, evaluated {len(set(supplier_ids_evaluated))} suppliers{override_note}", audit_data

    # --- Compute missing fields ---
    result.missing_fields = _compute_missing_fields(interp, shortlist, excluded, validation)
    result.is_preview = any(f.required for f in result.missing_fields)

    # --- Done ---
    yield "done", "Pipeline complete", result


def _compute_missing_fields(
    interp: RequestInterpretation,
    shortlist: list,
    excluded: list,
    validation,
) -> list[MissingField]:
    """Determine what the user needs to provide for a complete procurement decision."""
    fields = []

    if not interp.category_l1 or not interp.category_l2:
        fields.append(MissingField(
            field="category",
            label="Product/Service Category",
            type="text",
            reason="Cannot identify suppliers without knowing what you need.",
            required=True,
        ))

    if interp.quantity is None:
        # Determine unit price range for helpful suggestion
        price_hint = ""
        if shortlist:
            prices = [s.unit_price for s in shortlist]
            price_hint = f" Unit prices range from {shortlist[0].currency} {min(prices):,.2f} to {max(prices):,.2f}."
        fields.append(MissingField(
            field="quantity",
            label="Quantity",
            type="number",
            reason=f"Showing per-unit pricing as preview. Quantity is needed to calculate total costs and check budget feasibility.{price_hint}",
            required=True,
        ))

    if not interp.delivery_countries:
        fields.append(MissingField(
            field="delivery_country",
            label="Delivery Country",
            type="text",
            reason="Delivery location determines which suppliers can serve you and affects pricing region.",
            required=True,
        ))

    if interp.budget_amount is None:
        # Provide suggestion based on shortlist
        suggestion = None
        if shortlist and interp.quantity:
            top_price = shortlist[0].total_price
            suggestion = f"{shortlist[0].currency} {top_price:,.0f}"
        fields.append(MissingField(
            field="budget_amount",
            label="Budget",
            type="number",
            reason="Budget is needed to verify cost feasibility and determine approval tier.",
            suggestion=suggestion,
            required=False,
        ))

    if not interp.required_by_date:
        fields.append(MissingField(
            field="required_by_date",
            label="Required By Date",
            type="date",
            reason="Delivery date is needed to check lead time feasibility. Currently assuming no deadline pressure.",
            required=False,
        ))

    # Budget contradiction / insufficient
    budget_issues = [i for i in (validation.issues_detected or [])
                     if i.type == "budget_advisory"]
    if budget_issues and interp.budget_amount is not None:
        # Suggest the minimum needed
        if shortlist:
            min_cost = shortlist[0].total_price
            fields.append(MissingField(
                field="budget_amount",
                label="Adjust Budget",
                type="number",
                reason=budget_issues[0].description,
                suggestion=f"{shortlist[0].currency} {min_cost:,.0f}",
                required=False,
            ))

    # Quantity contradiction
    if interp.contradictions:
        qty_contradictions = [c for c in interp.contradictions if "quantity" in c.lower()]
        if qty_contradictions:
            fields.append(MissingField(
                field="quantity",
                label="Confirm Quantity",
                type="number",
                reason=qty_contradictions[0],
                required=True,
            ))

    # Deduplicate by field name (keep first)
    seen = set()
    deduped = []
    for f in fields:
        if f.field not in seen:
            seen.add(f.field)
            deduped.append(f)
    return deduped


def _detect_overrides(req: ProcessRequest, raw: dict | None) -> list[ParameterOverride]:
    """Detect which fields the user changed from the original request."""
    overrides = []
    # Include frontend-provided overrides (from what-if scenario apply)
    if req.parameter_overrides:
        for o in req.parameter_overrides:
            overrides.append(ParameterOverride(
                field=o.get("field", ""),
                original_value=str(o.get("original_value", "")) if o.get("original_value") is not None else None,
                new_value=str(o.get("new_value", "")) if o.get("new_value") is not None else None,
            ))
    if not raw:
        return overrides
    existing_fields = {o.field for o in overrides}
    checks = [
        ("quantity", req.quantity, raw.get("quantity")),
        ("budget_amount", req.budget_amount, raw.get("budget_amount")),
        ("currency", req.currency, raw.get("currency")),
        ("category_l1", req.category_l1, raw.get("category_l1")),
        ("category_l2", req.category_l2, raw.get("category_l2")),
        ("required_by_date", req.required_by_date, raw.get("required_by_date")),
        ("preferred_supplier", req.preferred_supplier_mentioned, raw.get("preferred_supplier_mentioned")),
        ("delivery_countries", ",".join(req.delivery_countries) if req.delivery_countries else None,
         ",".join(raw.get("delivery_countries", []))),
    ]
    for field, new_val, orig_val in checks:
        if field in existing_fields:
            continue
        if new_val is not None and str(new_val) != str(orig_val):
            overrides.append(ParameterOverride(
                field=field,
                original_value=str(orig_val) if orig_val is not None else None,
                new_value=str(new_val),
            ))
    return overrides


def _calc_days_until(date_str: str) -> int | None:
    """Calculate days from now until the given YYYY-MM-DD date."""
    try:
        req_date = datetime.strptime(date_str, "%Y-%m-%d")
        return (req_date - datetime.utcnow()).days
    except (ValueError, TypeError):
        return None


def _build_interpretation(req: ProcessRequest, raw: dict | None) -> RequestInterpretation:
    """Build the request interpretation from either raw data or free-text input.
    Uses LLM for translation (non-English) and extraction (free-text)."""
    store = get_store()

    if raw:
        # From existing request in requests.json
        request_text = raw.get("request_text", "")
        original_language = raw.get("request_language")
        translated_text = None

        # Translate non-English requests
        if original_language and original_language != "en" and request_text:
            translation = translate_text(request_text, original_language)
            if translation.get("confidence", 0) > 0.5:
                translated_text = translation["translated_text"]

        # Use LLM to extract from request text and detect contradictions
        llm_fields = {}
        text_to_analyze = translated_text or request_text
        if text_to_analyze:
            llm_fields = extract_from_text(
                text_to_analyze,
                existing_fields={k: raw.get(k) for k in [
                    "category_l1", "category_l2", "quantity", "budget_amount",
                    "currency", "required_by_date", "preferred_supplier_mentioned",
                    "delivery_countries", "country",
                ]},
                categories=store.categories if hasattr(store, "categories") else [],
            )

        required_by = raw.get("required_by_date")
        days_until = None
        if required_by and raw.get("created_at"):
            try:
                created = datetime.fromisoformat(raw["created_at"].replace("Z", ""))
                req_date = datetime.strptime(required_by, "%Y-%m-%d")
                days_until = (req_date - created).days
            except (ValueError, TypeError):
                pass

        # Detect contradictions between structured fields and text
        contradictions = []
        text_qty = llm_fields.get("text_quantity")
        struct_qty = raw.get("quantity")
        if text_qty and struct_qty and text_qty != struct_qty:
            contradictions.append(
                f"Quantity mismatch: form says {struct_qty}, text says {text_qty}"
            )
        text_budget = llm_fields.get("text_budget")
        struct_budget = raw.get("budget_amount")
        if text_budget and struct_budget and abs(text_budget - struct_budget) > 1:
            contradictions.append(
                f"Budget mismatch: form says {struct_budget}, text says {text_budget}"
            )

        # For existing requests, structured fields are trusted (confidence=1.0)
        # Only lower if LLM found contradictions
        confidence = 0.9 if contradictions else 1.0

        # User-provided overrides (from reprocess) take priority over raw data
        return RequestInterpretation(
            category_l1=req.category_l1 or raw.get("category_l1"),
            category_l2=req.category_l2 or raw.get("category_l2"),
            quantity=req.quantity if req.quantity is not None else raw.get("quantity"),
            unit_of_measure=raw.get("unit_of_measure"),
            budget_amount=req.budget_amount if req.budget_amount is not None else raw.get("budget_amount"),
            currency=req.currency or raw.get("currency"),
            delivery_countries=req.delivery_countries if req.delivery_countries else raw.get("delivery_countries", []),
            required_by_date=req.required_by_date or required_by,
            days_until_required=_calc_days_until(req.required_by_date) if req.required_by_date else days_until,
            data_residency_required=raw.get("data_residency_constraint", False),
            esg_requirement=raw.get("esg_requirement", False),
            preferred_supplier_stated=req.preferred_supplier_mentioned or raw.get("preferred_supplier_mentioned"),
            incumbent_supplier=raw.get("incumbent_supplier"),
            original_language=original_language,
            translated_text=translated_text,
            extraction_confidence=confidence,
            contradictions=contradictions if contradictions else None,
            flexibility_signals=llm_fields.get("flexibility_signals"),
            constraints=llm_fields.get("constraints"),
        )
    else:
        # From free-text input — use LLM to extract structured fields
        request_text = req.request_text or ""
        llm_fields = {}
        confidence = 0.5

        if request_text:
            # Build existing fields from whatever the user provided
            existing = {}
            for field in ["category_l1", "category_l2", "quantity", "budget_amount",
                          "currency", "country"]:
                val = getattr(req, field, None)
                if val is not None:
                    existing[field] = val

            llm_fields = extract_from_text(
                request_text,
                existing_fields=existing,
                categories=store.categories if hasattr(store, "categories") else [],
            )
            confidence = llm_fields.get("confidence", 0.6)

        # Merge: user-provided fields take priority, LLM fills gaps
        category_l1 = req.category_l1 or llm_fields.get("category_l1")
        category_l2 = req.category_l2 or llm_fields.get("category_l2")
        quantity = req.quantity or llm_fields.get("quantity") or llm_fields.get("text_quantity")
        budget = req.budget_amount or llm_fields.get("budget_amount") or llm_fields.get("text_budget")
        currency = req.currency or llm_fields.get("currency", "EUR")
        required_by = req.required_by_date or llm_fields.get("required_by_date") or llm_fields.get("text_date")
        preferred = req.preferred_supplier_mentioned or llm_fields.get("preferred_supplier") or llm_fields.get("text_preferred_supplier")
        delivery = req.delivery_countries or ([req.country] if req.country else
                   llm_fields.get("delivery_countries", []))

        days_until = None
        if required_by:
            try:
                req_date = datetime.strptime(required_by, "%Y-%m-%d")
                days_until = (req_date - datetime.utcnow()).days
            except (ValueError, TypeError):
                pass

        return RequestInterpretation(
            category_l1=category_l1,
            category_l2=category_l2,
            quantity=quantity,
            budget_amount=budget,
            currency=currency,
            delivery_countries=delivery,
            required_by_date=required_by,
            days_until_required=days_until,
            preferred_supplier_stated=preferred,
            extraction_confidence=confidence,
            flexibility_signals=llm_fields.get("flexibility_signals"),
            constraints=llm_fields.get("constraints"),
        )


def _build_recommendation(
    shortlist: list,
    escalations: list,
    interp: RequestInterpretation,
    store: DataStore,
) -> Recommendation:
    """Build the final recommendation based on shortlist and escalations.

    Self-healing: only compliance blocks produce cannot_proceed.
    Everything else resolves to recommend or recommend_with_escalation.
    Explains: why the winner won, preferred/incumbent trade-offs, historical context.
    """
    blocking = [e for e in escalations if e.blocking]
    advisories = [e for e in escalations if not e.blocking]
    is_unit_pricing = interp.quantity is None

    if blocking:
        top_supplier = shortlist[0].supplier_name if shortlist else None
        return Recommendation(
            status="cannot_proceed",
            reason=f"Compliance review required: " + "; ".join(e.trigger for e in blocking[:2]),
            preferred_supplier_if_resolved=top_supplier,
            preferred_supplier_rationale=(
                f"{top_supplier} is the top-ranked supplier once compliance is cleared."
                if top_supplier else None
            ),
            minimum_budget_required=shortlist[0].total_price if shortlist else None,
            minimum_budget_currency=interp.currency,
        )
    elif shortlist:
        winner = shortlist[0]
        unit_note = " (per-unit pricing — provide quantity for total cost)" if is_unit_pricing else ""

        # Build reason that explains trade-offs
        reason_parts = [
            f"Recommended: {winner.supplier_name} at "
            f"{winner.currency} {winner.total_price:,.2f}{unit_note}."
        ]

        # Explain WHY the winner won — cite the dominant scoring factors
        strengths = []
        if len(shortlist) > 1:
            runner = shortlist[1]
            if winner.total_price <= runner.total_price:
                savings = runner.total_price - winner.total_price
                strengths.append(f"lowest price (saves {winner.currency} {savings:,.0f} vs #{2})")
            if winner.quality_score >= runner.quality_score:
                strengths.append(f"quality {winner.quality_score}/100")
            if winner.risk_score <= runner.risk_score:
                tier = winner.risk_composite.tier if winner.risk_composite else "N/A"
                strengths.append(f"risk tier {tier}")
        else:
            strengths.append(f"quality {winner.quality_score}/100")
            tier = winner.risk_composite.tier if winner.risk_composite else "N/A"
            strengths.append(f"risk tier {tier}")
        if winner.lead_time_feasible == "standard":
            strengths.append("standard delivery")
        reason_parts.append(f"Ranked #1 on: {', '.join(strengths)} (fit score {winner.composite_score * 100:.1f}%).")

        # Historical context for the winner
        winner_awards = [a for a in store.historical_awards if a["supplier_id"] == winner.supplier_id]
        if winner_awards:
            wins = len([a for a in winner_awards if a["awarded"]])
            total = len(winner_awards)
            reason_parts.append(f"Track record: {wins}/{total} past awards ({wins/total*100:.0f}% win rate).")

        # Explain if winner differs from stated preferred supplier
        pref_name = interp.preferred_supplier_stated
        if pref_name and pref_name != winner.supplier_name:
            pref_entry = next((s for s in shortlist if s.supplier_name == pref_name), None)
            if pref_entry:
                price_diff = pref_entry.total_price - winner.total_price
                reason_parts.append(
                    f"Preferred supplier {pref_name} ranked #{pref_entry.rank} "
                    f"({pref_entry.currency} {pref_entry.total_price:,.2f}, "
                    f"+{pref_entry.currency} {price_diff:,.2f}) — "
                    f"outranked on price and fit score "
                    f"({winner.composite_score * 100:.1f}% vs {pref_entry.composite_score * 100:.1f}%)."
                )
            else:
                reason_parts.append(
                    f"Stated preferred supplier {pref_name} was not in the shortlist "
                    f"(excluded during matching or not eligible for this category/region)."
                )

        # Explain if winner differs from incumbent
        inc_name = interp.incumbent_supplier
        if inc_name and inc_name != winner.supplier_name and inc_name != pref_name:
            inc_entry = next((s for s in shortlist if s.supplier_name == inc_name), None)
            if inc_entry:
                reason_parts.append(
                    f"Incumbent {inc_name} ranked #{inc_entry.rank} "
                    f"({inc_entry.currency} {inc_entry.total_price:,.2f})."
                )
            else:
                reason_parts.append(
                    f"Incumbent {inc_name} was excluded "
                    f"(not eligible for this category/region)."
                )

        # Warn if no supplier can meet the deadline
        all_infeasible = all(s.lead_time_feasible == "infeasible" for s in shortlist)
        any_expedited_only = any(s.lead_time_feasible == "expedited_only" for s in shortlist)
        if all_infeasible and interp.days_until_required is not None:
            fastest = min(shortlist, key=lambda s: s.expedited_lead_time_days)
            reason_parts.append(
                f"WARNING: No supplier can deliver within the requested {interp.days_until_required} days. "
                f"Fastest option is {fastest.supplier_name} at {fastest.expedited_lead_time_days} days (expedited). "
                f"Consider extending the deadline or negotiating expedited terms directly."
            )
        elif any_expedited_only and not any(s.lead_time_feasible == "standard" for s in shortlist):
            reason_parts.append(
                f"Note: All suppliers require expedited delivery to meet the {interp.days_until_required}-day deadline. "
                f"Expect premium pricing."
            )

        if advisories:
            reason_parts.append(f"{len(advisories)} advisory note(s) for review.")

        status = "recommend_with_escalation" if (advisories or all_infeasible) else "recommend"
        return Recommendation(
            status=status,
            reason=" ".join(reason_parts),
            preferred_supplier_if_resolved=winner.supplier_name,
        )
    else:
        return Recommendation(
            status="recommend_with_escalation",
            reason="No suppliers matched current filters. Supplier discovery triggered — "
                   "consider broadening delivery region or relaxing requirements. "
                   "See what-if scenarios for alternatives.",
        )
