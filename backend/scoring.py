"""
Step 7: Pricing & Composite Scoring.
Select pricing tiers, calculate costs, compute weighted composite scores, rank suppliers.
"""

from backend.data_loader import DataStore
from backend.supplier_matcher import get_region_for_country
from backend.models import SupplierShortlistEntry


def find_pricing_tier(
    supplier_id: str,
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    quantity: int,
    store: DataStore,
) -> dict | None:
    """Find the correct pricing tier for a supplier+category+quantity."""
    # Determine region from first delivery country
    region = get_region_for_country(delivery_countries[0]) if delivery_countries else "EU"

    # Look up pricing rows
    key = (supplier_id, category_l1, category_l2, region)
    tiers = store.pricing_by_supplier.get(key, [])

    if not tiers:
        # Try other regions as fallback
        for r in ["EU", "Americas", "APAC", "MEA"]:
            alt_key = (supplier_id, category_l1, category_l2, r)
            tiers = store.pricing_by_supplier.get(alt_key, [])
            if tiers:
                break

    if not tiers:
        return None

    # Find tier matching quantity
    for tier in sorted(tiers, key=lambda t: t["min_quantity"]):
        if tier["min_quantity"] <= quantity <= tier["max_quantity"]:
            return tier

    # If quantity exceeds all tiers, use highest tier
    highest = max(tiers, key=lambda t: t["max_quantity"])
    if quantity > highest["max_quantity"]:
        return highest

    # If quantity below all tiers, use lowest
    lowest = min(tiers, key=lambda t: t["min_quantity"])
    return lowest


def calculate_lead_time_feasibility(
    standard_days: int,
    expedited_days: int,
    days_available: int | None,
) -> str:
    """Returns: 'standard', 'expedited_only', or 'infeasible'."""
    if days_available is None:
        return "standard"  # No deadline specified, assume feasible
    if standard_days <= days_available:
        return "standard"
    if expedited_days <= days_available:
        return "expedited_only"
    return "infeasible"


def compute_composite_score(
    total_price: float,
    all_prices: list[float],
    quality_score: int,
    risk_score: int,
    esg_score: int,
    lead_time_status: str,
    is_preferred: bool,
    esg_required: bool,
    weights: dict | None = None,
) -> float:
    """
    Compute weighted composite score.
    Default weights: price=0.30, quality=0.20, risk=0.20, esg=0.10, lead=0.10, preferred=0.10
    """
    if weights is None:
        weights = {
            "price": 0.30,
            "quality": 0.20,
            "risk": 0.20,
            "esg": 0.10,
            "lead": 0.10,
            "preferred": 0.10,
        }

    # If ESG not required, redistribute weight
    if not esg_required:
        esg_weight = weights["esg"]
        weights = {**weights, "esg": 0}
        # Redistribute to price and quality
        weights["price"] += esg_weight / 2
        weights["quality"] += esg_weight / 2

    # Normalize price (lower = better)
    if all_prices and max(all_prices) > min(all_prices):
        price_norm = 1.0 - (total_price - min(all_prices)) / (max(all_prices) - min(all_prices))
    elif all_prices:
        price_norm = 1.0
    else:
        price_norm = 0.5

    # Lead time score
    lead_scores = {"standard": 1.0, "expedited_only": 0.5, "infeasible": 0.0}
    lead_score = lead_scores.get(lead_time_status, 0.5)

    score = (
        weights["price"] * price_norm
        + weights["quality"] * (quality_score / 100)
        + weights["risk"] * (1 - risk_score / 100)
        + weights["esg"] * (esg_score / 100)
        + weights["lead"] * lead_score
        + weights["preferred"] * (1.0 if is_preferred else 0.0)
    )

    return round(score, 4)


def score_and_rank_suppliers(
    candidates: list[dict],
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    quantity: int | None,
    days_available: int | None,
    esg_required: bool,
    preferred_supplier_name: str | None,
    incumbent_supplier_name: str | None,
    store: DataStore,
) -> list[SupplierShortlistEntry]:
    """Price, score, and rank all candidate suppliers.

    Self-healing: if quantity is None, falls back to unit pricing (quantity=1).
    """
    if not candidates:
        return []

    # Self-healing: missing quantity → use 1 for per-unit pricing
    effective_quantity = quantity if quantity else 1
    is_unit_pricing = quantity is None

    scored = []
    all_prices = []

    # First pass: compute prices
    price_data = []
    for sup in candidates:
        tier = find_pricing_tier(
            sup["supplier_id"], category_l1, category_l2,
            delivery_countries, effective_quantity, store,
        )
        if not tier:
            continue

        total_price = tier["unit_price"] * effective_quantity
        expedited_total = tier["expedited_unit_price"] * effective_quantity
        all_prices.append(total_price)

        lead_status = calculate_lead_time_feasibility(
            tier["standard_lead_time_days"],
            tier["expedited_lead_time_days"],
            days_available,
        )

        tier_label = f"{tier['min_quantity']}–{tier['max_quantity']} units"

        price_data.append({
            "supplier": sup,
            "tier": tier,
            "total_price": total_price,
            "expedited_total": expedited_total,
            "lead_status": lead_status,
            "tier_label": tier_label,
        })

    # Second pass: compute composite scores
    for pd in price_data:
        sup = pd["supplier"]
        tier = pd["tier"]

        is_on_preferred_list = sup.get("preferred_supplier", False)
        is_user_preferred = sup["supplier_name"] == preferred_supplier_name
        is_pref = is_on_preferred_list or is_user_preferred
        is_incumbent = sup["supplier_name"] == incumbent_supplier_name

        score = compute_composite_score(
            total_price=pd["total_price"],
            all_prices=all_prices,
            quality_score=sup["quality_score"],
            risk_score=sup["risk_score"],
            esg_score=sup["esg_score"],
            lead_time_status=pd["lead_status"],
            is_preferred=is_pref,
            esg_required=esg_required,
        )

        entry = SupplierShortlistEntry(
            rank=0,  # assigned after sorting
            supplier_id=sup["supplier_id"],
            supplier_name=sup["supplier_name"],
            preferred=sup.get("preferred_supplier", False),
            incumbent=is_incumbent,
            pricing_tier_applied=pd["tier_label"],
            unit_price=tier["unit_price"],
            total_price=pd["total_price"],
            currency=tier["currency"],
            standard_lead_time_days=tier["standard_lead_time_days"],
            expedited_lead_time_days=tier["expedited_lead_time_days"],
            expedited_unit_price=tier["expedited_unit_price"],
            expedited_total=pd["expedited_total"],
            quality_score=sup["quality_score"],
            risk_score=sup["risk_score"],
            esg_score=sup["esg_score"],
            lead_time_feasible=pd["lead_status"],
            composite_score=score,
            capacity_exceeded=sup.get("capacity_exceeded", False),
            recommendation_note="",
        )

        scored.append(entry)

    # Sort by composite score descending
    scored.sort(key=lambda x: x.composite_score, reverse=True)

    # Assign ranks
    for i, entry in enumerate(scored):
        entry.rank = i + 1

    return scored
