"""
What-If Analysis — automatically suggests parameter changes that would improve outcomes.
Runs deterministic simulations: budget increase, deadline extension, quantity adjustment.
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

    # --- Scenario 1: Budget increase ---
    if budget and quantity and shortlist:
        best_price = min(s.total_price for s in shortlist)
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
                "impact": "Removes budget_insufficient validation issue and unblocks recommendation",
            })

        # Check if a larger budget unlocks more suppliers (by checking excluded ones)
        # Find cheapest across ALL suppliers in category (not just matched)
        all_candidates, _ = match_suppliers(
            category_l1=category_l1,
            category_l2=category_l2,
            delivery_countries=delivery_countries,
            currency=currency,
            quantity=quantity,
            data_residency_required=data_residency_required,
            contract_value=budget * 2,  # higher value to include more
            store=store,
        )
        if len(all_candidates) > len(shortlist):
            # Some suppliers were excluded by value-based restrictions
            extra = len(all_candidates) - len(shortlist)
            scenarios.append({
                "scenario": "budget_unlock",
                "title": f"Higher budget could unlock {extra} more supplier(s)",
                "description": (
                    f"Increasing the contract value may lift value-based restrictions, "
                    f"adding {extra} supplier(s) to the competitive pool."
                ),
                "parameter": "budget_amount",
                "current_value": budget,
                "suggested_value": round(budget * 1.5, 2),
                "impact": f"{extra} additional supplier(s) become eligible",
            })

    # --- Scenario 2: Deadline extension ---
    if days_until_required is not None and quantity and shortlist:
        infeasible = [s for s in shortlist if s.lead_time_feasible == "infeasible"]
        expedited_only = [s for s in shortlist if s.lead_time_feasible == "expedited_only"]

        if infeasible:
            # Find the minimum extra days needed for the cheapest infeasible supplier
            min_extra_days = None
            best_infeasible = None
            for s in infeasible:
                extra = s.expedited_lead_time_days - days_until_required
                if extra > 0 and (min_extra_days is None or extra < min_extra_days):
                    min_extra_days = extra
                    best_infeasible = s

            if min_extra_days and best_infeasible:
                scenarios.append({
                    "scenario": "deadline_extension",
                    "title": f"Extend deadline by {min_extra_days} day(s)",
                    "description": (
                        f"Adding {min_extra_days} day(s) to the delivery deadline "
                        f"(from {days_until_required}d to {days_until_required + min_extra_days}d) "
                        f"would make {best_infeasible.supplier_name} feasible via expedited delivery."
                    ),
                    "parameter": "days_until_required",
                    "current_value": days_until_required,
                    "suggested_value": days_until_required + min_extra_days,
                    "impact": f"{len(infeasible)} supplier(s) become feasible with expedited delivery",
                })

            # Check standard delivery feasibility
            min_standard_extra = None
            for s in infeasible + expedited_only:
                extra = s.standard_lead_time_days - days_until_required
                if extra > 0 and (min_standard_extra is None or extra < min_standard_extra):
                    min_standard_extra = extra

            if min_standard_extra and min_standard_extra != min_extra_days:
                scenarios.append({
                    "scenario": "deadline_standard",
                    "title": f"Extend deadline by {min_standard_extra} day(s) for standard pricing",
                    "description": (
                        f"Extending by {min_standard_extra} day(s) would allow standard delivery "
                        f"(no expedited premium), saving on delivery costs."
                    ),
                    "parameter": "days_until_required",
                    "current_value": days_until_required,
                    "suggested_value": days_until_required + min_standard_extra,
                    "impact": "Standard delivery pricing available (no expedited surcharge)",
                })

        elif expedited_only:
            # All feasible but require expedited — suggest extension for standard
            min_standard_extra = None
            for s in expedited_only:
                extra = s.standard_lead_time_days - days_until_required
                if extra > 0 and (min_standard_extra is None or extra < min_standard_extra):
                    min_standard_extra = extra

            if min_standard_extra:
                # Compute savings
                savings = sum(
                    s.expedited_total - s.total_price
                    for s in expedited_only
                ) / len(expedited_only)
                scenarios.append({
                    "scenario": "deadline_savings",
                    "title": f"Extend deadline by {min_standard_extra} day(s) to save on delivery",
                    "description": (
                        f"All current suppliers require expedited delivery. Extending deadline by "
                        f"{min_standard_extra} day(s) enables standard pricing, saving an average of "
                        f"{currency} {savings:,.2f} per supplier."
                    ),
                    "parameter": "days_until_required",
                    "current_value": days_until_required,
                    "suggested_value": days_until_required + min_standard_extra,
                    "impact": f"Average savings of {currency} {savings:,.2f} per supplier via standard delivery",
                })

    # --- Scenario 3: Quantity reduction (to fit budget) ---
    if budget and quantity and shortlist:
        best_unit_price = min(s.unit_price for s in shortlist)
        max_qty_in_budget = int(budget / best_unit_price) if best_unit_price > 0 else quantity

        if max_qty_in_budget < quantity:
            scenarios.append({
                "scenario": "quantity_reduction",
                "title": f"Reduce quantity to {max_qty_in_budget} units",
                "description": (
                    f"At the best unit price ({currency} {best_unit_price:,.2f}/unit), "
                    f"the budget of {currency} {budget:,.2f} supports {max_qty_in_budget} units "
                    f"(vs. requested {quantity}). Consider phased delivery."
                ),
                "parameter": "quantity",
                "current_value": quantity,
                "suggested_value": max_qty_in_budget,
                "impact": f"Procurement fits within budget; remaining {quantity - max_qty_in_budget} units in next cycle",
            })

    # --- Scenario 4: Alternative supplier available in different region ---
    if delivery_countries and quantity and len(shortlist) < 3:
        # Check if removing country constraint gives more suppliers
        candidates_no_geo, _ = match_suppliers(
            category_l1=category_l1,
            category_l2=category_l2,
            delivery_countries=[],  # no geo filter
            currency=currency,
            quantity=quantity,
            data_residency_required=data_residency_required,
            contract_value=budget,
            store=store,
        )
        extra_without_geo = len(candidates_no_geo) - len(shortlist)
        if extra_without_geo > 0:
            scenarios.append({
                "scenario": "geo_flexibility",
                "title": f"{extra_without_geo} more supplier(s) if delivery location is flexible",
                "description": (
                    f"Relaxing the delivery constraint from {', '.join(delivery_countries)} "
                    f"would add {extra_without_geo} supplier(s) to the pool."
                ),
                "parameter": "delivery_countries",
                "current_value": delivery_countries,
                "suggested_value": "flexible",
                "impact": f"{extra_without_geo} additional supplier(s) available if cross-border delivery acceptable",
            })

    return scenarios[:5]  # max 5 scenarios
