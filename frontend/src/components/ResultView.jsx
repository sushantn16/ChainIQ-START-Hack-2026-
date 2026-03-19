import { useState } from 'react'

const STATUS_STYLES = {
  recommend: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-800', icon: '✓' },
  recommend_with_escalation: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-800', icon: '⚠' },
  cannot_proceed: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-800', icon: '✕' },
};

export default function ResultView({ result }) {
  const [expandedSection, setExpandedSection] = useState('recommendation');
  const r = result;
  const rec = r.recommendation;
  const style = STATUS_STYLES[rec.status] || STATUS_STYLES.cannot_proceed;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`${style.bg} ${style.border} border rounded-xl p-6`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-2xl`}>{style.icon}</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${style.badge}`}>
                {rec.status.replace(/_/g, ' ').toUpperCase()}
              </span>
              <span className="text-sm text-slate-500 font-mono">{r.request_id}</span>
            </div>
            <p className={`text-base font-medium ${style.text}`}>{rec.reason}</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Processed: {new Date(r.processed_at).toLocaleString()}</p>
          </div>
        </div>
        {rec.narrative && (
          <div className="mt-4 p-4 bg-white/60 rounded-lg border border-white/80">
            <p className="text-sm font-medium text-slate-700 mb-1">Audit Narrative</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{rec.narrative}</p>
          </div>
        )}
      </div>

      {/* Approval & Escalation Banners — shown above shortlist */}
      {r.policy_evaluation?.approval_threshold && (
        <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
          <span className="text-lg mt-0.5">🔒</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-purple-800">
              Approval Required — {r.policy_evaluation.approval_threshold.rule_applied}
            </p>
            <p className="text-sm text-purple-700 mt-0.5">
              {r.policy_evaluation.approval_threshold.basis}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-purple-600">
              <span>Approvers: <strong>{r.policy_evaluation.approval_threshold.approvers?.join(', ')}</strong></span>
              <span>Quotes required: <strong>{r.policy_evaluation.approval_threshold.quotes_required}</strong></span>
              {r.policy_evaluation.approval_threshold.deviation_approval && (
                <span>Deviation approval: <strong>{r.policy_evaluation.approval_threshold.deviation_approval}</strong></span>
              )}
            </div>
          </div>
        </div>
      )}

      {r.escalations.filter(e => e.blocking).length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-lg mt-0.5">🚫</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Blocking Escalation</p>
            {r.escalations.filter(e => e.blocking).map(e => (
              <div key={e.escalation_id} className="mt-1">
                <p className="text-sm text-red-700">{e.trigger}</p>
                <p className="text-xs text-red-500 mt-0.5">Escalate to: <strong>{e.escalate_to}</strong> ({e.rule})</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supplier Shortlist — primary output */}
      <Section
        title={`Supplier Shortlist`}
        badge={r.supplier_shortlist.length || null}
        badgeColor="blue"
        expanded={expandedSection === 'recommendation'}
        onToggle={() => setExpandedSection(expandedSection === 'recommendation' ? '' : 'recommendation')}
      >
        <ShortlistPanel shortlist={r.supplier_shortlist} />
      </Section>

      {r.supplier_discovery?.triggered && (
        <Section
          title="Supplier Discovery"
          badge={r.supplier_discovery.discovered_suppliers?.length || null}
          badgeColor="teal"
          expanded={expandedSection === 'discovery'}
          onToggle={() => setExpandedSection(expandedSection === 'discovery' ? '' : 'discovery')}
        >
          <DiscoveryPanel discovery={r.supplier_discovery} />
        </Section>
      )}

      <Section
        title="Policy Evaluation"
        expanded={expandedSection === 'policy'}
        onToggle={() => setExpandedSection(expandedSection === 'policy' ? '' : 'policy')}
      >
        <PolicyPanel policy={r.policy_evaluation} />
      </Section>

      {r.escalations.length > 0 && (
        <Section
          title="Escalations"
          badge={r.escalations.length}
          badgeColor="red"
          expanded={expandedSection === 'escalation'}
          onToggle={() => setExpandedSection(expandedSection === 'escalation' ? '' : 'escalation')}
        >
          <EscalationPanel escalations={r.escalations} />
        </Section>
      )}

      {r.what_if?.length > 0 && (
        <Section
          title="What-If Analysis"
          badge={r.what_if.length}
          badgeColor="amber"
          expanded={expandedSection === 'whatif'}
          onToggle={() => setExpandedSection(expandedSection === 'whatif' ? '' : 'whatif')}
        >
          <WhatIfPanel scenarios={r.what_if} />
        </Section>
      )}

      <Section
        title="Audit Trail"
        expanded={expandedSection === 'audit'}
        onToggle={() => setExpandedSection(expandedSection === 'audit' ? '' : 'audit')}
      >
        <AuditPanel audit={r.audit_trail} />
      </Section>
    </div>
  );
}

function Section({ title, badge, badgeColor = 'blue', expanded, onToggle, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {badge != null && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${badgeColor}-100 text-${badgeColor}-700`}>
              {badge}
            </span>
          )}
        </div>
        <span className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {expanded && <div className="px-6 pb-6 border-t border-slate-100 pt-4">{children}</div>}
    </div>
  );
}

function InterpretationPanel({ interp }) {
  const fields = [
    ['Category', `${interp.category_l1 || '—'} / ${interp.category_l2 || '—'}`],
    ['Quantity', interp.quantity != null ? Number(interp.quantity).toLocaleString() + (interp.unit_of_measure ? ` ${interp.unit_of_measure}` : '') : '—'],
    ['Budget', interp.budget_amount != null ? `${interp.currency || ''} ${Number(interp.budget_amount).toLocaleString()}` : '—'],
    ['Delivery Countries', interp.delivery_countries?.join(', ') || '—'],
    ['Required By', interp.required_by_date || '—'],
    ['Days Until Required', interp.days_until_required != null ? `${interp.days_until_required} days` : '—'],
    ['Preferred Supplier', interp.preferred_supplier_stated || '—'],
    ['Incumbent Supplier', interp.incumbent_supplier || '—'],
    ['Original Language', interp.original_language || '—'],
    ['Data Residency', interp.data_residency_required ? 'Required' : 'No'],
    ['ESG Requirement', interp.esg_requirement ? 'Required' : 'No'],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {fields.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-sm font-medium text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {interp.translated_text && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs font-medium text-blue-700 mb-1">Translated Text</p>
          <p className="text-sm text-blue-900">{interp.translated_text}</p>
        </div>
      )}

      {interp.contradictions && interp.contradictions.length > 0 && (
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
          <p className="text-xs font-medium text-amber-700 mb-1">Contradictions Detected</p>
          {interp.contradictions.map((c, i) => <p key={i} className="text-sm text-amber-900">{c}</p>)}
        </div>
      )}

      {interp.flexibility_signals && interp.flexibility_signals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-500">Flexibility:</span>
          {interp.flexibility_signals.map((s, i) => (
            <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">{s}</span>
          ))}
        </div>
      )}

      {interp.constraints && interp.constraints.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-500">Constraints:</span>
          {interp.constraints.map((c, i) => (
            <span key={i} className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ValidationPanel({ validation }) {
  if (validation.issues_detected.length === 0) {
    return <p className="text-sm text-emerald-600 font-medium">All validation checks passed.</p>;
  }
  return (
    <div className="space-y-3">
      {validation.issues_detected.map((issue) => (
        <div
          key={issue.issue_id}
          className={`p-4 rounded-lg border ${
            issue.severity === 'critical' ? 'bg-red-50 border-red-200' :
            issue.severity === 'high' ? 'bg-amber-50 border-amber-200' :
            'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              issue.severity === 'critical' ? 'bg-red-100 text-red-700' :
              issue.severity === 'high' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-200 text-slate-700'
            }`}>
              {issue.severity}
            </span>
            <span className="text-xs text-slate-500 font-mono">{issue.issue_id}</span>
            <span className="text-xs text-slate-500">{issue.type}</span>
          </div>
          <p className="text-sm text-slate-800">{issue.description}</p>
          <p className="text-xs text-slate-500 mt-1">Action: {issue.action_required}</p>
        </div>
      ))}
    </div>
  );
}

function ShortlistPanel({ shortlist }) {
  if (shortlist.length === 0) {
    return <p className="text-sm text-slate-500">No suppliers matched this request.</p>;
  }

  return (
    <div className="space-y-3">
      {shortlist.map((s) => (
        <div
          key={s.supplier_id}
          className={`p-4 rounded-lg border ${
            s.rank === 1 ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  s.rank === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {s.rank}
                </span>
                <span className="text-base font-semibold text-slate-900">{s.supplier_name}</span>
                {s.user_preferred && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Your Preferred</span>}
                {s.preferred && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">Preferred List</span>}
                {s.incumbent && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Incumbent</span>}
              </div>
              <p className="text-sm text-slate-500 mt-1 font-mono">{s.supplier_id}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-slate-900">{s.currency} {Number(s.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-slate-500">
                {s.unit_price === s.total_price
                  ? `${s.unit_price.toFixed(2)}/unit (per-unit preview)`
                  : `${s.unit_price.toFixed(2)}/unit × ${Math.round(s.total_price / s.unit_price).toLocaleString()} qty`
                }
              </p>
            </div>
          </div>

          {/* Scores */}
          <div className="mt-3 grid grid-cols-5 gap-3">
            <ScoreBadge label="Fit Score" value={s.composite_score} max={1} format={v => `${(v * 100).toFixed(1)}%`} />
            <ScoreBadge label="Quality" value={s.quality_score} max={100} />
            <RiskBadge riskScore={s.risk_score} riskComposite={s.risk_composite} />
            <ScoreBadge label="ESG" value={s.esg_score} max={100} />
            <div>
              <p className="text-xs text-slate-500">Lead Time</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                s.lead_time_feasible === 'standard' ? 'bg-emerald-100 text-emerald-700' :
                s.lead_time_feasible === 'expedited_only' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>
                {s.lead_time_feasible.replace('_', ' ')}
              </span>
              <p className="text-xs text-slate-400 mt-0.5">{s.standard_lead_time_days}d / {s.expedited_lead_time_days}d exp</p>
            </div>
          </div>

          {/* Fit Score Breakdown + Risk Composite + Historical Performance */}
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            <FitScoreDetail supplier={s} allSuppliers={shortlist} />
            {s.historical_performance && s.historical_performance.category_bids > 0 && (
              <HistoricalPerformanceDetail hp={s.historical_performance} />
            )}
          </div>

          {/* Recommendation Note */}
          {s.recommendation_note && (
            <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Recommendation Note</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.recommendation_note}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ScoreBadge({ label, value, max, invert = false, format }) {
  const pct = (value / max) * 100;
  const good = invert ? pct < 40 : pct > 60;
  const bad = invert ? pct > 70 : pct < 30;
  const color = good ? 'text-emerald-700' : bad ? 'text-red-700' : 'text-amber-700';

  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>
        {format ? format(value) : value}{max === 100 ? '/100' : ''}
      </p>
    </div>
  );
}

function FitScoreDetail({ supplier: s, allSuppliers }) {
  const prices = allSuppliers.map(x => x.total_price);
  const minP = Math.min(...prices);
  const priceNorm = minP > 0 ? minP / s.total_price : 1;
  const leadScores = { standard: 1, expedited_only: 0.5, infeasible: 0 };
  const leadNorm = leadScores[s.lead_time_feasible] ?? 0.5;
  const qualityNorm = s.quality_score / 100;
  const riskNorm = 1 - s.risk_score / 100;

  const factors = [
    { label: 'Price', weight: 35, score: priceNorm, color: 'bg-emerald-500' },
    { label: 'Quality', weight: 35, score: qualityNorm, color: 'bg-blue-500' },
    { label: 'Risk', weight: 20, score: riskNorm, color: 'bg-amber-500' },
    { label: 'Lead Time', weight: 10, score: leadNorm, color: 'bg-purple-500' },
  ];

  return (
    <div className="p-3 bg-slate-50 rounded border border-slate-100">
      {(() => {
        const prefBonus = (s.preferred || s.user_preferred) ? 10 : 0;
        const expBonus = s.historical_performance?.experience_score > 0 ? s.historical_performance.experience_score * 5 : 0;
        const baseScore = (s.composite_score * 100) - prefBonus - expBonus;
        const hasBonuses = prefBonus > 0 || expBonus > 0;
        return (
          <>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <p className="text-xs font-medium text-slate-600">Fit Score</p>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                {(s.composite_score * 100).toFixed(1)}%
              </span>
              {hasBonuses && (
                <span className="text-[10px] text-slate-400">
                  = {baseScore.toFixed(1)}% base
                  {prefBonus > 0 && <span className="text-emerald-600"> + {prefBonus}% preferred</span>}
                  {expBonus > 0 && <span className="text-indigo-600"> + {expBonus.toFixed(1)}% track record</span>}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {factors.map(f => (
                <div key={f.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-16">{f.label} <span className="text-slate-400">({f.weight}%)</span></span>
                  <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className={`h-full ${f.color} rounded-full`} style={{ width: `${f.score * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 w-10 text-right">{(f.score * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}

const RISK_TIER_STYLES = {
  low:      { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  medium:   { bg: 'bg-amber-100', text: 'text-amber-700' },
  elevated: { bg: 'bg-orange-100', text: 'text-orange-700' },
  high:     { bg: 'bg-red-100', text: 'text-red-700' },
};

function RiskBadge({ riskComposite }) {
  const tier = riskComposite?.tier || 'medium';
  const ts = RISK_TIER_STYLES[tier] || RISK_TIER_STYLES.medium;
  const rc = riskComposite;

  // Build hover tooltip lines
  const tooltipLines = [];
  if (rc) {
    const inputs = rc.inputs || {};
    tooltipLines.push(`Country: ${inputs.country_hq || '?'} (${rc.country_risk}/40)`);
    if (inputs.historical_bids > 0) {
      tooltipLines.push(`Win rate: ${((inputs.win_rate || 0) * 100).toFixed(0)}% of ${inputs.historical_bids} bids`);
      tooltipLines.push(`Escalation rate: ${((inputs.escalation_rate || 0) * 100).toFixed(0)}%`);
    } else {
      tooltipLines.push('No award history');
    }
    tooltipLines.push(`Delivery risk: ${rc.delivery_risk}/40`);
    tooltipLines.push(`Baseline: ${rc.baseline_risk}/30`);
    tooltipLines.push(`Total: ${rc.total}/100`);
    if (rc.flags && rc.flags.length > 0) {
      rc.flags.forEach(f => tooltipLines.push(`⚠ ${f}`));
    }
  }

  return (
    <div className="relative group">
      <p className="text-xs text-slate-500">Risk</p>
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ts.bg} ${ts.text} cursor-default`}>
        {tier}
      </span>
      {tooltipLines.length > 0 && (
        <div className="absolute z-20 bottom-full left-0 mb-1 hidden group-hover:block w-64 p-2.5 bg-slate-800 text-white rounded-lg shadow-lg text-[11px] leading-relaxed">
          {tooltipLines.map((line, i) => (
            <p key={i} className={line.startsWith('⚠') ? 'text-amber-300 mt-1' : ''}>{line}</p>
          ))}
          <div className="absolute top-full left-4 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}


function HistoricalPerformanceDetail({ hp }) {
  const winRate = hp.category_bids > 0 ? ((hp.category_wins / hp.category_bids) * 100).toFixed(0) : 0;
  return (
    <div className="p-3 bg-slate-50 rounded border border-slate-100">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-medium text-slate-600">Historical Performance</p>
        {hp.experience_score > 0.5 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">Proven</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div>
          <p className="text-[10px] text-slate-400">Category Wins</p>
          <p className="text-xs font-medium text-slate-700">{hp.category_wins} / {hp.category_bids} bids ({winRate}%)</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400">Avg Savings</p>
          <p className="text-xs font-medium text-slate-700">{hp.avg_savings_pct}%</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400">Avg Lead Time</p>
          <p className="text-xs font-medium text-slate-700">{hp.avg_lead_time_days} days</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400">Escalation Rate</p>
          <p className={`text-xs font-medium ${hp.escalation_rate > 0.3 ? 'text-red-700' : hp.escalation_rate > 0.1 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {(hp.escalation_rate * 100).toFixed(0)}%
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-slate-400">Experience Score</span>
        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${hp.experience_score * 100}%` }} />
        </div>
        <span className="text-[10px] text-slate-500">{(hp.experience_score * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

const REASON_CODE_LABELS = {
  POLICY_RESTRICTED: 'Policy Restricted',
  ESG_THRESHOLD:     'ESG Requirement Not Met',
  DATA_RESIDENCY:    'No Local Data Centre',
  CONTRACT_INACTIVE: 'Inactive Contract',
  GEO_COVERAGE:      'Geographic Gap',
};

function ExcludedPanel({ excluded }) {
  return (
    <div className="space-y-2">
      {excluded.map((e, i) => (
        <div key={i} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">{e.supplier_name}</p>
            <p className="text-xs text-slate-500 font-mono">{e.supplier_id}</p>
            <p className="text-xs text-slate-500 mt-1">{e.reason}</p>
          </div>
          <span className="text-xs font-medium px-2 py-1 rounded whitespace-nowrap bg-slate-200 text-slate-600">
            {REASON_CODE_LABELS[e.reason_code] || e.reason_code || 'Excluded'}
          </span>
        </div>
      ))}
    </div>
  );
}

function PolicyPanel({ policy }) {
  return (
    <div className="space-y-4">
      {policy.approval_threshold && (
        <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
          <p className="text-xs font-medium text-purple-700 mb-1">
            Approval Threshold — {policy.approval_threshold.rule_applied}
          </p>
          <p className="text-sm text-purple-900">{policy.approval_threshold.basis}</p>
          <p className="text-xs text-purple-700 mt-1">
            Quotes required: {policy.approval_threshold.quotes_required} |
            Approvers: {policy.approval_threshold.approvers?.join(', ')}
          </p>
        </div>
      )}

      {policy.preferred_supplier && (
        <div className={`p-3 rounded-lg border ${
          policy.preferred_supplier.is_preferred
            ? 'bg-emerald-50 border-emerald-100'
            : 'bg-slate-50 border-slate-200'
        }`}>
          <p className="text-xs font-medium text-slate-700 mb-1">Preferred Supplier Check</p>
          <p className="text-sm text-slate-900">
            {policy.preferred_supplier.supplier || 'None stated'} — {policy.preferred_supplier.status}
          </p>
          {policy.preferred_supplier.policy_note && (
            <p className="text-xs text-slate-500 mt-1">{policy.preferred_supplier.policy_note}</p>
          )}
        </div>
      )}

      {policy.category_rules_applied?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-700 mb-2">Category Rules</p>
          {policy.category_rules_applied.map((rule, i) => (
            <div key={i} className="p-2 bg-slate-50 rounded mb-1 text-sm text-slate-700">
              <span className="font-mono text-xs text-slate-500">{rule.rule_id}</span> {rule.rule_text}
            </div>
          ))}
        </div>
      )}

      {policy.geography_rules_applied?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-700 mb-2">Geography Rules</p>
          {policy.geography_rules_applied.map((rule, i) => (
            <div key={i} className="p-2 bg-slate-50 rounded mb-1 text-sm text-slate-700">
              <span className="font-mono text-xs text-slate-500">{rule.rule_id}</span> ({rule.country_or_region}) {rule.rule_text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EscalationPanel({ escalations }) {
  return (
    <div className="space-y-3">
      {escalations.map((e) => (
        <div
          key={e.escalation_id}
          className={`p-4 rounded-lg border ${
            e.blocking ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              e.blocking ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {e.blocking ? 'BLOCKING' : 'WARNING'}
            </span>
            <span className="text-xs text-slate-500 font-mono">{e.rule}</span>
          </div>
          <p className="text-sm text-slate-800">{e.trigger}</p>
          <p className="text-xs text-slate-500 mt-1">Escalate to: {e.escalate_to}</p>
        </div>
      ))}
    </div>
  );
}

function WhatIfPanel({ scenarios }) {
  const SCENARIO_ICONS = {
    budget_increase: '💰',
    affordable_alternative: '💡',
    deadline_extension: '📅',
    deadline_savings: '💸',
    quantity_reduction: '📦',
    split_by_country: '🌍',
    volume_discount: '📈',
    choose_preferred: '⭐',
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">The system identified parameter changes that could improve this procurement outcome:</p>
      {scenarios.map((s, i) => (
        <div key={i} className="p-4 rounded-lg border border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <span className="text-xl">{SCENARIO_ICONS[s.scenario] || '💡'}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{s.title}</p>
              <p className="text-sm text-slate-700 mt-1">{s.description}</p>
              <div className="mt-2 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Parameter:</span>
                  <span className="px-2 py-0.5 bg-white rounded text-xs font-mono text-slate-700">{s.parameter}</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-400">{typeof s.current_value === 'number' ? s.current_value.toLocaleString() : String(s.current_value)}</span>
                  <span className="text-slate-400">&rarr;</span>
                  <span className="font-medium text-amber-700">{typeof s.suggested_value === 'number' ? s.suggested_value.toLocaleString() : String(s.suggested_value)}</span>
                </div>
              </div>
              <p className="text-xs text-emerald-700 mt-2 font-medium">{s.impact}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiscoveryPanel({ discovery }) {
  return (
    <div className="space-y-4">
      {/* Trigger info */}
      <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium">
            {discovery.trigger_reason?.replace('_', ' ')}
          </span>
          <span className="text-xs text-teal-600">Proactive supplier search</span>
        </div>
        <p className="text-sm text-teal-900">{discovery.context}</p>
      </div>

      {/* Discovered suppliers */}
      {discovery.discovered_suppliers?.map((s, i) => (
        <div key={i} className="p-4 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-900">{s.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  s.source === 'web_search'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {s.source === 'web_search' ? 'Web Search' : 'Market Intelligence'}
                </span>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                  {s.status}
                </span>
              </div>
              {s.url && (
                <p className="text-xs text-blue-500 mt-0.5 truncate max-w-md">{s.url}</p>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-700 mt-2">{s.estimated_capability}</p>
          {s.review_signals && (
            <p className="text-xs text-slate-500 mt-1">Signals: {s.review_signals}</p>
          )}
          <p className="text-xs text-amber-600 mt-2">{s.action_required}</p>
        </div>
      ))}

      {/* Savings estimate */}
      {discovery.estimated_savings_if_onboarded && (
        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
          <p className="text-sm text-emerald-800">{discovery.estimated_savings_if_onboarded}</p>
        </div>
      )}

      {/* Recommendation note */}
      {discovery.recommendation && (
        <p className="text-xs text-slate-500 italic">{discovery.recommendation}</p>
      )}
    </div>
  );
}

function AuditPanel({ audit }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Policies Checked</p>
          <div className="flex flex-wrap gap-1">
            {audit.policies_checked.map((p, i) => (
              <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-mono">{p}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Suppliers Evaluated</p>
          <p className="text-sm text-slate-700">{audit.supplier_ids_evaluated.length} suppliers</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Pricing Tier</p>
          <p className="text-sm text-slate-700">{audit.pricing_tiers_applied}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Data Sources</p>
          <div className="flex flex-wrap gap-1">
            {audit.data_sources_used.map((d, i) => (
              <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{d}</span>
            ))}
          </div>
        </div>
      </div>
      {audit.historical_award_note && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-xs font-medium text-slate-700 mb-1">Historical Award</p>
          <p className="text-sm text-slate-600">{audit.historical_award_note}</p>
        </div>
      )}
      {audit.parameter_overrides?.length > 0 && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs font-medium text-blue-700 mb-2">Parameter Overrides (user modified)</p>
          <div className="space-y-1">
            {audit.parameter_overrides.map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-700 w-28">{o.field.replace(/_/g, ' ')}</span>
                <span className="text-slate-400 line-through">{o.original_value || '—'}</span>
                <span className="text-slate-400">&rarr;</span>
                <span className="font-medium text-blue-700">{o.new_value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
