# ChainIQ — Audit-Ready Autonomous Sourcing Agent

## Implementation Plan

---

## 1. System Overview

An intelligent sourcing agent that takes unstructured purchase requests and produces structured, compliant, audit-ready supplier recommendations. The system is built around a **deterministic core with a thin LLM layer** — ensuring every decision is traceable, reproducible, and explainable.

**Core principle:** The system never hard-fails. Every step carries confidence, gaps, and assumptions. When it can't decide confidently, it escalates — and that's by design.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (React + Tailwind)          │
│  Request view │ Comparison │ Audit trail │ Batch dashboard│
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────┴────────────────────────────────┐
│                   BACKEND (Python FastAPI)                │
│                                                          │
│  ┌──────┐  ┌──────────┐  ┌────────┐  ┌──────────────┐  │
│  │ LLM  │  │ Policy   │  │Supplier│  │  Escalation  │  │
│  │Layer │  │ Engine   │  │Matcher │  │  Engine      │  │
│  └──┬───┘  └────┬─────┘  └───┬────┘  └──────┬───────┘  │
│     │           │             │               │          │
│  ┌──┴───────────┴─────────────┴───────────────┴───────┐  │
│  │              Data Layer (in-memory)                 │  │
│  │  requests.json │ suppliers.csv │ pricing.csv        │  │
│  │  policies.json │ categories.csv │ historical_awards │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Tech Stack
- **Backend:** Python 3.11+ / FastAPI
- **LLM:** Claude API (via Anthropic SDK) — extraction, translation, narration
- **Frontend:** React + Tailwind CSS (or Streamlit as fallback)
- **Data:** All files loaded into memory at startup (total < 2MB)
- **Hosting:** Azure (credits provided)
- **No database needed** — JSON/CSV fits in memory

---

## 3. Pipeline — 10 Steps

### Step 1: Request Intake
- **Type:** Passthrough
- **Input:** Raw request JSON from requests.json
- **Output:** Request object routed to pipeline
- **Logic:**
  - Detect channel (teams/email/portal)
  - Detect language from `request_language` field
  - Initial null check: if budget AND quantity both null → fast-path to ER-001

### Step 2: LLM Extraction & Translation
- **Type:** LLM-powered (with regex fallback)
- **Input:** Raw request_text + structured fields
- **Output:** Normalized fields + per-field confidence + detected contradictions
- **Logic:**
  - If `request_language` != 'en': translate request_text via Claude, keep original
  - Extract from text: quantity, budget, delivery date, preferred supplier, urgency signals, flexibility signals
  - Compare extracted values vs structured fields (quantity in text vs quantity field)
  - Assign confidence 0.0–1.0 per field
- **Fallback:** If LLM fails/times out → regex extraction:
  - Quantity: `r'(\d[\d,]*)\s*(laptop|unit|device|day|hour|seat|set|project|campaign)'`
  - Budget: `r'([\d,.]+)\s*(EUR|CHF|USD)'`
  - Date: ISO format pattern
  - Confidence drops to 0.4 for regex-extracted fields
- **Creative additions:**
  - Intent classification: urgency vs flexibility signals
  - Smart clarification: generate natural-language question for missing data

### Step 3: Validation Engine
- **Type:** Deterministic
- **Input:** Extracted structured fields + confidence scores
- **Output:** `validation.issues[]` — each with `{id, severity, type, description, action_required}`
- **Checks:**
  1. **Completeness:** budget null? quantity null? date null? → severity: critical
  2. **Budget feasibility:** qty × cheapest_available_unit_price > budget? → severity: critical
  3. **Lead time feasibility:** days_until_required < min(expedited_lead_time) for any supplier? → severity: high
  4. **Text/field consistency:** quantity in text != quantity field? → severity: high
  5. **Category validity:** does category_l2 exist in categories.csv? → severity: critical if not
- **Severity levels:** critical (blocks), high (needs attention), medium (noted), low (informational)
- **Creative additions:**
  - Auto-suggest fixes: "Reduce quantity to 169 to fit budget" / "Increase budget to EUR 35,712"

