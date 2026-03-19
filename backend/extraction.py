"""
Step 2: LLM Extraction & Translation.
Parses free text into structured fields, translates non-English, detects contradictions.
Falls back to regex if LLM unavailable.
"""

import re
from datetime import datetime, timedelta
from typing import Optional

from backend.llm import call_claude_json, is_available
from backend.data_loader import DataStore


# --- LLM Extraction ---

EXTRACTION_SYSTEM = """You are a procurement request parser. Extract structured fields from purchase request text.
Return ONLY valid JSON with these fields (use null for missing/uncertain values):

{
  "category_l1": "IT | Facilities | Professional Services | Marketing",
  "category_l2": "specific subcategory from the taxonomy",
  "quantity": integer or null,
  "unit_of_measure": "device | unit | set | consulting_day | instance_hour | TB_month | GB_transfer | monthly_subscription | seat_license | campaign | project",
  "budget_amount": number or null,
  "currency": "EUR | CHF | USD",
  "delivery_countries": ["country codes"],
  "required_by_date": "YYYY-MM-DD or null",
  "preferred_supplier": "supplier name or null",
  "urgency": "critical | high | normal | flexible",
  "flexibility_signals": ["list of flexible requirements mentioned"],
  "constraints": ["list of hard constraints mentioned"],
  "text_quantity": integer or null (quantity explicitly mentioned in text, may differ from structured field),
  "text_budget": number or null (budget mentioned in text),
  "confidence": 0.0-1.0
}

Category taxonomy:
IT: Laptops, Mobile Workstations, Desktop Workstations, Monitors, Docking Stations, Smartphones, Tablets, Rugged Devices, Accessories Bundles, Replacement / Break-Fix Pool Devices, Cloud Compute, Cloud Storage, Cloud Networking, Managed Cloud Platform Services, Cloud Security Services
Facilities: Workstations and Desks, Office Chairs, Meeting Room Furniture, Storage Cabinets, Reception and Lounge Furniture
Professional Services: Cloud Architecture Consulting, Cybersecurity Advisory, Data Engineering Services, Software Development Services, IT Project Management Services
Marketing: Search Engine Marketing (SEM), Social Media Advertising, Content Production Services, Marketing Analytics Services, Influencer Campaign Management

Be precise. If the text says "approximately" or "around", note that in flexibility_signals."""


TRANSLATION_SYSTEM = """You are a translator for procurement requests. Translate the following text to English.
Return ONLY valid JSON:
{
  "translated_text": "the English translation",
  "original_language": "detected language name",
  "confidence": 0.0-1.0
}
Preserve all numbers, dates, supplier names, and technical terms exactly."""


NARRATION_SYSTEM = """You are a procurement audit report writer. Generate concise, professional recommendation notes for supplier comparisons.
Be specific: cite exact numbers, policy rules, and supplier names. Write for an auditor who needs to understand the decision without context."""


def extract_from_text(
    request_text: str,
    existing_fields: dict,
    categories: list[dict],
) -> dict:
    """
    Extract structured fields from request text using LLM.
    Falls back to regex if LLM unavailable.
    Returns dict of extracted fields.
    """
    if is_available():
        result = _llm_extract(request_text, existing_fields, categories)
        if result:
            return result

    # Fallback: regex extraction
    return _regex_extract(request_text, existing_fields)


def translate_text(text: str, language: str) -> dict:
    """
    Translate non-English text to English.
    Returns {"translated_text": ..., "original_language": ..., "confidence": ...}
    """
    if language == "en":
        return {"translated_text": text, "original_language": "English", "confidence": 1.0}

    if is_available():
        result = call_claude_json(
            TRANSLATION_SYSTEM,
            f"Translate this procurement request from {language}:\n\n{text}",
        )
        if result and "translated_text" in result:
            return result

    # Fallback: return original with note
    return {
        "translated_text": text,
        "original_language": language,
        "confidence": 0.3,
        "note": "Translation unavailable — LLM not available. Original text preserved.",
    }


def generate_recommendation_note(
    supplier_name: str,
    rank: int,
    total_price: float,
    currency: str,
    quality_score: int,
    risk_score: int,
    esg_score: int,
    lead_time_status: str,
    is_preferred: bool,
    is_incumbent: bool,
    capacity_exceeded: bool,
    context: dict,
) -> str:
    """Generate an audit-ready recommendation note for a supplier."""
    if is_available():
        note = _llm_narrate(
            supplier_name, rank, total_price, currency,
            quality_score, risk_score, esg_score,
            lead_time_status, is_preferred, is_incumbent,
            capacity_exceeded, context,
        )
        if note:
            return note

    # Fallback: template-based
    return _template_note(
        supplier_name, rank, total_price, currency,
        quality_score, risk_score, esg_score,
        lead_time_status, is_preferred, is_incumbent, capacity_exceeded,
    )


