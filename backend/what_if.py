"""
What-If Analysis — suggests parameter changes that would improve outcomes.
Only suggests scenarios that are realistic and actionable.
"""

from backend.data_loader import get_store
from backend.supplier_matcher import match_suppliers
from backend.scoring import score_and_rank_suppliers, find_pricing_tier


def compute_what_if(
    category_l1: str | None,
    category_l2: str | None,
    quantity: int | None,
    budget: float | None,
    currency: str,
    delivery_countries: list[str],
    days_until_required: int | None,
    data_residency_required: bool,
    esg_requirement: bool,
    preferred_supplier_name: str | None,
    incumbent_supplier_name: str | None,
    shortlist: list,
    excluded: list,
) -> list[dict]:
    """Generate what-if scenarios that would improve the procurement outcome."""
    if not category_l1 or not category_l2:
        return []

    store = get_store()
    scenarios = []

    # --- Scenario 1: Budget increase (only when budget is actually insufficient) ---
    if budget and quantity and shortlist:
        best_price = shortlist[0].total_price  # already ranked by composite
        if best_price > budget:
            needed = best_price
            increase_pct = ((needed / budget) - 1) * 100
            scenarios.append({
                "scenario": "budget_increase",
                "title": f"Increase budget by {increase_pct:.0f}%",
                "description": (
                    f"Raising budget from {currency} {budget:,.2f} to {currency} {needed:,.2f} "
                    f"(+{currency} {needed - budget:,.2f}) would bring the top supplier "
                    f"({shortlist[0].supplier_name}) within budget."
                ),
                "parameter": "budget_amount",
                "current_value": budget,
                "suggested_value": round(needed, 2),
                "impact": "Top-ranked supplier becomes within budget",
            })

            # Also suggest: pick the cheapest in-budget supplier if one exists
            in_budget = [s for s in shortlist if s.total_price <= budget]
            if in_budget:
                best_fit = in_budget[0]  # highest composite among affordable
                scenarios.append({
                    "scenario": "affordable_alternative",
                    "title": f"Use {best_fit.supplier_name} (within budget)",
                    "description": (
                        f"{best_fit.supplier_name} at {best_fit.currency} {best_fit.total_price:,.2f} "
                        f"fits within the {currency} {budget:,.2f} budget. "
                        f"Composite score: {best_fit.composite_score:.4f} "
                        f"(vs. top-ranked {shortlist[0].composite_score:.4f})."
                    ),
                    "parameter": "supplier_choice",
                    "current_value": shortlist[0].supplier_name,
                    "suggested_value": best_fit.supplier_name,
                    "impact": f"Saves {currency} {shortlist[0].total_price - best_fit.total_price:,.2f} while staying within budget",
                })

    # --- Scenario 2: Quantity reduction to fit budget ---
    if budget and quantity and shortlist:
        cheapest_unit = min(s.unit_price for s in shortlist)
        max_qty_in_budget = int(budget / cheapest_unit) if cheapest_unit > 0 else quantity

        if max_qty_in_budget < quantity:
            cheapest_supplier = min(shortlist, key=lambda s: s.unit_price)
            scenarios.append({
                "scenario": "quantity_reduction",
                "title": f"Reduce quantity to {max_qty_in_budget} units",
                "description": (
                    f"At the best unit price ({currency} {cheapest_unit:,.2f}/unit from "
                    f"{cheapest_supplier.supplier_name}), the budget of {currency} {budget:,.2f} "
                    f"supports {max_qty_in_budget} units (vs. requested {quantity}). "
                    f"Consider phased delivery for the remaining {quantity - max_qty_in_budget}."
                ),
                "parameter": "quantity",
                "current_value": quantity,
                "suggested_value": max_qty_in_budget,
                "impact": f"Procurement fits within budget; remaining {quantity - max_qty_in_budget} units in next cycle",
            })

    # --- Scenario 3: Deadline extension ---
    if days_until_required is not None and shortlist:
        infeasible = [s for s in shortlist if s.lead_time_feasible == "infeasible"]
        expedited_only = [s for s in shortlist if s.lead_time_feasible == "expedited_only"]

        if infeasible:
            # Find the minimum extra days needed to make at least one infeasible supplier work
            best_infeasible = None
            min_extra = None
            for s in infeasible:
                extra = s.expedited_lead_time_days - days_until_required
                if extra > 0 and (min_extra is None or extra < min_extra):
                    min_extra = extra
                    best_infeasible = s

            if min_extra and best_infeasible:
                scenarios.append({
                    "scenario": "deadline_extension",
                    "title": f"Extend deadline by {min_extra} day(s)",
                    "description": (
                        f"Adding {min_extra} day(s) to the delivery deadline "
                        f"(from {days_until_required}d to {days_until_required + min_extra}d) "
                        f"would make {best_infeasible.supplier_name} feasible via expedited delivery."
                    ),
                    "parameter": "days_until_required",
                    "current_value": days_until_required,
                    "suggested_value": days_until_required + min_extra,
                    "impact": f"{len(infeasible)} supplier(s) become feasible with expedited delivery",
                })

        if expedited_only:
            # Suggest extension for standard pricing (saves expedited premium)
            min_standard_extra = None
            for s in expedited_only + infeasible:
                extra = s.standard_lead_time_days - days_until_required
                if extra > 0 and (min_standard_extra is None or extra < min_standard_extra):
                    min_standard_extra = extra

            if min_standard_extra:
                avg_premium = 0
                for s in expedited_only:
                    avg_premium += (s.expedited_unit_price - s.unit_price) * (quantity or 1)
                if expedited_only:
                    avg_premium /= len(expedited_only)

                scenarios.append({
                    "scenario": "deadline_savings",
                    "title": f"Extend deadline by {min_standard_extra} day(s) to avoid expedited premium",
                    "description": (
                        f"Extending by {min_standard_extra} day(s) enables standard delivery "
                        f"(no expedited surcharge), saving ~{currency} {avg_premium:,.2f} on average."
                    ),
                    "parameter": "days_until_required",
                    "current_value": days_until_required,
                    "suggested_value": days_until_required + min_standard_extra,
                    "impact": f"Standard delivery pricing available, ~{currency} {avg_premium:,.2f} saved",
                })

    # --- Scenario 4: Split multi-country order ---
    # If delivery to multiple countries and few/no suppliers cover all of them,
    # suggest splitting the order by country for better supplier coverage.
    if len(delivery_countries) > 1 and quantity:
        # Check per-country supplier availability
        per_country_counts = {}
        for country in delivery_countries:
            c, _ = match_suppliers(
                category_l1=category_l1,
                category_l2=category_l2,
                delivery_countries=[country],
                currency=currency,
                quantity=quantity,
                data_residency_required=data_residency_required,
                contract_value=budget,
                store=store,
            )
            per_country_counts[country] = len(c)

        total_per_country = sum(per_country_counts.values())
        current_count = len(shortlist)

        # Only suggest split if individual countries have more options
        if total_per_country > current_count and current_count < 3:
            country_details = ", ".join(
                f"{c}: {n} supplier(s)" for c, n in per_country_counts.items()
            )
            scenarios.append({
                "scenario": "split_by_country",
                "title": f"Split order across {len(delivery_countries)} countries",
                "description": (
                    f"Currently {current_count} supplier(s) cover all countries "
                    f"({', '.join(delivery_countries)}). Splitting the order gives "
                    f"more options per region: {country_details}."
                ),
                "parameter": "delivery_countries",
                "current_value": delivery_countries,
                "suggested_value": "split_per_country",
                "impact": f"More competitive options per region vs. {current_count} supplier(s) covering all",
            })

    # --- Scenario 5: Volume discount (quantity increase) ---
    if quantity and shortlist:
        # Check if a higher quantity tier would give a better unit price
        top = shortlist[0]
        current_tier = find_pricing_tier(
            top.supplier_id, category_l1, category_l2,
            delivery_countries, quantity, store,
        )
        if current_tier:
            # Find the next tier up
            region_key = (top.supplier_id, category_l1, category_l2,
                         current_tier.get("region", "EU"))
            all_tiers = store.pricing_by_supplier.get(region_key, [])
            next_tier = None
            for t in sorted(all_tiers, key=lambda x: x["min_quantity"]):
                if t["min_quantity"] > quantity:
                    next_tier = t
                    break

            if next_tier and next_tier["unit_price"] < current_tier["unit_price"]:
                savings_per_unit = current_tier["unit_price"] - next_tier["unit_price"]
                min_qty = next_tier["min_quantity"]
                # Only suggest if the quantity bump is reasonable (<50% more)
                if min_qty <= quantity * 1.5:
                    total_at_new = next_tier["unit_price"] * min_qty
                    total_at_current = current_tier["unit_price"] * quantity
                    scenarios.append({
                        "scenario": "volume_discount",
                        "title": f"Increase to {min_qty} units for volume pricing",
                        "description": (
                            f"Ordering {min_qty} units (from {quantity}) unlocks a lower tier: "
                            f"{currency} {next_tier['unit_price']:,.2f}/unit "
                            f"(vs. current {currency} {current_tier['unit_price']:,.2f}/unit). "
                            f"Saves {currency} {savings_per_unit:,.2f}/unit."
                        ),
                        "parameter": "quantity",
                        "current_value": quantity,
                        "suggested_value": min_qty,
                        "impact": f"Unit price drops by {currency} {savings_per_unit:,.2f} ({savings_per_unit/current_tier['unit_price']*100:.1f}% saving)",
                    })

    return scenarios[:5]