### Step 4: Policy Engine
- **Type:** Deterministic
- **Input:** Validated fields (budget, currency, category, delivery_countries)
- **Output:** Applicable rules, approval tier, quotes required, violations, restrictions
- **Sub-checks:**

  **4a. Approval Threshold (AT-001→015)**
  - Match budget to tier by currency
  - TRAP: USD thresholds use `min_value`/`max_value` (not `min_amount`/`max_amount`)
  - Output: tier ID, quotes_required, approvers, deviation_approval_required_from
  - Handle "actual value vs stated budget" — if budget is insufficient but real cost is higher, use real cost for tier

  **4b. Preferred Supplier Check**
  - Is `preferred_supplier_mentioned` in policies.json `preferred_suppliers`?
  - Check: correct category_l1 + category_l2? correct region_scope vs delivery_countries?
  - 15 requests name Boutique Creator Network for wrong categories — must detect
  - Output: eligible / not_eligible with reason

  **4c. Restricted Supplier Check**
  - Merge `suppliers.csv` `is_restricted` flag + `policies.json` `restricted_suppliers`
  - Check three restriction types:
    - **Global:** cannot use without exception (Boutique Creator Network > EUR 75K)
    - **Country-scoped:** restricted only in specific countries (Computacenter in CH+DE for Laptops)
    - **Value-conditional:** restricted above value threshold
  - `is_restricted` in CSV is a hint only — policies.json is authoritative

  **4d. Category Rules (CR-001→010)**
  - Match by category_l1 + category_l2
  - 10 rules: mandatory_comparison, engineering_spec_review, fast_track, residency_check, security_review, design_signoff, cv_review, certification_check, performance_baseline, brand_safety

  **4e. Geography Rules (GR-001→008)**
  - Match by delivery_countries
  - 8 rules covering: Swiss sovereignty, DE lead time, FR language, ES rollout, US/APAC/MEA data sovereignty, LATAM DPA

### Step 5: Supplier Matching
- **Type:** Deterministic
- **Input:** Category L1+L2, delivery_countries, currency, restrictions, data_residency_constraint, esg_requirement
- **Output:** Candidate suppliers list + exclusion list with reasons
- **Filters (in order):**
  1. Category match: supplier category_l1 + category_l2 matches request
  2. Geographic match: ALL delivery_countries ⊆ supplier service_regions
  3. Restriction filter: remove restricted suppliers (from Step 4c)
  4. Capacity check: if quantity > capacity_per_month → flag but don't exclude (trigger ER-006)
  5. Data residency: if constraint=true, only include data_residency_supported=true suppliers
  6. Contract status: must be 'active'
- **Output per excluded supplier:** `{supplier_id, reason}` — e.g. "does not serve category", "restricted in DE", "service_regions don't cover CH"

