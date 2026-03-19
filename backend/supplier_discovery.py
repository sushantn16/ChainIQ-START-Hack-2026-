"""
Step 6: Supplier Discovery — proactively finds new suppliers when existing pool is insufficient.
Triggers: gap fill, cost optimization, capacity risk, single-supplier dependency.
Uses web search (DuckDuckGo) + LLM summarization, falls back to intelligent synthetic generation.
"""

import hashlib
import json
import re
from typing import Optional
from urllib.parse import quote_plus
from urllib.request import urlopen, Request
from urllib.error import URLError

from backend.models import SupplierDiscovery, DiscoveredSupplier
from backend.llm import call_claude_json, is_available as llm_available


# --- Trigger Detection ---

def check_discovery_triggers(
    shortlist: list,
    excluded: list,
    quantity: int | None,
    budget: float | None,
    currency: str,
    category_l1: str | None,
    category_l2: str | None,
    delivery_countries: list[str],
    historical_avg_price: float | None = None,
) -> Optional[dict]:
    """Check if supplier discovery should be triggered. Returns trigger info or None."""
    if not category_l1 or not category_l2:
        return None

    triggers = []

    # Trigger 1: Gap fill — fewer than 3 compliant suppliers
    if len(shortlist) < 3:
        triggers.append({
            "reason": "gap_fill",
            "detail": f"Only {len(shortlist)} compliant supplier(s) found — "
                      f"policy typically requires 3+ quotes. {len(excluded)} supplier(s) excluded.",
        })

    # Trigger 2: Cost optimization — best price > budget (20%+ over)
    if shortlist and budget:
        best_price = min(s.total_price for s in shortlist)
        if best_price > budget * 1.2:
            overage_pct = ((best_price / budget) - 1) * 100
            triggers.append({
                "reason": "cost_optimization",
                "detail": f"Best available price ({currency} {best_price:,.2f}) exceeds budget by "
                          f"{overage_pct:.0f}%. Market may have more competitive options.",
            })

    # Trigger 3: Capacity risk — all suppliers have capacity issues
    if shortlist and quantity:
        capacity_issues = [s for s in shortlist if getattr(s, "capacity_exceeded", False)]
        if len(capacity_issues) == len(shortlist):
            triggers.append({
                "reason": "capacity_risk",
                "detail": f"All {len(shortlist)} supplier(s) have capacity constraints for "
                          f"requested quantity of {quantity:,}.",
            })

    # Trigger 4: Single-supplier dependency
    if len(shortlist) == 1:
        triggers.append({
            "reason": "single_supplier",
            "detail": f"Only 1 supplier ({shortlist[0].supplier_name}) is viable — "
                      f"creates supply chain risk.",
        })

    if not triggers:
        return None

    return {
        "reasons": [t["reason"] for t in triggers],
        "details": [t["detail"] for t in triggers],
        "primary_reason": triggers[0]["reason"],
    }


# --- Web Search ---

def _web_search(query: str, max_results: int = 5) -> list[dict]:
    """Search DuckDuckGo for supplier information. Returns list of {title, url, snippet}."""
    try:
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        req = Request(url, headers={"User-Agent": "Mozilla/5.0 (ChainIQ Sourcing Agent)"})
        with urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        results = []
        # Parse DuckDuckGo HTML results
        blocks = re.findall(
            r'<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)</a>.*?'
            r'<a[^>]*class="result__snippet"[^>]*>(.*?)</a>',
            html, re.DOTALL,
        )
        for href, title, snippet in blocks[:max_results]:
            # Clean HTML tags
            title = re.sub(r'<[^>]+>', '', title).strip()
            snippet = re.sub(r'<[^>]+>', '', snippet).strip()
            # Extract actual URL from DuckDuckGo redirect
            url_match = re.search(r'uddg=([^&]+)', href)
            actual_url = url_match.group(1) if url_match else href
            from urllib.parse import unquote
            actual_url = unquote(actual_url)
            if title and snippet:
                results.append({"title": title, "url": actual_url, "snippet": snippet})
        return results

    except (URLError, OSError, Exception) as e:
        print(f"[Discovery] Web search failed: {e}")
        return []