def generate_overall_narrative(
    request_summary: dict,
    shortlist: list,
    escalations: list,
    validation_issues: list,
) -> str:
    """Generate overall recommendation narrative."""
    if not is_available():
        return _template_overall(request_summary, shortlist, escalations, validation_issues)

    prompt = f"""Generate a concise audit-ready recommendation summary for this procurement request:

Request: {request_summary.get('category_l2', 'Unknown')} — {request_summary.get('quantity', '?')} units
Budget: {request_summary.get('currency', '')} {request_summary.get('budget_amount', 'not specified')}
Delivery: {', '.join(request_summary.get('delivery_countries', []))}

Top suppliers:
{chr(10).join(f"#{s.rank} {s.supplier_name}: {s.currency} {s.total_price:,.2f} (quality={s.quality_score}, risk={s.risk_score})" for s in shortlist[:3])}

Issues: {len(validation_issues)} validation issues, {len(escalations)} escalations
Blocking: {any(e.blocking for e in escalations)}

Write 2-3 sentences. Be specific with numbers and supplier names."""

    result = call_claude_json(
        NARRATION_SYSTEM,
        prompt,
        max_tokens=512,
    )
    if result and "narrative" in result:
        return result["narrative"]

    # Try raw text response
    from backend.llm import call_claude
    raw = call_claude(NARRATION_SYSTEM, prompt, max_tokens=512)
    if raw:
        return raw.strip()

    return _template_overall(request_summary, shortlist, escalations, validation_issues)


# --- LLM implementations ---

def _llm_extract(request_text: str, existing_fields: dict, categories: list[dict]) -> Optional[dict]:
    """Use Claude to extract fields from text."""
    existing_summary = "\n".join(
        f"  {k}: {v}" for k, v in existing_fields.items()
        if v is not None and k in (
            "category_l1", "category_l2", "quantity", "budget_amount",
            "currency", "required_by_date", "preferred_supplier_mentioned",
            "delivery_countries", "country",
        )
    )

    prompt = f"""Extract structured procurement data from this request.

REQUEST TEXT:
{request_text}

EXISTING STRUCTURED FIELDS (from the submission form — may be incomplete or contradictory with text):
{existing_summary if existing_summary else "  (none provided)"}

If the text mentions a quantity or budget that differs from the structured fields, include BOTH in your response (text_quantity vs quantity, text_budget vs budget_amount).

Return ONLY the JSON object."""

    return call_claude_json(EXTRACTION_SYSTEM, prompt)


def _llm_narrate(
    supplier_name, rank, total_price, currency,
    quality_score, risk_score, esg_score,
    lead_time_status, is_preferred, is_incumbent,
    capacity_exceeded, context,
) -> Optional[str]:
    """Use Claude to generate recommendation note."""
    prompt = f"""Write a 1-2 sentence recommendation note for this supplier:

Supplier: {supplier_name} (Rank #{rank})
Total price: {currency} {total_price:,.2f}
Quality: {quality_score}/100, Risk: {risk_score}/100, ESG: {esg_score}/100
Lead time: {lead_time_status}
Preferred: {is_preferred}, Incumbent: {is_incumbent}
Capacity risk: {capacity_exceeded}
Category: {context.get('category_l2', '')}
Budget: {context.get('currency', '')} {context.get('budget', 'N/A')}

Be specific and auditor-friendly. No fluff."""

    from backend.llm import call_claude
    result = call_claude(NARRATION_SYSTEM, prompt, max_tokens=256)
    return result.strip() if result else None


# --- Regex fallback ---

