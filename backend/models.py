"""
Pydantic models matching the example_output.json structure.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# --- Input models ---

class ProcessRequest(BaseModel):
    request_id: Optional[str] = None
    request_text: Optional[str] = None
    currency: Optional[str] = None
    country: Optional[str] = None
    delivery_countries: Optional[list[str]] = None
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    budget_amount: Optional[float] = None
    quantity: Optional[int] = None
    required_by_date: Optional[str] = None
    preferred_supplier_mentioned: Optional[str] = None


# --- Output models ---

class RequestInterpretation(BaseModel):
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    quantity: Optional[int] = None
    unit_of_measure: Optional[str] = None
    budget_amount: Optional[float] = None
    currency: Optional[str] = None
    delivery_countries: list[str] = []
    required_by_date: Optional[str] = None
    days_until_required: Optional[int] = None
    data_residency_required: bool = False
    esg_requirement: bool = False
    preferred_supplier_stated: Optional[str] = None
    incumbent_supplier: Optional[str] = None
    requester_instruction: Optional[str] = None
    translated_text: Optional[str] = None
    original_language: Optional[str] = None
    extraction_confidence: float = 1.0
    contradictions: Optional[list[str]] = None
    flexibility_signals: Optional[list[str]] = None
    constraints: Optional[list[str]] = None


class ValidationIssue(BaseModel):
    issue_id: str
    severity: str  # critical, high, medium, low
    type: str
    description: str
    action_required: str


class Validation(BaseModel):
    completeness: str  # pass, fail
    issues_detected: list[ValidationIssue] = []


class ApprovalThreshold(BaseModel):
    rule_applied: str
    basis: str
    quotes_required: int
    approvers: list[str] = []
    deviation_approval: Optional[str] = None
    note: Optional[str] = None


class PreferredSupplierEval(BaseModel):
    supplier: Optional[str] = None
    status: str  # eligible, not_eligible, not_stated
    is_preferred: bool = False
    covers_delivery_country: bool = False
    is_restricted: bool = False
    policy_note: Optional[str] = None


class CategoryRuleApplied(BaseModel):
    rule_id: str
    rule_type: str
    rule_text: str
    applies: bool = True


class GeographyRuleApplied(BaseModel):
    rule_id: str
    country_or_region: str
    rule_text: str
    applies: bool = True


class PolicyEvaluation(BaseModel):
    approval_threshold: Optional[ApprovalThreshold] = None
    preferred_supplier: Optional[PreferredSupplierEval] = None
    restricted_suppliers: dict = {}
    category_rules_applied: list[CategoryRuleApplied] = []
    geography_rules_applied: list[GeographyRuleApplied] = []


class SupplierShortlistEntry(BaseModel):
    rank: int
    supplier_id: str
    supplier_name: str
    preferred: bool = False
    incumbent: bool = False
    pricing_tier_applied: str = ""
    unit_price: float = 0.0
    total_price: float = 0.0
    currency: str = ""
    standard_lead_time_days: int = 0
    expedited_lead_time_days: int = 0
    expedited_unit_price: float = 0.0
    expedited_total: float = 0.0
    quality_score: int = 0
    risk_score: int = 0
    esg_score: int = 0
    policy_compliant: bool = True
    covers_delivery_country: bool = True
    lead_time_feasible: str = ""  # standard, expedited_only, infeasible
    composite_score: float = 0.0
    capacity_exceeded: bool = False
    recommendation_note: str = ""


class ExcludedSupplier(BaseModel):
    supplier_id: str
    supplier_name: str
    reason: str
    reason_code: str = ""


class DiscoveredSupplier(BaseModel):
    name: str
    source: str = "web_search"
    url: Optional[str] = None
    estimated_capability: str = ""
    review_signals: str = ""
    status: str = "unvetted"
    action_required: str = "Onboarding review by Procurement Manager"


class SupplierDiscovery(BaseModel):
    triggered: bool = False
    trigger_reason: Optional[str] = None
    context: Optional[str] = None
    discovered_suppliers: list[DiscoveredSupplier] = []
    estimated_savings_if_onboarded: Optional[str] = None
    recommendation: Optional[str] = None


class Escalation(BaseModel):
    escalation_id: str
    rule: str
    trigger: str
    escalate_to: str
    blocking: bool = True


class Recommendation(BaseModel):
    status: str  # recommend, recommend_with_escalation, cannot_proceed
    reason: str
    preferred_supplier_if_resolved: Optional[str] = None
    preferred_supplier_rationale: Optional[str] = None
    minimum_budget_required: Optional[float] = None
    minimum_budget_currency: Optional[str] = None
    narrative: Optional[str] = None


class AuditTrail(BaseModel):
    policies_checked: list[str] = []
    supplier_ids_evaluated: list[str] = []
    pricing_tiers_applied: str = ""
    data_sources_used: list[str] = Field(
        default=["requests.json", "suppliers.csv", "pricing.csv", "policies.json", "categories.csv"]
    )
    historical_awards_consulted: bool = False
    historical_award_note: Optional[str] = None


class MissingField(BaseModel):
    field: str
    label: str
    type: str = "text"  # text, number, select, date
    reason: str = ""
    suggestion: Optional[str] = None
    options: Optional[list[str]] = None  # for select type
    required: bool = True  # true = can't finalize without it


class PipelineResult(BaseModel):
    request_id: str
    processed_at: str = ""
    request_interpretation: RequestInterpretation = RequestInterpretation()
    validation: Validation = Validation(completeness="pass")
    policy_evaluation: PolicyEvaluation = PolicyEvaluation()
    supplier_shortlist: list[SupplierShortlistEntry] = []
    suppliers_excluded: list[ExcludedSupplier] = []
    supplier_discovery: SupplierDiscovery = SupplierDiscovery()
    escalations: list[Escalation] = []
    recommendation: Recommendation = Recommendation(status="recommend", reason="")
    what_if: list[dict] = []
    audit_trail: AuditTrail = AuditTrail()
    missing_fields: list[MissingField] = []
    is_preview: bool = False  # true = result is a preview, user needs to provide missing fields
