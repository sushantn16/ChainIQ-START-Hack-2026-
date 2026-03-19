"""
Step 4: Policy Engine — deterministic rule application.
Handles: approval thresholds, preferred/restricted suppliers, category rules, geography rules.
"""

from backend.data_loader import DataStore
from backend.models import (
    ApprovalThreshold, PreferredSupplierEval, CategoryRuleApplied,
    GeographyRuleApplied, PolicyEvaluation,
)


def determine_approval_threshold(
    budget: float | None,
    actual_cost: float | None,
    currency: str,
    policies: dict,
) -> ApprovalThreshold:
    """Find the correct approval tier. Uses actual_cost if budget is insufficient."""
    # Use the higher of budget and actual_cost for tier determination
    value = max(budget or 0, actual_cost or 0)
    if value == 0 and budget:
        value = budget

    thresholds = policies.get("approval_thresholds", [])
    matched = None
    for t in thresholds:
        if t.get("currency") != currency:
            continue
        min_amt = t.get("min_amount", 0)
        max_amt = t.get("max_amount", 999_999_999.99)
        if min_amt <= value <= max_amt:
            matched = t
            break

    if not matched:
        # Fallback: use highest tier for currency
        currency_thresholds = [t for t in thresholds if t.get("currency") == currency]
        if currency_thresholds:
            matched = currency_thresholds[-1]
        else:
            return ApprovalThreshold(
                rule_applied="UNKNOWN",
                basis=f"No threshold found for {currency} at value {value}",
                quotes_required=3,
                approvers=["procurement"],
            )

    deviation = matched.get("deviation_approval_required_from", [])
    return ApprovalThreshold(
        rule_applied=matched["threshold_id"],
        basis=f"Contract value {value:,.2f} {currency} falls in tier {matched['threshold_id']}",
        quotes_required=matched.get("min_supplier_quotes", 1),
        approvers=matched.get("managed_by", []),
        deviation_approval=deviation[0] if deviation else None,
        note=matched.get("policy_note"),
    )


def check_preferred_supplier(
    preferred_name: str | None,
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    store: DataStore,
) -> PreferredSupplierEval:
    """Check if the mentioned preferred supplier is valid for this request."""
    if not preferred_name:
        return PreferredSupplierEval(
            supplier=None,
            status="not_stated",
            policy_note="No preferred supplier mentioned by requester",
        )

    policies = store.policies
    preferred_list = policies.get("preferred_suppliers", [])

    # Find supplier in master data
    supplier_rows = [s for s in store.suppliers if s["supplier_name"] == preferred_name]
    if not supplier_rows:
        return PreferredSupplierEval(
            supplier=preferred_name,
            status="not_eligible",
            policy_note=f"Supplier '{preferred_name}' not found in supplier master data",
        )

    # Check if supplier serves this category
    matching_cat = [s for s in supplier_rows if s["category_l1"] == category_l1 and s["category_l2"] == category_l2]
    if not matching_cat:
        served_cats = set((s["category_l1"], s["category_l2"]) for s in supplier_rows)
        return PreferredSupplierEval(
            supplier=preferred_name,
            status="not_eligible",
            policy_note=f"Supplier serves {', '.join(f'{l1}/{l2}' for l1,l2 in served_cats)} — does not cover {category_l1}/{category_l2}",
        )

    # Check geographic coverage
    supplier_regions = set()
    for s in matching_cat:
        supplier_regions.update(s["service_regions"])
    uncovered = [c for c in delivery_countries if c not in supplier_regions]
    covers_delivery = len(uncovered) == 0

    # Check if on preferred list for this category + region
    is_preferred = False
    for p in preferred_list:
        if (p["supplier_name"] == preferred_name
            and p["category_l1"] == category_l1
            and p["category_l2"] == category_l2):
            is_preferred = True
            break

    # Check if restricted
    is_restricted = _is_supplier_restricted(
        matching_cat[0]["supplier_id"], preferred_name,
        category_l1, category_l2, delivery_countries, policies
    )

    if is_restricted:
        status = "not_eligible"
        note = f"Supplier is restricted for {category_l2} in {', '.join(delivery_countries)}"
    elif not covers_delivery:
        status = "not_eligible"
        note = f"Supplier does not cover delivery countries: {', '.join(uncovered)}"
    elif is_preferred:
        status = "eligible"
        note = f"Preferred supplier for {category_l2}. Preferred status means inclusion in comparison, not mandate."
    else:
        status = "eligible"
        note = f"Supplier is eligible but not on preferred list for {category_l2}"

    return PreferredSupplierEval(
        supplier=preferred_name,
        status=status,
        is_preferred=is_preferred,
        covers_delivery_country=covers_delivery,
        is_restricted=is_restricted,
        policy_note=note,
    )