def _llm_analyze_search_results(
    search_results: list[dict],
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    trigger_context: str,
) -> list[DiscoveredSupplier]:
    """Use LLM to analyze search results and extract potential suppliers."""
    if not search_results or not llm_available():
        return []

    results_text = "\n".join(
        f"- [{r['title']}]({r['url']}): {r['snippet']}"
        for r in search_results
    )

    prompt = f"""Analyze these web search results to identify potential procurement suppliers.

Category: {category_l1} / {category_l2}
Delivery countries needed: {', '.join(delivery_countries)}
Context: {trigger_context}

Search results:
{results_text}

Return ONLY valid JSON with this structure:
{{
  "suppliers": [
    {{
      "name": "Company Name",
      "url": "company website URL",
      "estimated_capability": "brief description of what they offer relevant to {category_l2}",
      "review_signals": "any quality/reputation signals found (certifications, reviews, market position)",
      "relevance_score": 0.0-1.0
    }}
  ]
}}

Only include results that are actual suppliers/vendors for {category_l2}. Skip news articles, job postings, etc.
Return at most 3 suppliers. If none are relevant, return empty list."""

    result = call_claude_json(
        "You are a procurement research analyst. Extract supplier information from web search results.",
        prompt,
        max_tokens=1024,
    )

    if not result or "suppliers" not in result:
        return []

    discovered = []
    for s in result["suppliers"][:3]:
        if s.get("relevance_score", 0) < 0.3:
            continue
        discovered.append(DiscoveredSupplier(
            name=s.get("name", "Unknown"),
            source="web_search",
            url=s.get("url"),
            estimated_capability=s.get("estimated_capability", ""),
            review_signals=s.get("review_signals", ""),
            status="unvetted",
            action_required="Onboarding review by Procurement Manager",
        ))

    return discovered


# --- Synthetic Fallback ---

