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
    if data_residency_required and not shortlist:
        add_esc(
            "ER-005",
            "Data residency constraint cannot be satisfied by any available supplier.",
            "Security and Compliance Review",
            blocking=True,
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
    if category_l1 == "Marketing" and category_l2 == "Influencer Campaign Management":
        add_esc(
            "ER-007",
            "Influencer campaign requires brand-safety review before final award.",
            "Marketing Governance Lead",
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

    # Budget advisory — NOT blocking, just a note
    budget_issues = [i for i in validation.issues_detected
                     if i.type == "budget_advisory"]
    if budget_issues:
        add_esc(
            "ER-BUDGET",
            f"Budget advisory: {budget_issues[0].description} "
            f"See what-if scenarios for alternatives.",
            "Requester Review",
            blocking=False,
        )

    # Lead time advisory — NOT blocking
    lead_issues = [i for i in validation.issues_detected
                   if i.type == "lead_time_advisory"]
    if lead_issues:
        all_infeasible = all(s.lead_time_feasible == "infeasible" for s in shortlist) if shortlist else False
        add_esc(
            "ER-TIMELINE",
            f"Timeline advisory: {lead_issues[0].description} "
            + ("All suppliers exceed deadline — expedited pricing shown." if all_infeasible
               else "Some suppliers can meet deadline with expedited delivery."),
            "Requester Review",
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
