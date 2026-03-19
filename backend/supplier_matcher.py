"""
Step 5: Supplier Matching — filter and identify compliant candidate suppliers.
"""

from backend.data_loader import DataStore
from backend.models import ExcludedSupplier
from backend.policy_engine import _is_supplier_restricted


def match_suppliers(
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    currency: str,
    quantity: int | None,
    data_residency_required: bool,
    contract_value: float | None,
    store: DataStore,
) -> tuple[list[dict], list[ExcludedSupplier]]:
    """
    Filter suppliers by category, region, restriction, capacity, residency.
    Returns (candidates, excluded).
    """
    candidates = []
    excluded = []

    all_in_category = store.suppliers_by_category.get((category_l1, category_l2), [])

    if not all_in_category:
        return [], []

    seen_ids = set()

    for sup in all_in_category:
        sid = sup["supplier_id"]
        name = sup["supplier_name"]

        if sid in seen_ids:
            continue
        seen_ids.add(sid)

        # 1. Geographic match: all delivery countries must be in service_regions
        uncovered = [c for c in delivery_countries if c not in sup["service_regions"]]
        if uncovered:
            excluded.append(ExcludedSupplier(
                supplier_id=sid,
                supplier_name=name,
                reason=f"Does not cover delivery countries: {', '.join(uncovered)}. Service regions: {', '.join(sup['service_regions'])}",
            ))
            continue

        # 2. Restriction check (policies.json is authoritative)
        is_restricted = _is_supplier_restricted(
            sid, name, category_l1, category_l2,
            delivery_countries, store.policies, contract_value,
        )
        if is_restricted:
            # Find reason
            reason = "Restricted per policy"
            for r in store.policies.get("restricted_suppliers", []):
                if r["supplier_id"] == sid and r["category_l1"] == category_l1:
                    reason = r.get("restriction_reason", reason)
                    break
            excluded.append(ExcludedSupplier(
                supplier_id=sid,
                supplier_name=name,
                reason=f"Restricted: {reason}",
            ))
            continue

        # 3. Data residency check
        if data_residency_required and not sup["data_residency_supported"]:
            excluded.append(ExcludedSupplier(
                supplier_id=sid,
                supplier_name=name,
                reason="Does not support data residency requirements",
            ))
            continue

        # 4. Contract status
        if sup.get("contract_status") == "inactive":
            excluded.append(ExcludedSupplier(
                supplier_id=sid,
                supplier_name=name,
                reason="Contract status is inactive",
            ))
            continue

        # Supplier passes all filters — add to candidates
        # Note: capacity check is done here but doesn't exclude (triggers ER-006 instead)
        capacity_exceeded = False
        if quantity and sup["capacity_per_month"] < 999999:
            if quantity > sup["capacity_per_month"]:
                capacity_exceeded = True

        candidates.append({
            **sup,
            "capacity_exceeded": capacity_exceeded,
        })

    return candidates, excluded


def get_region_for_country(country: str) -> str:
    """Map delivery country to pricing region."""
    eu_countries = {"DE", "FR", "NL", "BE", "AT", "IT", "ES", "PL", "UK", "CH"}
    americas = {"US", "CA", "BR", "MX"}
    apac = {"SG", "AU", "IN", "JP"}
    mea = {"UAE", "ZA"}

    if country in eu_countries:
        return "EU"
    elif country in americas:
        return "Americas"
    elif country in apac:
        return "APAC"
    elif country in mea:
        return "MEA"
    return "EU"  # default fallback