def _regex_extract(request_text: str, existing_fields: dict) -> dict:
    """Fallback regex extraction when LLM is unavailable."""
    text = request_text.lower() if request_text else ""
    result = {
        "confidence": 0.4,
        "extraction_method": "regex_fallback",
    }

    # Quantity extraction
    qty_patterns = [
        r'(\d[\d,]*)\s*(?:laptop|device|unit|monitor|chair|desk|station|phone|tablet|workstation|license|seat)',
        r'(\d[\d,]*)\s*(?:consulting\s*day|day)',
        r'(\d[\d,]*)\s*(?:instance[_ ]hour|hour)',
        r'(\d[\d,]*)\s*(?:campaign|project|set)',
        r'need\s+(\d[\d,]*)\s',
    ]
    for pattern in qty_patterns:
        match = re.search(pattern, text)
        if match:
            result["text_quantity"] = int(match.group(1).replace(",", ""))
            break

    # Budget extraction
    budget_patterns = [
        r'(?:budget|cost|price|amount|value)[:\s]*(?:of\s+)?(?:approximately\s+|approx\.?\s+|around\s+|about\s+|near\s+|~\s*)?(\d[\d,.\s]*\d)\s*(eur|chf|usd|€|\$)',
        r'(\d[\d,.\s]*\d)\s*(eur|chf|usd|€|\$)',
        r'(eur|chf|usd|€|\$)\s*(\d[\d,.\s]*\d)',
    ]
    for pattern in budget_patterns:
        match = re.search(pattern, text)
        if match:
            groups = match.groups()
            # Handle both orderings (amount currency, currency amount)
            if groups[0].upper() in ("EUR", "CHF", "USD", "€", "$"):
                amount_str = groups[1]
            else:
                amount_str = groups[0]
            amount_str = amount_str.replace(" ", "").replace(",", "")
            try:
                result["text_budget"] = float(amount_str)
            except ValueError:
                pass
            break

    # Date extraction
    date_patterns = [
        r'(\d{4}-\d{2}-\d{2})',
        r'by\s+(\d{1,2}\s+\w+\s+\d{4})',
        r'within\s+(\d+)\s*(?:week|day)',
    ]
    for pattern in date_patterns:
        match = re.search(pattern, text)
        if match:
            val = match.group(1)
            # ISO date
            if re.match(r'\d{4}-\d{2}-\d{2}', val):
                result["text_date"] = val
            # "within X weeks/days"
            elif val.isdigit():
                try:
                    days = int(val)
                    if "week" in text[match.start():match.end() + 10]:
                        days *= 7
                    future = datetime.utcnow() + timedelta(days=days)
                    result["text_date"] = future.strftime("%Y-%m-%d")
                except (ValueError, OverflowError):
                    pass
            break

    # Supplier name extraction (look for known patterns)
    supplier_patterns = [
        r'(?:prefer|use|want|like)\s+(\w[\w\s]*?)(?:\s+if|\s+for|\s+with|\.|\,|$)',
    ]
    for pattern in supplier_patterns:
        match = re.search(pattern, text)
        if match:
            result["text_preferred_supplier"] = match.group(1).strip().title()
            break

    # Category detection from keywords
    category_map = {
        ("IT", "Laptops"): ["laptop", "notebooks", "macbook", "thinkpad"],
        ("IT", "Mobile Workstations"): ["mobile workstation"],
        ("IT", "Desktop Workstations"): ["desktop", "workstation pc", "tower"],
        ("IT", "Monitors"): ["monitor", "display", "screen"],
        ("IT", "Docking Stations"): ["docking station", "dock"],
        ("IT", "Smartphones"): ["smartphone", "phone", "iphone", "galaxy"],
        ("IT", "Tablets"): ["tablet", "ipad"],
        ("IT", "Rugged Devices"): ["rugged"],
        ("IT", "Accessories Bundles"): ["accessories", "keyboard", "mouse", "headset"],
        ("IT", "Cloud Compute"): ["cloud compute", "virtual machine", "vm instance", "ec2"],
        ("IT", "Cloud Storage"): ["cloud storage", "s3", "blob storage"],
        ("IT", "Cloud Networking"): ["cloud network", "vpc", "cdn"],
        ("IT", "Cloud Security Services"): ["cloud security"],
        ("IT", "Managed Cloud Platform Services"): ["managed cloud", "cloud platform"],
        ("Facilities", "Office Chairs"): ["chair", "office chair", "ergonomic chair"],
        ("Facilities", "Workstations and Desks"): ["desk", "standing desk", "workstation desk"],
        ("Facilities", "Meeting Room Furniture"): ["meeting room", "conference table"],
        ("Facilities", "Storage Cabinets"): ["cabinet", "storage cabinet", "filing"],
        ("Facilities", "Reception and Lounge Furniture"): ["reception", "lounge", "sofa"],
        ("Professional Services", "Cloud Architecture Consulting"): ["cloud architect", "cloud consulting"],
        ("Professional Services", "Cybersecurity Advisory"): ["cybersecurity", "security audit", "penetration test", "pentest"],
        ("Professional Services", "Data Engineering Services"): ["data engineer", "data pipeline", "etl"],
        ("Professional Services", "Software Development Services"): ["software develop", "app develop", "web develop"],
        ("Professional Services", "IT Project Management Services"): ["project management", "it project"],
        ("Marketing", "Search Engine Marketing (SEM)"): ["sem", "search engine marketing", "google ads", "ppc"],
        ("Marketing", "Social Media Advertising"): ["social media", "facebook ads", "instagram ads"],
        ("Marketing", "Content Production Services"): ["content production", "video production", "content creation"],
        ("Marketing", "Marketing Analytics Services"): ["marketing analytics", "campaign analytics"],
        ("Marketing", "Influencer Campaign Management"): ["influencer", "influencer campaign"],
    }
    for (cat_l1, cat_l2), keywords in category_map.items():
        if any(kw in text for kw in keywords):
            result["category_l1"] = cat_l1
            result["category_l2"] = cat_l2
            result["confidence"] = max(result.get("confidence", 0.4), 0.6)
            break

    # Country detection from text
    country_map = {
        "berlin": "DE", "munich": "DE", "germany": "DE", "deutschland": "DE",
        "zurich": "CH", "zürich": "CH", "switzerland": "CH", "schweiz": "CH",
        "paris": "FR", "france": "FR", "london": "UK", "england": "UK", "uk": "UK",
        "amsterdam": "NL", "netherlands": "NL", "vienna": "AT", "austria": "AT",
        "madrid": "ES", "spain": "ES", "barcelona": "ES",
        "rome": "IT", "milan": "IT", "italy": "IT",
        "brussels": "BE", "belgium": "BE",
        "warsaw": "PL", "poland": "PL",
        "new york": "US", "california": "US", "usa": "US", "united states": "US",
        "singapore": "SG", "sydney": "AU", "australia": "AU",
        "tokyo": "JP", "japan": "JP", "india": "IN", "mumbai": "IN",
        "dubai": "UAE", "south africa": "ZA",
        "toronto": "CA", "canada": "CA",
        "são paulo": "BR", "brazil": "BR", "mexico": "MX",
    }
    detected_countries = []
    for place, code in country_map.items():
        if place in text and code not in detected_countries:
            detected_countries.append(code)
    if detected_countries:
        result["delivery_countries"] = detected_countries

    # Urgency signals
    urgency_keywords = {
        "critical": ["urgent", "critical", "asap", "immediately", "emergency"],
        "high": ["quickly", "fast", "soon", "expedite", "rush"],
        "flexible": ["if possible", "approximately", "around", "flexible", "no rush"],
    }
    for level, keywords in urgency_keywords.items():
        if any(kw in text for kw in keywords):
            result["urgency"] = level
            break

    return result


