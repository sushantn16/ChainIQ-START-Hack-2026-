"""
Composite Risk Scoring — replaces the single opaque risk_score integer.

Hybrid approach:
- Country risk: geopolitical exposure from supplier HQ (new signal)
- Delivery risk: derived from historical award win rate + escalation rate (new signal)
- Baseline risk: old risk_score normalized, preserves vendor vetting info

Output: RiskComposite with total 0-100, tier, and audit flags.
"""

from datetime import datetime, timedelta


COUNTRY_RISK_TABLE = {
    # Tier 1 Low (score 10)
    "CH": 10, "DE": 10, "NL": 10, "IE": 10, "AT": 10, "SE": 10,
    "LU": 10, "FI": 10, "DK": 10,
    # Tier 2 Medium (score 18)
    "FR": 18, "US": 18, "UK": 18, "PL": 18, "JP": 18, "AU": 18, "CA": 18,
    # Tier 3 Elevated (score 28)
    "IN": 28, "KR": 28, "ES": 28, "BR": 28, "MX": 28, "ZA": 28, "UAE": 28,
    # Tier 4 High (score 40)
    "CN": 40, "RU": 40, "BY": 40,
}
DEFAULT_COUNTRY_RISK = 20

# Sub-component weights (must sum to 1.0)
W_COUNTRY = 0.35
W_DELIVERY = 0.40
W_BASELINE = 0.25


def compute_country_risk(
    country_hq: str,
    delivery_countries: list[str],
    is_restricted: bool,
    restriction_scope: list[str] | None,
    data_residency_required: bool,
) -> tuple[int, list[str]]:
    """Compute country risk score (0-40) and flags."""
    raw = COUNTRY_RISK_TABLE.get(country_hq, DEFAULT_COUNTRY_RISK)
    flags = []

    # Policy restriction in delivery country adds penalty
    if is_restricted and restriction_scope:
        for dc in delivery_countries:
            if dc in restriction_scope or "all" in restriction_scope:
                raw = min(40, raw + 15)
                flags.append(f"Policy restricted in delivery country {dc}")
                break

    # Data residency warning for elevated+ country risk
    if data_residency_required and raw >= 28:
        flags.append("Data residency constraint: verify local data centre before award")

    if raw >= 28:
        tier_name = "Tier 4 (High)" if raw >= 40 else "Tier 3 (Elevated)"
        flags.append(f"Elevated geopolitical risk: HQ in {country_hq} ({tier_name})")

    return raw, flags


def compute_delivery_risk(
    supplier_id: str,
    historical_awards: list[dict],
) -> tuple[int, list[str]]:
    """Compute delivery risk (0-40) from historical award data."""
    awards = [a for a in historical_awards if a["supplier_id"] == supplier_id]
    flags = []

    if not awards:
        flags.append("No award history: treat as unvalidated supplier")
        return 20, flags  # default for unknown

    total_bids = len(awards)
    wins = len([a for a in awards if a["awarded"]])
    escalated = len([a for a in awards if a["escalation_required"]])

    # A: Win rate risk (0-15 pts) — lower win rate = higher risk
    win_rate = wins / total_bids
    win_rate_risk = round((1 - win_rate) * 15)
    if win_rate == 0 and total_bids > 5:
        flags.append(f"0% win rate across {total_bids} bids: commercial competitiveness unproven")

    # B: Escalation rate risk (0-20 pts) — higher escalation = higher risk
    esc_rate = escalated / total_bids
    esc_risk = round(esc_rate * 20)
    if esc_rate > 0.40:
        flags.append(f"High escalation rate: {round(esc_rate * 100)}% of past awards required escalation")

    # C: Recency penalty (0-10 pts) — not used recently = unvalidated
    six_months_ago = datetime.now() - timedelta(days=180)
    recent = []
    for a in awards:
        try:
            ad = datetime.strptime(a.get("award_date", "")[:10], "%Y-%m-%d")
            if ad >= six_months_ago:
                recent.append(a)
        except (ValueError, TypeError):
            pass

    if not recent:
        recency_risk = 6
        flags.append("Not used in last 6 months: revalidate lead time and pricing")
    else:
        recency_risk = 0

    total = min(40, win_rate_risk + esc_risk + recency_risk)
    return total, flags


def compute_baseline_risk(
    old_risk_score: int,
) -> int:
    """Normalize old risk_score (range ~11-32) to 0-30.

    The old score encodes vendor vetting/financial assessment.
    We preserve it rather than replacing with a weaker proxy.
    Formula: ((old - 10) / 25) * 30, capped at 30.
    """
    normalized = ((old_risk_score - 10) / 25) * 30
    return min(30, max(0, round(normalized)))


def compute_risk_composite(
    supplier: dict,
    delivery_countries: list[str],
    data_residency_required: bool,
    historical_awards: list[dict],
    restriction_scope: list[str] | None = None,
) -> dict:
    """Compute full composite risk score for a supplier.

    Returns:
        {
            "country_risk": int (0-40),
            "delivery_risk": int (0-40),
            "baseline_risk": int (0-30),
            "total": int (0-100),
            "tier": "low" | "medium" | "elevated" | "high",
            "flags": [str],
            "inputs": { ... }  # for audit trail
        }
    """
    country_raw, country_flags = compute_country_risk(
        country_hq=supplier["country_hq"],
        delivery_countries=delivery_countries,
        is_restricted=supplier.get("is_restricted", False),
        restriction_scope=restriction_scope,
        data_residency_required=data_residency_required,
    )

    delivery_raw, delivery_flags = compute_delivery_risk(
        supplier_id=supplier["supplier_id"],
        historical_awards=historical_awards,
    )

    baseline_raw = compute_baseline_risk(supplier["risk_score"])

    # Weighted total normalized to 0-100
    # Max raw: country=40, delivery=40, baseline=30
    # Weighted max: 40*0.35 + 40*0.40 + 30*0.25 = 14 + 16 + 7.5 = 37.5
    # Normalize to 0-100: (weighted / 37.5) * 100
    weighted = (country_raw * W_COUNTRY + delivery_raw * W_DELIVERY + baseline_raw * W_BASELINE)
    total = min(100, round((weighted / 37.5) * 100))

    all_flags = country_flags + delivery_flags

    tier = (
        "low" if total <= 25 else
        "medium" if total <= 45 else
        "elevated" if total <= 65 else
        "high"
    )

    # Build audit inputs
    awards_for_supplier = [a for a in historical_awards if a["supplier_id"] == supplier["supplier_id"]]
    total_bids = len(awards_for_supplier)
    total_wins = len([a for a in awards_for_supplier if a["awarded"]])
    total_esc = len([a for a in awards_for_supplier if a["escalation_required"]])

    return {
        "country_risk": country_raw,
        "delivery_risk": delivery_raw,
        "baseline_risk": baseline_raw,
        "total": total,
        "tier": tier,
        "flags": all_flags,
        "inputs": {
            "country_hq": supplier["country_hq"],
            "country_tier": (
                1 if country_raw <= 10 else
                2 if country_raw <= 18 else
                3 if country_raw <= 28 else 4
            ),
            "old_risk_score": supplier["risk_score"],
            "historical_bids": total_bids,
            "historical_wins": total_wins,
            "win_rate": round(total_wins / total_bids, 2) if total_bids > 0 else None,
            "escalation_rate": round(total_esc / total_bids, 2) if total_bids > 0 else None,
            "preferred": supplier.get("preferred_supplier", False),
            "restricted": supplier.get("is_restricted", False),
        },
    }
