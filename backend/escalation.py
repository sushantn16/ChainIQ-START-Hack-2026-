"""
Step 9: Escalation Engine — deterministic rules for when human oversight is required.

Self-healing philosophy:
- Only block for TRUE compliance violations (restricted supplier, sanctions, data residency)
- Budget/lead-time/missing-info issues are warnings with suggestions, not blockers
- The pipeline always produces a usable result
"""

from backend.models import (
    Escalation, Validation, PolicyEvaluation, SupplierShortlistEntry,
)


def evaluate_escalations(
    validation: Validation,
    policy_eval: PolicyEvaluation,
    shortlist: list[SupplierShortlistEntry],
    quantity: int | None,
    budget: float | None,
    category_l1: str | None,
    category_l2: str | None,
    data_residency_required: bool,
    delivery_countries: list[str],
) -> list[Escalation]:
    """Check all escalation rules and return triggered escalations."""
    escalations = []
    esc_counter = 0

    def add_esc(rule: str, trigger: str, target: str, blocking: bool):
        nonlocal esc_counter
        esc_counter += 1
        escalations.append(Escalation(
            escalation_id=f"ESC-{esc_counter:03d}",
            rule=rule,
            trigger=trigger,
            escalate_to=target,
            blocking=blocking,
        ))

    # ER-002: Preferred supplier is restricted — TRUE compliance block
    if policy_eval.preferred_supplier:
        pref = policy_eval.preferred_supplier
        if pref.status == "not_eligible" and pref.is_restricted:
            add_esc(
                "ER-002",
                f"Preferred supplier '{pref.supplier}' is restricted: {pref.policy_note}",
                "Procurement Manager",
                blocking=True,
            )

    # ER-003: Value exceeds threshold (tier 4+) — advisory, not blocking
    if policy_eval.approval_threshold:
        at = policy_eval.approval_threshold
        if at.deviation_approval in ["Head of Strategic Sourcing", "CPO"]:
            add_esc(
                "ER-003",
                f"Contract value in tier {at.rule_applied}: {at.basis}. "
                f"Requires {at.deviation_approval} approval.",
                at.deviation_approval,
                blocking=False,
            )

    # ER-004: No compliant supplier found — advisory with suggestions
    if not shortlist:
        add_esc(
            "ER-004",
            "No compliant supplier found. Consider broadening delivery region or relaxing filters. "
            "Supplier discovery has been triggered automatically.",
            "Head of Category",
            blocking=False,
        )

    # ER-005: Data residency constraint cannot be satisfied — TRUE compliance block
    # Note: supplier_matcher already excludes non-data-residency suppliers when required,
    # so an empty shortlist with data_residency_required means no supplier can satisfy it.
    if data_residency_required and not shortlist:
        add_esc(
            "ER-005",
            "Data residency constraint cannot be satisfied by any available supplier.",
            "Security and Compliance Review",
            blocking=True,
        )

    # ER-BUDGET: Top-ranked supplier exceeds stated budget — advisory
    if budget and shortlist and shortlist[0].total_price > budget:
        top = shortlist[0]
        overage = top.total_price - budget
        overage_pct = (overage / budget) * 100
        # Check if any supplier is within budget
        within_budget = [s for s in shortlist if s.total_price <= budget]
        if within_budget:
            alt = within_budget[0]
            add_esc(
                "ER-BUDGET",
                f"Top-ranked supplier '{top.supplier_name}' costs {top.currency} {top.total_price:,.2f}, "
                f"which is {overage_pct:.0f}% over the stated budget of {top.currency} {budget:,.2f}. "
                f"'{alt.supplier_name}' (#{alt.rank}) fits within budget at {top.currency} {alt.total_price:,.2f}.",
                "Procurement Manager",
                blocking=False,
            )
        else:
            add_esc(
                "ER-BUDGET",
                f"All shortlisted suppliers exceed the stated budget of {top.currency} {budget:,.2f}. "
                f"Cheapest option is '{top.supplier_name}' at {top.currency} {top.total_price:,.2f} "
                f"({overage_pct:.0f}% over). Consider increasing budget or adjusting requirements.",
                "Procurement Manager",
                blocking=False,
            )

    # ER-006: Quantity exceeds supplier capacity — advisory
    capacity_risks = [s for s in shortlist if s.capacity_exceeded]
    if capacity_risks:
        names = ", ".join(s.supplier_name for s in capacity_risks)
        add_esc(
            "ER-006",
            f"Requested quantity may exceed monthly capacity for: {names}. "
            f"Consider phased delivery or splitting the order.",
            "Sourcing Excellence Lead",
            blocking=False,
        )

    # ER-007: Brand safety (Marketing / Influencer) — advisory
    if (category_l1 or "").lower() == "marketing" and (category_l2 or "").lower() == "influencer campaign management":
        add_esc(
            "ER-007",
            "Influencer campaign requires brand-safety review before final award.",
            "Marketing Governance Lead",
            blocking=False,
        )

    # ER-LEAD: Lead time infeasibility — advisory
    if shortlist:
        infeasible = [s for s in shortlist if s.lead_time_feasible == "infeasible"]
        expedited_only = [s for s in shortlist if s.lead_time_feasible == "expedited_only"]
        if len(infeasible) == len(shortlist):
            add_esc(
                "ER-LEAD",
                f"No supplier can meet the requested deadline — all {len(shortlist)} supplier(s) "
                f"have infeasible lead times. Consider extending the delivery date.",
                "Sourcing Excellence Lead",
                blocking=False,
            )
        elif infeasible:
            names = ", ".join(s.supplier_name for s in infeasible)
            add_esc(
                "ER-LEAD",
                f"{len(infeasible)} supplier(s) cannot meet deadline ({names}). "
                f"{len(shortlist) - len(infeasible)} supplier(s) can still deliver on time.",
                "Sourcing Excellence Lead",
                blocking=False,
            )
        elif len(expedited_only) == len(shortlist):
            add_esc(
                "ER-LEAD",
                f"All {len(shortlist)} supplier(s) require expedited shipping to meet the deadline. "
                f"Expedited pricing will apply — see per-supplier cost details.",
                "Sourcing Excellence Lead",
                blocking=False,
            )

    # ER-RISK: Top-ranked supplier has elevated/high risk tier — advisory
    if shortlist and shortlist[0].risk_composite:
        rc = shortlist[0].risk_composite
        if rc.tier in ("elevated", "high"):
            flag_summary = "; ".join(rc.flags[:2]) if rc.flags else f"composite risk {rc.total}/100"
            add_esc(
                "ER-RISK",
                f"Top-ranked supplier '{shortlist[0].supplier_name}' has {rc.tier} risk "
                f"(score {rc.total}/100). {flag_summary}.",
                "Risk & Compliance Lead" if rc.tier == "high" else "Sourcing Excellence Lead",
                blocking=False,
            )

    # ER-008: Delivery in regulated non-EU markets — advisory
    non_eu_countries = {"US", "CA", "BR", "MX", "SG", "AU", "IN", "JP", "UAE", "ZA"}
    regulated = [c for c in delivery_countries if c in non_eu_countries]
    if regulated and shortlist:
        add_esc(
            "ER-008",
            f"Delivery includes regulated markets ({', '.join(regulated)}). "
            f"Verify supplier sanction screening before award.",
            "Regional Compliance Lead",
            blocking=False,
        )

    # Deduplicate by rule (keep first occurrence)
    seen_rules = set()
    deduped = []
    for e in escalations:
        key = (e.rule, e.escalate_to)
        if key not in seen_rules:
            seen_rules.add(key)
            deduped.append(e)

    return deduped
