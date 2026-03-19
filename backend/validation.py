"""
Step 3: Validation Engine — completeness, feasibility, and consistency checks.

Self-healing philosophy:
- Missing date/budget/quantity are NOT errors — the pipeline adapts around them
- Only truly blocking issues are marked critical (missing category, restricted supplier)
- Everything else is informational with actionable suggestions
"""

from backend.data_loader import DataStore
from backend.models import Validation, ValidationIssue


def validate_request(
    category_l1: str | None,
    category_l2: str | None,
    quantity: int | None,
    budget: float | None,
    currency: str | None,
    required_by_date: str | None,
    days_until_required: int | None,
    delivery_countries: list[str],
    preferred_supplier: str | None,
    request_text: str | None,
    store: DataStore,
) -> Validation:
    """Run all validation checks and return issues."""
    issues = []
    issue_counter = 0

    def add_issue(severity: str, issue_type: str, desc: str, action: str):
        nonlocal issue_counter
        issue_counter += 1
        issues.append(ValidationIssue(
            issue_id=f"V-{issue_counter:03d}",
            severity=severity,
            type=issue_type,
            description=desc,
            action_required=action,
        ))

    # 1. Category is the only truly critical missing field — without it we can't match suppliers
    if not category_l1 or not category_l2:
        add_issue(
            "critical",
            "missing_category",
            "Category could not be determined from the request.",
            "Please specify a product or service category so we can identify suppliers.",
        )

    # 2. Informational notes about missing optional fields (NOT errors)
    adaptations = []
    if quantity is None:
        adaptations.append("quantity")
        add_issue(
            "info",
            "auto_adapt_quantity",
            "No quantity specified — pricing will be shown per unit.",
            "Provide a quantity for total cost estimates. Proceeding with per-unit pricing.",
        )
    if budget is None:
        adaptations.append("budget")
        add_issue(
            "info",
            "auto_adapt_budget",
            "No budget specified — all suppliers will be shown without budget filtering.",
            "Provide a budget to enable cost feasibility checks.",
        )
    if not required_by_date:
        adaptations.append("deadline")
        add_issue(
            "info",
            "auto_adapt_deadline",
            "No delivery date specified — all lead times will be considered feasible.",
            "Provide a required-by date to enable lead time feasibility checks.",
        )

    # 3. Category validity
    if category_l1 and category_l2:
        if (category_l1, category_l2) not in store.category_set:
            # Try to find closest match
            close = [
                f"{c1}/{c2}" for (c1, c2) in store.category_set
                if c1 == category_l1 or c2.lower() in category_l2.lower() or category_l2.lower() in c2.lower()
            ]
            suggestion = f" Closest matches: {', '.join(close[:3])}" if close else ""
            add_issue(
                "high",
                "invalid_category",
                f"Category {category_l1}/{category_l2} is not in the taxonomy.{suggestion}",
                "Verify correct category classification.",
            )

    # 4. Budget and lead-time feasibility are checked AFTER supplier matching
    #    via validate_feasibility() — so they only consider eligible suppliers.

    # 5. Quantity/text contradiction detection
    if request_text and quantity is not None:
        import re
        matches = re.findall(r'(\d[\d,]*)\s*(?:laptop|device|unit|monitor|chair|desk|station|phone|tablet|day|hour|seat|set|project|campaign|workstation|license)', request_text.lower())
        if matches:
            text_qty = int(matches[0].replace(",", ""))
            if text_qty != quantity and abs(text_qty - quantity) > 1:
                add_issue(
                    "high",
                    "quantity_text_mismatch",
                    f"Quantity field says {quantity} but request text mentions {text_qty}.",
                    f"Using {quantity} from structured fields. Verify with requester if {text_qty} was intended.",
                )

    # Completeness: only fail if category is missing (the only true blocker)
    completeness = "fail" if any(i.severity == "critical" for i in issues) else "pass"
    return Validation(completeness=completeness, issues_detected=issues)


def validate_feasibility(
    validation: Validation,
    shortlist: list,
    budget: float | None,
    currency: str | None,
    quantity: int | None,
    days_until_required: int | None,
) -> Validation:
    """Post-matching feasibility checks using only eligible suppliers.

    Appends budget and lead-time advisories to the existing validation.
    Must be called after supplier matching and scoring.
    """
    if not shortlist:
        return validation

    issues = list(validation.issues_detected)
    issue_counter = len(issues)

    def add_issue(severity: str, issue_type: str, desc: str, action: str):
        nonlocal issue_counter
        issue_counter += 1
        issues.append(ValidationIssue(
            issue_id=f"V-{issue_counter:03d}",
            severity=severity,
            type=issue_type,
            description=desc,
            action_required=action,
        ))

    # Budget feasibility — based on eligible suppliers only
    if budget is not None and quantity is not None and quantity > 0:
        cheapest_unit = min(s.unit_price for s in shortlist)
        cheapest_supplier = min(shortlist, key=lambda s: s.unit_price)
        min_cost = cheapest_unit * quantity
        if min_cost > budget:
            shortfall = min_cost - budget
            max_affordable_qty = int(budget / cheapest_unit) if cheapest_unit > 0 else 0
            add_issue(
                "medium",
                "budget_advisory",
                f"Budget of {currency} {budget:,.2f} is {currency} {shortfall:,.2f} below the cheapest "
                f"eligible supplier ({cheapest_supplier.supplier_name} at "
                f"{currency} {min_cost:,.2f} for {quantity} units).",
                f"Options: increase budget to {currency} {min_cost:,.2f}, "
                f"or reduce quantity to {max_affordable_qty} units. "
                f"Proceeding with full supplier comparison.",
            )

    # Lead time feasibility — based on eligible suppliers only
    if days_until_required is not None:
        min_expedited = min(s.expedited_lead_time_days for s in shortlist)
        fastest_supplier = min(shortlist, key=lambda s: s.expedited_lead_time_days)
        if days_until_required < min_expedited:
            add_issue(
                "medium",
                "lead_time_advisory",
                f"Requested delivery in {days_until_required} days. "
                f"Fastest eligible supplier ({fastest_supplier.supplier_name}) "
                f"needs {min_expedited} days even with expedited delivery.",
                "Consider extending the deadline or accepting expedited pricing. "
                "Suppliers ranked by closest lead time.",
            )
        elif days_until_required < min_expedited + 5:
            add_issue(
                "low",
                "lead_time_tight",
                f"Tight timeline: {days_until_required} days available, "
                f"fastest expedited is {min_expedited} days ({fastest_supplier.supplier_name}).",
                "Expedited delivery may be required. Budget for premium pricing.",
            )

    return Validation(
        completeness=validation.completeness,
        issues_detected=issues,
    )