# --- Template fallbacks ---

def _template_note(
    supplier_name, rank, total_price, currency,
    quality_score, risk_score, esg_score,
    lead_time_status, is_preferred, is_incumbent, capacity_exceeded,
) -> str:
    """Template-based recommendation note."""
    parts = []
    if is_incumbent:
        parts.append("Incumbent supplier")
    if is_preferred:
        parts.append("preferred supplier")
    parts.append(f"Total {currency} {total_price:,.2f}")
    parts.append(f"quality {quality_score}/100")
    parts.append(f"risk {risk_score}/100")
    if lead_time_status == "infeasible":
        parts.append("lead time infeasible")
    elif lead_time_status == "expedited_only":
        parts.append("requires expedited delivery")
    if capacity_exceeded:
        parts.append("capacity risk: quantity exceeds monthly capacity")
    return ". ".join(parts) + "."


def _template_overall(request_summary, shortlist, escalations, validation_issues) -> str:
    """Template-based overall narrative — solution-focused."""
    parts = []
    if shortlist:
        winner = shortlist[0]
        parts.append(
            f"Top recommendation: {winner.supplier_name} at "
            f"{winner.currency} {winner.total_price:,.2f} "
            f"(composite score {winner.composite_score:.4f})."
        )
        if len(shortlist) > 1:
            parts.append(f"{len(shortlist)} suppliers compared.")
    else:
        parts.append("No suppliers matched current criteria. Supplier discovery has been triggered.")

    # Only mention real issues, not adaptations
    real_issues = [i for i in validation_issues if not i.type.startswith("auto_adapt_")]
    adaptations = [i for i in validation_issues if i.type.startswith("auto_adapt_")]

    if adaptations:
        adapted = [a.type.replace("auto_adapt_", "") for a in adaptations]
        parts.append(f"Auto-adapted for missing: {', '.join(adapted)}.")

    if escalations:
        blocking = [e for e in escalations if e.blocking]
        advisories = [e for e in escalations if not e.blocking]
        if blocking:
            parts.append(f"{len(blocking)} compliance item(s) require review.")
        if advisories:
            parts.append(f"{len(advisories)} advisory note(s) for consideration.")

    return " ".join(parts)
