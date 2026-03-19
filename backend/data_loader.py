"""
Data loader — loads all 6 datasets into memory at startup.
Normalizes USD threshold field names and builds lookup indices.
"""

import json
import csv
from pathlib import Path
from dataclasses import dataclass, field


DATA_DIR = Path(__file__).parent.parent / "data"


@dataclass
class DataStore:
    requests: dict = field(default_factory=dict)          # request_id -> request dict
    suppliers: list = field(default_factory=list)          # list of supplier row dicts
    pricing: list = field(default_factory=list)            # list of pricing row dicts
    policies: dict = field(default_factory=dict)           # full policies dict
    categories: list = field(default_factory=list)         # list of category dicts
    historical_awards: list = field(default_factory=list)  # list of award dicts

    # Indices built after loading
    suppliers_by_category: dict = field(default_factory=dict)   # (l1, l2) -> [supplier rows]
    pricing_by_supplier: dict = field(default_factory=dict)     # (supplier_id, l1, l2, region) -> [pricing rows]
    awards_by_request: dict = field(default_factory=dict)       # request_id -> [award dicts]
    supplier_names: dict = field(default_factory=dict)          # supplier_id -> supplier_name
    category_set: set = field(default_factory=set)              # set of (l1, l2) tuples


def _load_json(filename: str) -> dict | list:
    with open(DATA_DIR / filename, "r") as f:
        return json.load(f)


def _load_csv(filename: str) -> list[dict]:
    rows = []
    with open(DATA_DIR / filename, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def _normalize_thresholds(policies: dict) -> dict:
    """USD thresholds use min_value/max_value instead of min_amount/max_amount. Normalize."""
    for t in policies.get("approval_thresholds", []):
        if "min_value" in t and "min_amount" not in t:
            t["min_amount"] = t.pop("min_value")
        if "max_value" in t and "max_amount" not in t:
            t["max_amount"] = t.pop("max_value")
        if "quotes_required" in t and "min_supplier_quotes" not in t:
            t["min_supplier_quotes"] = t.pop("quotes_required")
        if "approvers" in t and "managed_by" not in t:
            t["managed_by"] = t.pop("approvers")
        if "policy_note" in t and "deviation_approval_required_from" not in t:
            # USD tiers have policy_note instead of deviation_approval_required_from
            # Extract approver from managed_by for consistency
            managed = t.get("managed_by", [])
            if "cpo" in managed:
                t["deviation_approval_required_from"] = ["CPO"]
            elif "head_of_strategic_sourcing" in managed:
                t["deviation_approval_required_from"] = ["Head of Strategic Sourcing"]
            elif "procurement" in managed and "business" in managed:
                t["deviation_approval_required_from"] = ["Procurement Manager"]
            elif "procurement" in managed:
                t["deviation_approval_required_from"] = ["Head of Category"]
            else:
                t["deviation_approval_required_from"] = []
        # Normalize max_amount null to large number
        if t.get("max_amount") is None:
            t["max_amount"] = 999_999_999.99
    return policies


def _parse_supplier_row(row: dict) -> dict:
    """Convert string fields to proper types."""
    row["quality_score"] = int(row["quality_score"])
    row["risk_score"] = int(row["risk_score"])
    row["esg_score"] = int(row["esg_score"])
    row["preferred_supplier"] = row["preferred_supplier"] == "True"
    row["is_restricted"] = row["is_restricted"] == "True"
    row["capacity_per_month"] = int(row["capacity_per_month"])
    row["data_residency_supported"] = row["data_residency_supported"] == "True"
    row["service_regions"] = [s.strip() for s in row["service_regions"].split(";") if s.strip()]
    return row


def _parse_pricing_row(row: dict) -> dict:
    """Convert string fields to proper types."""
    row["min_quantity"] = int(row["min_quantity"])
    row["max_quantity"] = int(row["max_quantity"])
    row["unit_price"] = float(row["unit_price"])
    row["moq"] = int(row["moq"])
    row["standard_lead_time_days"] = int(row["standard_lead_time_days"])
    row["expedited_lead_time_days"] = int(row["expedited_lead_time_days"])
    row["expedited_unit_price"] = float(row["expedited_unit_price"])
    return row


def _parse_award_row(row: dict) -> dict:
    """Convert string fields to proper types."""
    row["total_value"] = float(row["total_value"]) if row["total_value"] else 0.0
    row["quantity"] = float(row["quantity"]) if row["quantity"] else 0.0
    row["awarded"] = row["awarded"] == "True"
    row["policy_compliant"] = row["policy_compliant"] == "True"
    row["preferred_supplier_used"] = row["preferred_supplier_used"] == "True"
    row["escalation_required"] = row["escalation_required"] == "True"
    row["savings_pct"] = float(row["savings_pct"]) if row["savings_pct"] else 0.0
    row["lead_time_days"] = int(row["lead_time_days"]) if row["lead_time_days"] else 0
    row["risk_score_at_award"] = int(row["risk_score_at_award"]) if row["risk_score_at_award"] else 0
    return row


def load_all() -> DataStore:
    """Load all datasets and build indices."""
    store = DataStore()

    # Load raw data
    raw_requests = _load_json("requests.json")
    store.requests = {r["request_id"]: r for r in raw_requests}

    raw_suppliers = _load_csv("suppliers.csv")
    store.suppliers = [_parse_supplier_row(r) for r in raw_suppliers]

    raw_pricing = _load_csv("pricing.csv")
    store.pricing = [_parse_pricing_row(r) for r in raw_pricing]

    raw_policies = _load_json("policies.json")
    store.policies = _normalize_thresholds(raw_policies)

    store.categories = _load_csv("categories.csv")

    raw_awards = _load_csv("historical_awards.csv")
    store.historical_awards = [_parse_award_row(r) for r in raw_awards]

    # Build indices
    for s in store.suppliers:
        key = (s["category_l1"], s["category_l2"])
        store.suppliers_by_category.setdefault(key, []).append(s)
        store.supplier_names[s["supplier_id"]] = s["supplier_name"]

    for p in store.pricing:
        key = (p["supplier_id"], p["category_l1"], p["category_l2"], p["region"])
        store.pricing_by_supplier.setdefault(key, []).append(p)

    for a in store.historical_awards:
        store.awards_by_request.setdefault(a["request_id"], []).append(a)

    store.category_set = {(c["category_l1"], c["category_l2"]) for c in store.categories}

    return store


# Singleton
_store: DataStore | None = None


def get_store() -> DataStore:
    global _store
    if _store is None:
        _store = load_all()
    return _store
