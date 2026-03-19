"""
Step 3: Validation Engine — completeness, feasibility, and consistency checks.

Self-healing philosophy:
- Missing date/budget/quantity are NOT errors — the pipeline adapts around them
- Only truly blocking issues are marked critical (missing category, restricted supplier)
- Everything else is informational with actionable suggestions
"""

from backend.data_loader import DataStore
from backend.models import Validation, ValidationIssue
from backend.supplier_matcher import get_region_for_country


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

    # 4. Budget feasibility — advisory, not blocking
    if budget is not None and quantity is not None and category_l1 and category_l2 and quantity > 0:
        cheapest = _find_cheapest_unit_price(
            category_l1, category_l2, delivery_countries, quantity, store,
        )
        if cheapest is not None:
            min_cost = cheapest * quantity
            if min_cost > budget:
                shortfall = min_cost - budget
                max_affordable_qty = int(budget / cheapest) if cheapest > 0 else 0
                add_issue(
                    "medium",
                    "budget_advisory",
                    f"Budget of {currency} {budget:,.2f} is {currency} {shortfall:,.2f} below the minimum "
                    f"cost of {currency} {min_cost:,.2f} for {quantity} units.",
                    f"Options: increase budget to {currency} {min_cost:,.2f}, "
                    f"or reduce quantity to {max_affordable_qty} units. "
                    f"Proceeding with full supplier comparison.",
                )

    # 5. Lead time feasibility — advisory
    if days_until_required is not None and category_l1 and category_l2:
        min_expedited = _find_min_expedited_lead_time(
            category_l1, category_l2, delivery_countries, store,
        )
        if min_expedited is not None:
            if days_until_required < min_expedited:
                add_issue(
                    "medium",
                    "lead_time_advisory",
                    f"Requested delivery in {days_until_required} days. "
                    f"Fastest option is {min_expedited} days.",
                    "Consider extending the deadline or accepting expedited pricing. "
                    "Suppliers ranked by closest lead time.",
                )
            elif days_until_required < min_expedited + 5:
                add_issue(
                    "low",
                    "lead_time_tight",
                    f"Tight timeline: {days_until_required} days available, "
                    f"fastest expedited is {min_expedited} days.",
                    "Expedited delivery may be required. Budget for premium pricing.",
                )

    # 6. Quantity/text contradiction detection
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


def _find_cheapest_unit_price(
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    quantity: int,
    store: DataStore,
) -> float | None:
    """Find the cheapest unit price across all suppliers for this category+quantity."""
    region = get_region_for_country(delivery_countries[0]) if delivery_countries else "EU"
    cheapest = None

    for p in store.pricing:
        if p["category_l1"] != category_l1 or p["category_l2"] != category_l2:
            continue
        if p["region"] != region:
            continue
        if p["min_quantity"] <= quantity <= p["max_quantity"]:
            if cheapest is None or p["unit_price"] < cheapest:
                cheapest = p["unit_price"]

    return cheapest


def _find_min_expedited_lead_time(
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    store: DataStore,
) -> int | None:
    """Find the minimum expedited lead time across all suppliers."""
    region = get_region_for_country(delivery_countries[0]) if delivery_countries else "EU"
    min_lead = None

    for p in store.pricing:
        if p["category_l1"] != category_l1 or p["category_l2"] != category_l2:
            continue
        if p["region"] != region:
            continue
        if min_lead is None or p["expedited_lead_time_days"] < min_lead:
            min_lead = p["expedited_lead_time_days"]

    return min_lead