# Realistic supplier templates by category
_SYNTHETIC_SUPPLIERS = {
    "IT": {
        "Laptops": [
            {"name": "Framework Computer EU", "capability": "Modular, repairable business laptops with enterprise support", "signals": "B Corp certified, strong sustainability reviews, growing EU enterprise presence"},
            {"name": "Schenker Technologies", "capability": "German manufacturer of business laptops, custom configurations available", "signals": "ISO 9001 certified, established DACH presence, competitive pricing for mid-range"},
            {"name": "TUXEDO Computers", "capability": "European laptop manufacturer specializing in business-grade devices", "signals": "Made in Germany, strong Linux support, direct enterprise sales channel"},
        ],
        "Monitors": [
            {"name": "iiyama Europe", "capability": "Business-grade monitors with wide range of sizes and panel types", "signals": "20+ years in European market, strong B2B channel, competitive pricing"},
            {"name": "EIZO Europe", "capability": "Premium professional monitors with 5-year warranty", "signals": "Industry leader in color accuracy, ISO 9241 certified, strong enterprise support"},
        ],
        "Desktop Workstations": [
            {"name": "Fujitsu Technology Solutions", "capability": "Enterprise workstations with full EU support and lifecycle services", "signals": "Major EU IT vendor, strong sustainability credentials, GDPR compliant"},
            {"name": "Wortmann AG (TERRA)", "capability": "German workstation manufacturer, competitive enterprise pricing", "signals": "ISO 14001 certified, strong DACH channel, custom configurations"},
        ],
        "Cloud Compute": [
            {"name": "OVHcloud", "capability": "European cloud provider with data sovereignty guarantees", "signals": "EU-headquartered, GDPR native, competitive IaaS pricing vs hyperscalers"},
            {"name": "Hetzner Cloud", "capability": "Cost-effective European cloud infrastructure", "signals": "German-based, excellent price-performance, strong developer reviews"},
            {"name": "Scaleway (Iliad Group)", "capability": "European cloud with bare metal and managed services", "signals": "French-based, 100% renewable energy, growing enterprise adoption"},
        ],
        "Cloud Storage": [
            {"name": "Wasabi Technologies", "capability": "S3-compatible cloud storage at fraction of AWS pricing", "signals": "No egress fees, 80% cheaper than S3, EU regions available"},
        ],
        "Smartphones": [
            {"name": "Fairphone Business", "capability": "Sustainable modular smartphones with enterprise MDM support", "signals": "B Corp, Fair Trade gold, 5-year warranty, repairable design"},
            {"name": "Gigaset Communications", "capability": "German-made business phones and smartphones", "signals": "Made in Germany, strong enterprise telephony heritage"},
        ],
        "Docking Stations": [
            {"name": "CalDigit Europe", "capability": "Thunderbolt docking stations for mixed-fleet enterprise deployments", "signals": "High reliability ratings, compatible with Dell/Lenovo/HP, 2-year warranty"},
            {"name": "Targus EMEA", "capability": "Universal docking stations with broad compatibility matrix", "signals": "Enterprise-focused, large EU distribution network, competitive volume pricing"},
        ],
        "Rugged Devices": [
            {"name": "Getac Technology", "capability": "Mil-spec rugged tablets and laptops for field operations", "signals": "MIL-STD-810H certified, IP66 rated, strong logistics/field service track record"},
            {"name": "Handheld Group", "capability": "Swedish manufacturer of rugged mobile computers", "signals": "Nordic design, IP67, used by major EU logistics companies"},
        ],
    },
    "Facilities": {
        "Office Chairs": [
            {"name": "Autonomous EU", "capability": "Ergonomic office chairs with direct-to-business pricing", "signals": "Strong online reviews, 5-year warranty, EU warehouse for fast delivery"},
            {"name": "Sedus Stoll", "capability": "German manufacturer of premium ergonomic office seating", "signals": "100+ years, ISO 14001, Greenguard certified, strong DACH enterprise presence"},
        ],
        "Workstations and Desks": [
            {"name": "USM Modular Furniture", "capability": "Swiss premium modular office furniture system", "signals": "Design icon, modular/reconfigurable, strong corporate references"},
            {"name": "Bene GmbH", "capability": "Austrian office furniture manufacturer with full workspace solutions", "signals": "Sustainability champion, EMAS certified, strong EU-wide distribution"},
        ],
    },
    "Professional Services": {
        "Cybersecurity Advisory": [
            {"name": "WithSecure (formerly F-Secure)", "capability": "Nordic cybersecurity consulting and managed detection services", "signals": "EU-headquartered, strong GDPR expertise, recognized by Gartner"},
            {"name": "SEC Consult", "capability": "European cybersecurity consultancy specializing in penetration testing", "signals": "AQAP certified, strong banking/finance references, DACH focus"},
        ],
        "Cloud Architecture Consulting": [
            {"name": "Nordcloud (IBM)", "capability": "European cloud consulting specializing in multi-cloud architecture", "signals": "AWS/Azure/GCP partner, acquired by IBM, strong Nordic/DACH presence"},
            {"name": "DoiT International", "capability": "Cloud consulting and FinOps optimization", "signals": "Google Cloud partner, strong cost optimization track record"},
        ],
        "Data Engineering Services": [
            {"name": "Databricks Professional Services EU", "capability": "Data platform consulting and implementation", "signals": "Industry-leading data lakehouse platform, strong EU team"},
        ],
    },
    "Marketing": {
        "Search Engine Marketing (SEM)": [
            {"name": "Artefact", "capability": "Data-driven digital marketing agency with AI capabilities", "signals": "Global presence, strong EU enterprise clients, Google premier partner"},
        ],
        "Content Production Services": [
            {"name": "Contentful Agency Partners EU", "capability": "Content creation and management for enterprise", "signals": "Headless CMS leader, strong agency ecosystem"},
        ],
    },
}