def _is_supplier_restricted(
    supplier_id: str,
    supplier_name: str,
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    policies: dict,
    contract_value: float | None = None,
) -> bool:
    """Check if supplier is restricted based on policies.json restricted_suppliers."""
    restricted_list = policies.get("restricted_suppliers", [])
    for r in restricted_list:
        if r["supplier_id"] != supplier_id:
            continue
        if r["category_l1"] != category_l1 or r["category_l2"] != category_l2:
            continue

        scope = r.get("restriction_scope", [])
        reason = r.get("restriction_reason", "")

        # Global restriction
        if "all" in scope:
            # Value-conditional: e.g. "below EUR 75000 without exception"
            if contract_value is not None and "below" in reason.lower():
                # Parse threshold from reason
                import re
                match = re.search(r'(\d[\d,]*)', reason.replace(",", ""))
                if match:
                    threshold = float(match.group(1))
                    if contract_value < threshold:
                        return False  # Below threshold, not restricted
            return True

        # Country-scoped restriction
        for country in delivery_countries:
            if country in scope:
                return True

    return False


def check_restricted_suppliers(
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    contract_value: float | None,
    store: DataStore,
) -> dict:
    """Check all suppliers in the category for restrictions. Returns dict of supplier_id -> info."""
    result = {}
    suppliers_in_cat = store.suppliers_by_category.get((category_l1, category_l2), [])
    restricted_list = store.policies.get("restricted_suppliers", [])

    for sup in suppliers_in_cat:
        sid = sup["supplier_id"]
        is_r = _is_supplier_restricted(
            sid, sup["supplier_name"],
            category_l1, category_l2,
            delivery_countries, store.policies,
            contract_value,
        )
        if is_r or sup["is_restricted"]:
            # Find the reason
            reason = sup.get("restriction_reason", "")
            for r in restricted_list:
                if r["supplier_id"] == sid and r["category_l1"] == category_l1:
                    reason = r.get("restriction_reason", reason)
                    break
            result[f"{sid}_{sup['supplier_name'].replace(' ', '_')}"] = {
                "restricted": True,
                "note": reason or "Marked as restricted in supplier master data",
            }

    return result


def check_category_rules(
    category_l1: str,
    category_l2: str,
    quantity: int | None,
    budget: float | None,
    policies: dict,
) -> list[CategoryRuleApplied]:
    """Check which category rules apply to this request."""
    rules = policies.get("category_rules", [])
    applied = []
    for r in rules:
        if r["category_l1"] == category_l1 and r["category_l2"] == category_l2:
            applied.append(CategoryRuleApplied(
                rule_id=r["rule_id"],
                rule_type=r["rule_type"],
                rule_text=r["rule_text"],
            ))
    return applied


def check_geography_rules(
    delivery_countries: list[str],
    category_l1: str,
    policies: dict,
) -> list[GeographyRuleApplied]:
    """Check which geography rules apply based on delivery countries."""
    rules = policies.get("geography_rules", [])
    applied = []
    for r in rules:
        # Single-country rules
        if "country" in r:
            if r["country"] in delivery_countries:
                applied.append(GeographyRuleApplied(
                    rule_id=r["rule_id"],
                    country_or_region=r["country"],
                    rule_text=r.get("rule_text", r.get("rule", "")),
                ))
        # Regional rules
        elif "countries" in r:
            matching = [c for c in delivery_countries if c in r["countries"]]
            applies_to = r.get("applies_to", [])
            if matching and (not applies_to or category_l1 in applies_to):
                applied.append(GeographyRuleApplied(
                    rule_id=r["rule_id"],
                    country_or_region=r.get("region", ""),
                    rule_text=r.get("rule", r.get("rule_text", "")),
                ))
    return applied


def evaluate_policies(
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    budget: float | None,
    actual_cost: float | None,
    currency: str,
    preferred_supplier: str | None,
    quantity: int | None,
    store: DataStore,
) -> PolicyEvaluation:
    """Run all policy checks and return combined evaluation."""
    policies = store.policies

    threshold = determine_approval_threshold(budget, actual_cost, currency, policies)
    preferred = check_preferred_supplier(
        preferred_supplier, category_l1, category_l2, delivery_countries, store
    )
    restricted = check_restricted_suppliers(
        category_l1, category_l2, delivery_countries,
        max(budget or 0, actual_cost or 0), store
    )
    cat_rules = check_category_rules(category_l1, category_l2, quantity, budget, policies)
    geo_rules = check_geography_rules(delivery_countries, category_l1, policies)

    return PolicyEvaluation(
        approval_threshold=threshold,
        preferred_supplier=preferred,
        restricted_suppliers=restricted,
        category_rules_applied=cat_rules,
        geography_rules_applied=geo_rules,
    )
