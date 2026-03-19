"""
Step 5: Supplier Matching — filter and identify compliant candidate suppliers.
"""

from backend.data_loader import DataStore
from backend.models import ExcludedSupplier
from backend.policy_engine import _is_supplier_restricted


ESG_MINIMUM_THRESHOLD = 65  # Hard cutoff when ESG requirement is enabled


def match_suppliers(
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    currency: str,
    quantity: int | None,
    data_residency_required: bool,
    esg_required: bool,
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

        # 1. Policy restriction check — must run first for correct audit trail
        is_restricted = _is_supplier_restricted(
            sid, name, category_l1, category_l2,
            delivery_countries, store.policies, contract_value,
        )
        if is_restricted:
            reason = "Restricted per policy"
            for r in store.policies.get("restricted_suppliers", []):
                if r["supplier_id"] == sid and r["category_l1"] == category_l1:
                    reason = r.get("restriction_reason", reason)
                    break
            excluded.append(ExcludedSupplier(
                supplier_id=sid,
                supplier_name=name,
                reason=f"Restricted: {reason}",
                reason_code="POLICY_RESTRICTED",
            ))
            continue

        # 2. ESG compliance check (hard filter when ESG is required)
        if esg_required and sup["esg_score"] < ESG_MINIMUM_THRESHOLD:
            excluded.append(ExcludedSupplier(
                supplier_id=sid,
                supplier_name=name,
                reason=f"ESG score ({sup['esg_score']}) below minimum threshold ({ESG_MINIMUM_THRESHOLD})",
                reason_code="ESG_THRESHOLD",
            ))
            continue

        # 3. Data residency check
        if data_residency_required and not sup["data_residency_supported"]:
            excluded.append(ExcludedSupplier(
                supplier_id=sid,
                supplier_name=name,
                reason="Does not support data residency requirements",
                reason_code="DATA_RESIDENCY",
            ))
            continue

        # 4. Contract status
        if sup.get("contract_status") == "inactive":
            excluded.append(ExcludedSupplier(
                supplier_id=sid,
                supplier_name=name,
                reason="Contract status is inactive",
                reason_code="CONTRACT_INACTIVE",
            ))
            continue

        # 5. Geographic match — runs last so policy restrictions take precedence
        uncovered = [c for c in delivery_countries if c not in sup["service_regions"]]
        if uncovered:
            excluded.append(ExcludedSupplier(
                supplier_id=sid,
                supplier_name=name,
                reason=f"Does not cover delivery countries: {', '.join(uncovered)}. Service regions: {', '.join(sup['service_regions'])}",
                reason_code="GEO_COVERAGE",
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