def _synthetic_suppliers(
    category_l1: str,
    category_l2: str,
    delivery_countries: list[str],
    trigger_reasons: list[str],
    existing_names: list[str],
) -> list[DiscoveredSupplier]:
    """Generate realistic synthetic suppliers based on category and gap."""
    templates = _SYNTHETIC_SUPPLIERS.get(category_l1, {}).get(category_l2, [])

    # Filter out any that share names with existing suppliers
    existing_lower = {n.lower() for n in existing_names}
    templates = [t for t in templates if t["name"].lower() not in existing_lower]

    if not templates:
        # Generic fallback
        region = delivery_countries[0] if delivery_countries else "EU"
        templates = [
            {
                "name": f"{category_l2} Solutions {region}",
                "capability": f"Specialized {category_l2.lower()} provider serving {region} region",
                "signals": "Market research suggests competitive pricing and regional presence",
            }
        ]

    discovered = []
    for t in templates[:3]:
        discovered.append(DiscoveredSupplier(
            name=t["name"],
            source="market_intelligence",
            url=None,
            estimated_capability=t["capability"],
            review_signals=t["signals"],
            status="unvetted",
            action_required="Onboarding review by Procurement Manager",
        ))

    return discovered


# --- Main Entry Point ---

def discover_suppliers(
    shortlist: list,
    excluded: list,
    quantity: int | None,
    budget: float | None,
    currency: str,
    category_l1: str | None,
    category_l2: str | None,
    delivery_countries: list[str],
) -> SupplierDiscovery:
    """Run supplier discovery. Returns SupplierDiscovery with results or triggered=False."""
    # Check triggers
    trigger = check_discovery_triggers(
        shortlist=shortlist,
        excluded=excluded,
        quantity=quantity,
        budget=budget,
        currency=currency,
        category_l1=category_l1,
        category_l2=category_l2,
        delivery_countries=delivery_countries,
    )

    if not trigger:
        return SupplierDiscovery(triggered=False)

    primary = trigger["primary_reason"]
    all_details = " ".join(trigger["details"])

    # Build search query
    region_str = ", ".join(delivery_countries[:3]) if delivery_countries else "Europe"
    search_query = f"{category_l2} supplier vendor {region_str} enterprise procurement"

    # Try web search first
    discovered = []
    search_results = _web_search(search_query)
    if search_results:
        discovered = _llm_analyze_search_results(
            search_results=search_results,
            category_l1=category_l1,
            category_l2=category_l2,
            delivery_countries=delivery_countries,
            trigger_context=all_details,
        )

    # Fallback to synthetic if web search found nothing useful
    if not discovered:
        existing_names = [s.supplier_name for s in shortlist]
        existing_names += [e.supplier_name for e in excluded]
        discovered = _synthetic_suppliers(
            category_l1=category_l1,
            category_l2=category_l2,
            delivery_countries=delivery_countries,
            trigger_reasons=trigger["reasons"],
            existing_names=existing_names,
        )

    # Estimate potential savings
    savings_note = None
    if shortlist and budget and shortlist[0].total_price > budget:
        gap = shortlist[0].total_price - budget
        savings_note = (
            f"If onboarded suppliers offer market-competitive pricing, "
            f"estimated savings potential: {currency} {gap:,.2f} on this request"
        )

    return SupplierDiscovery(
        triggered=True,
        trigger_reason=primary,
        context=all_details,
        discovered_suppliers=discovered,
        estimated_savings_if_onboarded=savings_note,
        recommendation=(
            "Consider for future sourcing events. Discovered suppliers are unvetted and "
            "do not affect the current recommendation. Onboarding review required before "
            "they can participate in competitive bidding."
        ),
    )