### Step 6: Supplier Discovery (NEW — Differentiator)
- **Type:** LLM + Web Search (runs in parallel, never blocks main pipeline)
- **Triggers:**
  1. **Gap fill:** < 3 compliant suppliers found (can't meet quote requirements)
  2. **Cost optimization:** best price > 20% above historical average for category
  3. **Capacity risk:** qty > capacity_per_month for all/most candidates, OR single-supplier dependency
  4. **New category:** request text mentions capability not in categories.csv
- **Implementation:**
  - Web search API (Azure Bing Search) for suppliers matching category + region
  - Claude summarizes: name, URL, estimated capability, review signals
  - All results flagged as `"status": "unvetted"` — never auto-awarded
- **Output:**
  ```json
  "supplier_discovery": {
    "triggered": true,
    "trigger_reason": "cost_optimization | gap_fill | capacity_risk | new_category",
    "discovered_suppliers": [{
      "name": "...",
      "source": "web_search",
      "url": "...",
      "estimated_capability": "...",
      "review_signals": "...",
      "status": "unvetted",
      "action_required": "Onboarding review by Procurement Manager"
    }],
    "estimated_savings_if_onboarded": "EUR X on this request",
    "recommendation": "Consider for future sourcing events. Does not affect current recommendation."
  }
  ```
- **Creative value:** Shows the system doesn't just process — it actively improves the supplier pool

### Step 7: Pricing & Composite Scoring
- **Type:** Deterministic
- **Input:** Candidate suppliers, quantity, delivery date, pricing.csv
- **Output:** Ranked shortlist with scores, pricing breakdown, lead time analysis
- **Logic:**

  **7a. Price Calculation**
  - Match quantity to correct tier: min_quantity ≤ qty ≤ max_quantity
  - Hardware: 4 tiers (1-99, 100-499, 500-1999, 2000+)
  - Calculate: unit_price × quantity = standard_total
  - If lead time infeasible with standard → calculate expedited: expedited_unit_price × quantity
  - Check MOQ: if quantity < moq → use moq for pricing, note overage

  **7b. Lead Time Assessment**
  - days_available = (required_by_date - today).days
  - standard_feasible = standard_lead_time_days ≤ days_available
  - expedited_feasible = expedited_lead_time_days ≤ days_available
  - Neither feasible → flag, still include supplier but note infeasibility

  **7c. Composite Score**
  ```
  score = w_price    * (1 - normalize(total_price))     # lower price = higher score
        + w_quality  * (quality_score / 100)
        + w_risk     * (1 - risk_score / 100)            # lower risk = higher score
        + w_esg      * (esg_score / 100)
        + w_lead     * lead_time_feasibility_score        # 1.0 if standard OK, 0.5 if only expedited, 0.0 if neither
        + w_preferred * (1.0 if preferred else 0.0)
  ```
  Default weights: price=0.30, quality=0.20, risk=0.20, esg=0.10, lead=0.10, preferred=0.10
  If ESG not requested: w_esg=0, redistribute to others
  Missing dimension → weight=0, noted in output

  **7d. Historical Context**
  - Look up request_id in historical_awards.csv
  - If found: include past decision as context ("Previously awarded to X at Y")
  - If not found: look for similar requests (same category + country) for pattern context

- **Creative additions:**
  - What-if analysis: "If budget +20%: Supplier X viable" / "If deadline +14d: 3 more qualify"
  - TCO view: unit price + expedited premium + MOQ overage

### Step 8: Comparison & Explanation
- **Type:** Deterministic structure + LLM narration
- **Input:** Ranked suppliers with all scores + policy evaluation + validation issues
- **Output:** Formatted comparison + recommendation narrative + exclusion reasons
- **Components:**
  - Side-by-side supplier table (top 3): price, quality, risk, ESG, lead time, preferred, compliance
  - Exclusion list with per-supplier reasons
  - Recommendation note per supplier (LLM-generated, grounded in data)
  - Overall recommendation confidence score
- **Creative additions:**
  - Visual score radar per supplier
  - Confidence breakdown: "78% confident. Reduced: tight lead time -10%, only 2 suppliers -12%"

### Step 9: Escalation Engine
- **Type:** Deterministic
- **Input:** All validation issues + policy violations + supplier match results
- **Output:** `escalations[]` — each with `{rule, trigger, target, blocking}`
- **Rules:**
  | Rule | Trigger | Target | Blocking |
  |------|---------|--------|----------|
  | ER-001 | Missing required info (budget, qty, spec) | Requester Clarification | Yes |
  | ER-002 | Preferred supplier is restricted | Procurement Manager | Yes |
  | ER-003 | Value exceeds tier threshold | Head of Strategic Sourcing | No |
  | ER-004 | No compliant supplier found | Head of Category | Yes |
  | ER-005 | Data residency can't be satisfied | Security/Compliance | Yes |
  | ER-006 | Qty exceeds supplier capacity | Sourcing Excellence Lead | No |
  | ER-007 | Brand safety (Marketing/Influencer) | Marketing Governance Lead | No |
  | ER-008 | Supplier not registered in delivery country | Regional Compliance Lead | Yes |
- **Output determines recommendation status:**
  - Any blocking escalation → `"status": "cannot_proceed"`
  - Only non-blocking → `"status": "recommend_with_escalation"`
  - No escalations → `"status": "recommend"`

### Step 10: Audit-Ready Output
- **Type:** Assembly + LLM narration
- **Output JSON structure** (matches example_output.json):
  ```json
  {
    "request_id": "REQ-XXXXXX",
    "processed_at": "ISO timestamp",
    "request_interpretation": { ... },
    "validation": { "completeness": "pass|fail", "issues_detected": [...] },
    "policy_evaluation": {
      "approval_threshold": { ... },
      "preferred_supplier": { ... },
      "restricted_suppliers": { ... },
      "category_rules_applied": [...],
      "geography_rules_applied": [...]
    },
    "supplier_shortlist": [ { rank, supplier_id, pricing, scores, note } ],
    "suppliers_excluded": [ { supplier_id, reason } ],
    "supplier_discovery": { ... },         // NEW
    "escalations": [ { rule, trigger, target, blocking } ],
    "recommendation": { status, reason, preferred_supplier_if_resolved },
    "audit_trail": {
      "policies_checked": [...],
      "supplier_ids_evaluated": [...],
      "pricing_tiers_applied": "...",
      "data_sources_used": [...],
      "historical_awards_consulted": true|false
    }
  }
  ```

---

## 4. Data Model Traps & Handling

These are intentional traps in the data that our system must handle:

| Trap | Where | How We Handle |
|------|-------|---------------|
| USD threshold field names differ | policies.json AT-011→015 use `min_value`/`max_value` instead of `min_amount`/`max_amount` | Normalize on load: map both to `min_amount`/`max_amount` |
| `is_restricted` is unreliable | suppliers.csv | Always cross-reference policies.json `restricted_suppliers`. CSV flag is hint only |
| Preferred supplier wrong category | 15 requests name Boutique Creator Network for IT/Facilities | Check supplier category_l1+l2 matches request category |
| Preferred supplier wrong region | Some suppliers don't cover delivery country | Check delivery_countries ⊆ supplier service_regions |
| Conditional restrictions | Boutique Creator Network: only restricted > EUR 75K | Parse restriction rules, apply conditionally by value |
| Country-scoped restrictions | Computacenter: restricted in CH+DE for Laptops only | Match restriction_scope against delivery_countries |
| Quantity/text mismatch | Some requests have qty field != qty in text | Extract both, flag discrepancy, use structured field with note |
| Null budget AND quantity | 3 requests (REQ-000270/271/272) | Immediate ER-001, can't compute pricing or tier |
| award_date != delivery_date | historical_awards.csv | Don't treat late awards as errors |

---

## 5. Project Structure

```
ChainIQ-START-Hack-2026-/
├── data/                          # Provided datasets (don't modify)
│   ├── requests.json
│   ├── suppliers.csv
│   ├── pricing.csv
│   ├── policies.json
│   ├── categories.csv
│   └── historical_awards.csv
├── backend/
│   ├── main.py                    # FastAPI app, startup loader, API routes
│   ├── models.py                  # Pydantic models for request/response
│   ├── pipeline.py                # Orchestrator: runs all steps in sequence
│   ├── extraction.py              # Step 2: LLM extraction + translation + regex fallback
│   ├── validation.py              # Step 3: completeness, feasibility, consistency
│   ├── policy_engine.py           # Step 4: thresholds, preferred, restricted, category/geo rules
│   ├── supplier_matcher.py        # Step 5: filter and match suppliers
│   ├── supplier_discovery.py      # Step 6: web search for new suppliers
│   ├── scoring.py                 # Step 7: pricing calculation + composite score
│   ├── comparison.py              # Step 8: ranking + LLM narrative
│   ├── escalation.py              # Step 9: escalation rule engine
│   ├── data_loader.py             # Load all CSV/JSON into memory at startup
│   └── llm.py                     # Claude API wrapper (extraction, translation, narration)
├── frontend/                      # React + Tailwind (or Streamlit fallback)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── RequestInput.tsx    # Free-text input + file upload
│   │   │   ├── RequestList.tsx     # Browse all 304 requests
│   │   │   ├── PipelineView.tsx    # Step-by-step pipeline visualization
│   │   │   ├── SupplierComparison.tsx  # Side-by-side supplier cards
│   │   │   ├── EscalationPanel.tsx # Escalation notices with routing
│   │   │   ├── AuditTrail.tsx      # Expandable audit log
│   │   │   ├── BatchDashboard.tsx  # Aggregate stats for all requests
│   │   │   └── ConfidenceMeter.tsx # Per-step confidence display
│   │   └── ...
│   └── ...
├── examples/                      # Provided examples
├── viz_*.html                     # Data exploration dashboards
├── PLAN.md                        # This file
└── README.md                      # Challenge description
```

---

## 6. API Endpoints

```
POST /api/process              # Process a single request — see modes below
GET  /api/requests             # List all 304 requests with basic metadata
GET  /api/requests/{id}        # Get single request detail
GET  /api/results/{id}         # Get processed result for a request
POST /api/batch                # Process multiple requests, return aggregate stats
GET  /api/suppliers            # List all suppliers with scores
GET  /api/policies             # Return policy summary
GET  /api/dashboard            # Batch stats: auto-resolved, escalated, blocked counts
```

### POST /api/process — Two Modes

**Mode 1: Process existing request** (from requests.json)
```json
{ "request_id": "REQ-000004" }
```

**Mode 2: Process new free-text request** (live input from user/judge)
```json
{
  "request_text": "Need 500 laptops in 2 weeks, prefer Dell, budget 400k EUR, deliver to Germany and France",
  "currency": "EUR",
  "country": "DE",
  "delivery_countries": ["DE", "FR"]
}
```
All fields except `request_text` are optional — the LLM extracts them from text if missing.

The pipeline is identical for both modes. Mode 2 just skips the lookup and feeds the text directly into Step 2 (Extraction). This means:
- Judges can type any request live and watch it process in real-time
- Proves the system is general-purpose, not hardcoded to the 304 provided requests
- The frontend has both a "pick from list" dropdown AND a free-text input box

**This is the strongest possible demo moment:** a judge types their own procurement request and gets a full audit-ready recommendation in seconds.

---

## 7. Implementation Priority

### Phase 1: Core Pipeline (MUST — gets you a working demo)
1. `data_loader.py` — load all 6 files into memory, normalize USD threshold field names
2. `models.py` — Pydantic models matching example_output.json structure
3. `policy_engine.py` — threshold lookup, preferred/restricted checks, category/geo rules
4. `supplier_matcher.py` — filter by category, region, restriction, capacity, residency
5. `scoring.py` — pricing tier selection, cost calculation, composite score, ranking
6. `escalation.py` — 8 escalation rules
7. `validation.py` — completeness, budget feasibility, lead time feasibility
8. `pipeline.py` — orchestrate all steps, assemble output JSON
9. `main.py` — FastAPI with /api/process endpoint

**At this point you have a working backend that processes any of the 304 requests.**

### Phase 2: LLM Integration (SHOULD — adds intelligence)
10. `llm.py` — Claude API wrapper
11. `extraction.py` — LLM extraction + translation + contradiction detection + regex fallback
12. `comparison.py` — LLM-generated recommendation narratives

### Phase 3: Frontend (SHOULD — makes it presentable)
13. Basic React app with request list + process button + result display
14. Supplier comparison view (side-by-side cards)
15. Escalation panel
16. Audit trail expandable

### Phase 4: Differentiators (NICE TO HAVE — wins creativity points)
17. `supplier_discovery.py` — web search for new suppliers
18. Confidence scoring per step
19. What-if analysis
20. Batch dashboard
21. Historical pattern matching display

---

## 8. Demo Strategy (8 minutes)

### Live Demo (5 min)
| Time | What | Judging Criteria |
|------|------|-----------------|
| 0:00–1:15 | **Standard request** — show full pipeline, clean supplier comparison, audit trail | Feasibility, Visual Design |
| 1:15–2:30 | **Edge case: contradictory** — budget insufficient + restricted supplier + impossible lead time. Show all 3 escalations fire correctly | Robustness (25%) |
| 2:30–3:15 | **Multilingual request** (French or Japanese) — show translation + correct processing | Creativity |
| 3:15–3:45 | **Supplier discovery trigger** — show request where only 1 supplier qualifies, system finds alternatives via web | Creativity (20%) |
| 3:45–4:15 | **Batch dashboard** — "we processed all 304 requests: 46% auto-resolved, 35% escalated, 10% blocked" | Reachability (20%) |
| 4:15–5:00 | **LIVE INPUT (mic drop)** — invite a judge or type a brand new request live. "Need 200 standing desks for our new Singapore office, budget USD 80K, deliver in 3 weeks." System processes it from scratch in real-time — extraction, policy check, supplier match, scoring, escalation — all in seconds. | Creativity + Feasibility |

### Explanation (3 min)
| Time | What |
|------|------|
| 5:00–6:00 | Architecture slide: deterministic core + thin LLM layer. "Every decision is traceable." |
| 6:00–7:00 | How we handle the traps: USD field names, conditional restrictions, wrong-category preferred suppliers |
| 7:00–7:30 | Supplier discovery: "the system doesn't just process — it proactively improves the supplier pool" |
| 7:30–8:00 | Scaling story: "add new policies.json rules = instant enforcement, no code change" |

### Demo Requests to Use (pre-selected)
- **Standard:** REQ-000001 (IT Project Mgmt, clean, EUR 400K, Accenture preferred)
- **Contradictory:** REQ-000004 (Docking stations, budget insufficient, lead time impossible — matches example_output.json exactly)
- **Restricted:** REQ-000228 (Laptops DE, Computacenter restricted in DE)
- **Multilingual:** REQ-000290 (Japanese, JP+SG delivery)
- **Capacity:** REQ-000128 (19,000 mobile workstations, exceeds all supplier capacity)
- **Missing info:** REQ-000270 (both budget AND quantity null)

---

## 9. Key Design Decisions

1. **Deterministic core, thin LLM layer.** The LLM only does extraction, translation, and narration. All scoring, policy checks, and escalation are rule-based. This is critical for audit trust.

2. **Normalize on load, not on query.** Fix the USD threshold field names when loading policies.json, not every time we check thresholds.

3. **Never hard-fail.** If LLM fails → regex fallback. If data file missing → skip that dimension, mark unchecked. If no suppliers found → escalate ER-004, don't crash.

4. **Escalation is a feature.** The judging criteria explicitly says "a system that correctly identifies uncertainty and escalates will score higher than one that produces confident wrong answers."

5. **Show all work.** Every supplier evaluated (included or excluded), every policy checked, every data source used. The audit_trail section is what makes this "audit-ready."

6. **Supplier discovery is additive.** It never overrides the main recommendation. Discovered suppliers are always "unvetted." This keeps compliance intact while showing initiative.

---

## 10. Team Task Split

### Tech Lead (Sushant)
- All backend code (Steps 1–10)
- API endpoints
- Frontend skeleton
- LLM integration

### Person 2 (Business/Management)
- Select demo requests (verify edge cases against data)
- Write demo script with timing
- Verify system output correctness manually
- Own the 3-minute explanation
- Write the scaling/production story

### Person 3 (Design/Marketing)
- Frontend styling (Tailwind CSS)
- Supplier comparison card design
- Escalation panel visual hierarchy
- Architecture diagram for presentation
- Backup screenshots in case of live demo failure

---

## 11. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| LLM API down during demo | Regex fallback works without LLM. Pre-cache results for demo requests. |
| Frontend not ready | Streamlit fallback takes 1 hour to build. Or demo via curl/Postman with JSON output. |
| Incorrect output on demo request | Pre-test all 6 demo requests. Person 2 manually verifies each. |
| Web search API fails | Supplier discovery is optional. Skip gracefully, show static example. |
| Running out of time | Phase 1 alone is a working demo. Ship Phase 1, then add Phase 2–4 incrementally. |
