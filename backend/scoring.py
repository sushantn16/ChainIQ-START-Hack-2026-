"""
Step 7: Pricing & Composite Scoring.
Select pricing tiers, calculate costs, compute weighted composite scores, rank suppliers.
"""

from backend.data_loader import DataStore
from backend.supplier_matcher import get_region_for_country
from backend.models import SupplierShortlistEntry, RiskComposite, HistoricalPerformance
from backend.risk_scoring import compute_risk_composite


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


def compute_historical_performance(
    supplier_id: str,
    category_l1: str,
    category_l2: str,
    historical_awards: list[dict],
) -> HistoricalPerformance:
    """Compute historical performance metrics for a supplier in a specific category.

    Experience score (0-1) is based on:
    - Category wins (0-0.4): more wins = more proven
    - Avg savings (0-0.3): higher historical savings = better value
    - Low escalation rate (0-0.3): fewer past escalations = smoother process
    """
    # All bids by this supplier in this category
    cat_bids = [
        a for a in historical_awards
        if a["supplier_id"] == supplier_id
        and a["category_l1"] == category_l1
        and a["category_l2"] == category_l2
    ]

    if not cat_bids:
        return HistoricalPerformance()

    wins = [a for a in cat_bids if a["awarded"]]
    escalated = [a for a in cat_bids if a["escalation_required"]]

    cat_wins = len(wins)
    cat_bids_count = len(cat_bids)
    esc_rate = len(escalated) / cat_bids_count if cat_bids_count > 0 else 0

    savings = [a["savings_pct"] for a in wins if a.get("savings_pct")]
    avg_savings = sum(savings) / len(savings) if savings else 0

    lead_times = [a["lead_time_days"] for a in wins if a.get("lead_time_days")]
    avg_lead = sum(lead_times) / len(lead_times) if lead_times else 0

    # Experience score components
    # Wins: 1 win = 0.15, 3+ = 0.30, 5+ = 0.40 (diminishing returns)
    win_score = min(0.4, cat_wins * 0.08)
    # Savings: 5% avg savings = 0.15, 8%+ = 0.30
    savings_score = min(0.3, avg_savings * 0.04)
    # Low escalation: 0% escalation = 0.30, 50%+ = 0
    esc_score = max(0, 0.3 * (1 - esc_rate * 2))

    experience_score = round(win_score + savings_score + esc_score, 4)

    return HistoricalPerformance(
        category_wins=cat_wins,
        category_bids=cat_bids_count,
        avg_savings_pct=round(avg_savings, 1),
        avg_lead_time_days=round(avg_lead, 1),
        escalation_rate=round(esc_rate, 2),
        experience_score=experience_score,
    )


def compute_composite_score(
    total_price: float,
    all_prices: list[float],
    quality_score: int,
    risk_total: int,
    lead_time_status: str,
    is_preferred: bool,
    experience_score: float = 0.0,
    weights: dict | None = None,
) -> float:
    """
    Compute weighted composite score.
    Weights: price=0.35, quality=0.35, risk=0.20, lead=0.10 (sum to 1.00).
    Preferred supplier gets a flat +0.10 additive bonus.
    Historical experience adds up to +0.05 bonus (experience_score * 0.05).

    risk_total is the composite risk score (0-100) from risk_scoring module.
    """
    if weights is None:
        weights = {
            "price": 0.35,
            "quality": 0.35,
            "risk": 0.20,
            "lead": 0.10,
        }

    # Normalize price (lower = better) using ratio to cheapest
    # This avoids harsh 0/100 swings with few suppliers — a supplier 10% more
    # expensive than the cheapest still scores ~91% rather than 0%.
    if all_prices and min(all_prices) > 0:
        price_norm = min(all_prices) / total_price
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
        + weights["risk"] * (1 - risk_total / 100)
        + weights["lead"] * lead_score
    )

    # Flat preferred supplier bonus (additive, outside the weighted dimensions)
    if is_preferred:
        score += 0.10

    # Historical experience bonus (up to +0.05 for proven category track record)
    score += experience_score * 0.05

    return round(min(1.0, score), 4)


def _fuzzy_name_match(supplier_name: str, user_name: str | None) -> bool:
    """Check if user-provided name matches a supplier name.

    Matches if all words in the user input appear in the supplier name (case-insensitive).
    e.g. "AWS Enterprise" matches "AWS Enterprise EMEA".
    """
    if not user_name:
        return False
    user_words = set(user_name.lower().split())
    supplier_words = set(supplier_name.lower().split())
    return user_words.issubset(supplier_words)


def score_and_rank_suppliers(
    candidates: list[dict],
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    quantity: int | None,
    days_available: int | None,
    preferred_supplier_name: str | None,
    incumbent_supplier_name: str | None,
    data_residency_required: bool,
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

        # Compute composite risk score
        risk_comp = compute_risk_composite(
            supplier=sup,
            delivery_countries=delivery_countries,
            data_residency_required=data_residency_required,
            historical_awards=store.historical_awards,
        )

        # Compute historical performance
        hist_perf = compute_historical_performance(
            supplier_id=sup["supplier_id"],
            category_l1=category_l1,
            category_l2=category_l2,
            historical_awards=store.historical_awards,
        )

        price_data.append({
            "supplier": sup,
            "tier": tier,
            "total_price": total_price,
            "expedited_total": expedited_total,
            "lead_status": lead_status,
            "tier_label": tier_label,
            "risk_composite": risk_comp,
            "historical_performance": hist_perf,
        })

    # Second pass: compute composite scores
    for pd in price_data:
        sup = pd["supplier"]
        tier = pd["tier"]
        risk_comp = pd["risk_composite"]
        hist_perf = pd["historical_performance"]

        is_on_policy_list = sup.get("preferred_supplier", False)
        is_user_preferred = _fuzzy_name_match(sup["supplier_name"], preferred_supplier_name)
        is_preferred = is_on_policy_list or is_user_preferred
        is_incumbent = _fuzzy_name_match(sup["supplier_name"], incumbent_supplier_name)

        score = compute_composite_score(
            total_price=pd["total_price"],
            all_prices=all_prices,
            quality_score=sup["quality_score"],
            risk_total=risk_comp["total"],
            lead_time_status=pd["lead_status"],
            is_preferred=is_preferred,
            experience_score=hist_perf.experience_score,
        )

        entry = SupplierShortlistEntry(
            rank=0,  # assigned after sorting
            supplier_id=sup["supplier_id"],
            supplier_name=sup["supplier_name"],
            preferred=is_on_policy_list,
            user_preferred=is_user_preferred,
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
            risk_score=risk_comp["total"],
            risk_composite=RiskComposite(**{
                k: risk_comp[k] for k in
                ["country_risk", "delivery_risk", "baseline_risk", "total", "tier", "flags", "inputs"]
            }),
            historical_performance=hist_perf,
            esg_score=sup["esg_score"],
            lead_time_feasible=pd["lead_status"],
            composite_score=score,
            capacity_exceeded=sup.get("capacity_exceeded", False),
            recommendation_note="",
        )

        scored.append(entry)

    # Sort: feasible suppliers first (standard/expedited), then infeasible.
    # Within each group, sort by composite score descending.
    any_feasible = any(e.lead_time_feasible != "infeasible" for e in scored)
    scored.sort(
        key=lambda x: (
            0 if x.lead_time_feasible != "infeasible" else 1 if any_feasible else 0,
            -x.composite_score,
        )
    )

    # Assign ranks
    for i, entry in enumerate(scored):
        entry.rank = i + 1

    return scored
