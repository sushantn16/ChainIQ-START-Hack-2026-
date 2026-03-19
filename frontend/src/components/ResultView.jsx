import { useState } from 'react'

const STATUS_STYLES = {
  recommend: { bg: 'bg-white', border: 'border-[#1a7a3c]', text: 'text-[#1a7a3c]', badge: 'bg-[#d1fae5] text-[#1a7a3c]', icon: '✓', accent: '#1a7a3c' },
  recommend_with_escalation: { bg: 'bg-white', border: 'border-[#e67700]', text: 'text-[#e67700]', badge: 'bg-[#fff8e1] text-[#856400]', icon: '⚠', accent: '#e67700' },
  cannot_proceed: { bg: 'bg-white', border: 'border-brand-500', text: 'text-brand-500', badge: 'bg-[#fde8e8] text-brand-500', icon: '✕', accent: '#e30613' },
};

export default function ResultView({ result, onApplyScenario }) {
  const [expandedSection, setExpandedSection] = useState('recommendation');
  const r = result;
  const rec = r.recommendation;
  const style = STATUS_STYLES[rec.status] || STATUS_STYLES.cannot_proceed;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`${style.bg} ${style.border} border-l-4 border rounded-xl p-6`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{style.icon}</span>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[1.5px] ${style.badge}`}>
                {rec.status.replace(/_/g, ' ').toUpperCase()}
              </span>
              <span className="text-xs text-[#999] font-mono">{r.request_id}</span>
            </div>
            <p className={`text-sm font-bold ${style.text}`}>{rec.reason}</p>
          </div>
          <div className="text-right text-xs text-[#999] font-mono">
            <p>{new Date(r.processed_at).toLocaleString()}</p>
          </div>
        </div>
        {rec.narrative && (
          <div className="mt-4 p-4 bg-[#f4f4f4] rounded-lg" style={{ borderLeft: `3px solid ${style.accent}` }}>
            <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#999] mb-1">Audit Narrative</p>
            <p className="text-sm text-[#555] whitespace-pre-wrap leading-relaxed">{rec.narrative}</p>
          </div>
        )}
      </div>

      {/* Approval & Escalation Banners — shown above shortlist */}
      {r.policy_evaluation?.approval_threshold && (
        <div className="flex items-start gap-3 p-5 border border-[#e0e0e0] bg-white rounded-xl" style={{ borderLeft: '4px solid #1a1a1a' }}>
          <span className="text-lg mt-0.5">🔒</span>
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[1px] text-[#1a1a1a]">
              Approval Required — {r.policy_evaluation.approval_threshold.rule_applied}
            </p>
            <p className="text-sm text-[#333] mt-0.5">
              {r.policy_evaluation.approval_threshold.basis}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#555]">
              <span>Approvers: <strong>{r.policy_evaluation.approval_threshold.approvers?.join(', ')}</strong></span>
              <span>Quotes required: <strong>{r.policy_evaluation.approval_threshold.quotes_required}</strong></span>
              {r.policy_evaluation.approval_threshold.deviation_approval && (
                <span>Deviation approval: <strong>{r.policy_evaluation.approval_threshold.deviation_approval}</strong></span>
              )}
            </div>
            <div className="mt-3">
              <SendApprovalButton approvers={r.policy_evaluation.approval_threshold.approvers} requestId={r.request_id} />
            </div>
          </div>
        </div>
      )}

      {r.escalations.filter(e => e.blocking).length > 0 && (
        <div className="flex items-start gap-3 p-5 border border-brand-200 bg-white rounded-xl" style={{ borderLeft: '4px solid #e30613' }}>
          <span className="text-lg mt-0.5">🚫</span>
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[1px] text-brand-700">Blocking Escalation</p>
            {r.escalations.filter(e => e.blocking).map(e => (
              <div key={e.escalation_id} className="mt-1">
                <p className="text-sm text-brand-600">{e.trigger}</p>
                <p className="text-xs text-brand-400 mt-0.5">Escalate to: <strong>{e.escalate_to}</strong> ({e.rule})</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning banners for lead time / budget issues */}
      {r.supplier_shortlist.length > 0 && r.supplier_shortlist.every(s => s.lead_time_feasible === 'infeasible') && (
        <div className="flex items-start gap-3 p-5 border border-[#e67700]/30 bg-white rounded-xl" style={{ borderLeft: '4px solid #e67700' }}>
          <span className="text-lg mt-0.5">⏰</span>
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[1px] text-[#e67700]">No Supplier Can Meet the Deadline</p>
            <p className="text-sm text-[#856400] mt-0.5">
              All {r.supplier_shortlist.length} suppliers have infeasible lead times.
              Fastest option: <strong>{r.supplier_shortlist[0]?.supplier_name}</strong> at {r.supplier_shortlist.reduce((min, s) => s.expedited_lead_time_days < min ? s.expedited_lead_time_days : min, Infinity)} days (expedited).
            </p>
            <p className="text-xs text-[#999] mt-1">Consider extending the delivery date or negotiating expedited terms.</p>
          </div>
        </div>
      )}

      {(() => {
        const budgetIssue = r.validation?.issues_detected?.find(i => i.type === 'budget_advisory');
        return budgetIssue ? (
          <div className="flex items-start gap-3 p-5 border border-[#856400]/30 bg-white rounded-xl" style={{ borderLeft: '4px solid #856400' }}>
            <span className="text-lg mt-0.5">💰</span>
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-[1px] text-[#856400]">Budget Insufficient</p>
              <p className="text-sm text-[#856400] mt-0.5">{budgetIssue.description}</p>
              <p className="text-xs text-[#999] mt-1">{budgetIssue.action_required}</p>
            </div>
          </div>
        ) : null;
      })()}

      {/* Supplier Shortlist — primary output */}
      <Section
        title={`Supplier Shortlist`}
        badge={r.supplier_shortlist.length || null}
        badgeColor="brand"
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
          title="Smart Suggestions"
          badge={r.what_if.length}
          badgeColor="amber"
          expanded={expandedSection === 'whatif'}
          onToggle={() => setExpandedSection(expandedSection === 'whatif' ? '' : 'whatif')}
        >
          <WhatIfPanel scenarios={r.what_if} onApply={onApplyScenario} />
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

const BADGE_COLORS = {
  brand: 'bg-[#fde8e8] text-brand-500',
  teal: 'bg-teal-100 text-teal-700',
  red: 'bg-[#fde8e8] text-brand-500',
  amber: 'bg-[#fff8e1] text-[#856400]',
};

function Section({ title, badge, badgeColor = 'brand', expanded, onToggle, children }) {
  return (
    <div className="border border-[#e0e0e0] rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 bg-[#f4f4f4] hover:bg-[#ebebeb] transition-colors border-b border-[#e0e0e0]"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-black uppercase tracking-[1.5px] text-[#1a1a1a]">{title}</h3>
          {badge != null && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${BADGE_COLORS[badgeColor] || BADGE_COLORS.brand}`}>
              {badge}
            </span>
          )}
        </div>
        <span className={`text-[#999] transition-transform text-xs ${expanded ? 'rotate-180' : ''}`}>&#9660;</span>
      </button>
      {expanded && <div className="px-6 pb-6 pt-4 bg-white">{children}</div>}
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
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#999]">{label}</p>
            <p className="text-sm font-bold text-[#1a1a1a]">{value}</p>
          </div>
        ))}
      </div>

      {interp.translated_text && (
        <div className="p-3 bg-[#f4f4f4] border-l-3 border-l-brand-500">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-500 mb-1">Translated Text</p>
          <p className="text-sm text-[#333]">{interp.translated_text}</p>
        </div>
      )}

      {interp.contradictions && interp.contradictions.length > 0 && (
        <div className="p-3 bg-[#fff8e1] border-l-3 border-l-[#e67700]">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#856400] mb-1">Contradictions Detected</p>
          {interp.contradictions.map((c, i) => <p key={i} className="text-sm text-[#856400]">{c}</p>)}
        </div>
      )}

      {interp.flexibility_signals && interp.flexibility_signals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-bold uppercase text-[#999]">Flexibility:</span>
          {interp.flexibility_signals.map((s, i) => (
            <span key={i} className="px-2 py-0.5 bg-[#d1fae5] text-[#1a7a3c] text-[10px] font-bold">{s}</span>
          ))}
        </div>
      )}

      {interp.constraints && interp.constraints.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-bold uppercase text-[#999]">Constraints:</span>
          {interp.constraints.map((c, i) => (
            <span key={i} className="px-2 py-0.5 bg-[#fde8e8] text-brand-500 text-[10px] font-bold">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ValidationPanel({ validation }) {
  if (validation.issues_detected.length === 0) {
    return <p className="text-sm text-[#1a7a3c] font-bold">All validation checks passed.</p>;
  }
  return (
    <div className="space-y-3">
      {validation.issues_detected.map((issue) => (
        <div
          key={issue.issue_id}
          className={`p-4 border rounded-lg ${
            issue.severity === 'critical' ? 'bg-[#fde8e8] border-brand-200' :
            issue.severity === 'high' ? 'bg-[#fff8e1] border-[#ffe082]' :
            'bg-[#f4f4f4] border-[#e0e0e0]'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              issue.severity === 'critical' ? 'bg-brand-500 text-white' :
              issue.severity === 'high' ? 'bg-[#856400] text-white' :
              'bg-[#e0e0e0] text-[#666]'
            }`}>
              {issue.severity}
            </span>
            <span className="text-xs text-[#999] font-mono">{issue.issue_id}</span>
            <span className="text-xs text-[#999]">{issue.type}</span>
          </div>
          <p className="text-sm text-[#333]">{issue.description}</p>
          <p className="text-xs text-[#999] mt-1">Action: {issue.action_required}</p>
        </div>
      ))}
    </div>
  );
}

function ShortlistPanel({ shortlist }) {
  if (shortlist.length === 0) {
    return <p className="text-sm text-[#999]">No suppliers matched this request.</p>;
  }

  return (
    <div className="space-y-3">
      {shortlist.map((s) => (
        <div
          key={s.supplier_id}
          className={`p-5 border rounded-xl ${
            s.rank === 1 ? 'border-[#1a1a1a] border-2 bg-white' : 'border-[#e0e0e0] bg-white'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                  s.rank === 1 ? 'bg-[#1a1a1a] text-white' : 'bg-[#f4f4f4] text-[#999]'
                }`}>
                  {s.rank}
                </span>
                <span className="text-base font-black text-[#1a1a1a]">{s.supplier_name}</span>
                {s.user_preferred && <span className="px-2 py-0.5 rounded bg-[#fff8e1] text-[#856400] text-[10px] font-bold uppercase">Your Preferred</span>}
                {s.preferred && <span className="px-2 py-0.5 rounded bg-[#d1fae5] text-[#1a7a3c] text-[10px] font-bold uppercase">Preferred List</span>}
                {s.incumbent && <span className="px-2 py-0.5 rounded bg-[#f4f4f4] text-[#666] text-[10px] font-bold uppercase">Incumbent</span>}
              </div>
              <p className="text-xs text-[#999] mt-1 font-mono">{s.supplier_id}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black text-[#1a1a1a]">{s.currency} {Number(s.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-[#999] font-mono">
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
              <p className="text-[10px] font-bold uppercase text-[#999]">Lead Time</p>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                s.lead_time_feasible === 'standard' ? 'bg-[#d1fae5] text-[#1a7a3c]' :
                s.lead_time_feasible === 'expedited_only' ? 'bg-[#fff8e1] text-[#856400]' :
                'bg-[#fde8e8] text-brand-500'
              }`}>
                {s.lead_time_feasible.replace('_', ' ')}
              </span>
              <p className="text-[10px] text-[#999] mt-0.5 font-mono">{s.standard_lead_time_days}d / {s.expedited_lead_time_days}d exp</p>
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
            <div className="mt-3 p-3 bg-[#f4f4f4] rounded-lg" style={{ borderLeft: '3px solid #e0e0e0' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#999] mb-1">Recommendation Note</p>
              <p className="text-sm text-[#555] whitespace-pre-wrap leading-relaxed">{s.recommendation_note}</p>
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
  const color = good ? 'text-[#1a7a3c]' : bad ? 'text-brand-500' : 'text-[#856400]';

  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-[#999]">{label}</p>
      <p className={`text-sm font-black ${color}`}>
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
    { label: 'Price', weight: 35, score: priceNorm, color: 'bg-[#1a1a1a]' },
    { label: 'Quality', weight: 35, score: qualityNorm, color: 'bg-[#1a1a1a]' },
    { label: 'Risk', weight: 20, score: riskNorm, color: 'bg-[#1a1a1a]' },
    { label: 'Lead Time', weight: 10, score: leadNorm, color: 'bg-[#1a1a1a]' },
  ];

  return (
    <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg">
      {(() => {
        const prefBonus = (s.preferred || s.user_preferred) ? 5 : 0;
        const expBonus = s.historical_performance?.experience_score > 0 ? s.historical_performance.experience_score * 5 : 0;
        const baseScore = (s.composite_score * 100) - prefBonus - expBonus;
        const hasBonuses = prefBonus > 0 || expBonus > 0;
        return (
          <>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#999]">Fit Score</p>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-[#1a1a1a] text-white">
                {(s.composite_score * 100).toFixed(1)}%
              </span>
              {hasBonuses && (
                <span className="text-[10px] text-[#999]">
                  = {baseScore.toFixed(1)}% base
                  {prefBonus > 0 && <span className="text-[#1a7a3c]"> + {prefBonus}% preferred</span>}
                  {expBonus > 0 && <span className="text-[#555]"> + {expBonus.toFixed(1)}% track record</span>}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {factors.map(f => (
                <div key={f.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-[#999] w-16 font-bold">{f.label} <span className="text-[#ccc]">({f.weight}%)</span></span>
                  <div className="flex-1 h-[6px] bg-[#e0e0e0] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${f.color}`} style={{ width: `${f.score * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-[#999] w-10 text-right font-mono">{(f.score * 100).toFixed(0)}%</span>
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
  low:      { bg: 'bg-[#d1fae5]', text: 'text-[#1a7a3c]' },
  medium:   { bg: 'bg-[#fff8e1]', text: 'text-[#856400]' },
  elevated: { bg: 'bg-[#ffe0b2]', text: 'text-[#e67700]' },
  high:     { bg: 'bg-[#fde8e8]', text: 'text-brand-500' },
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
      <p className="text-[10px] font-bold uppercase text-[#999]">Risk</p>
      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase ${ts.bg} ${ts.text} cursor-default`}>
        {tier}
      </span>
      {tooltipLines.length > 0 && (
        <div className="absolute z-20 bottom-full left-0 mb-1 hidden group-hover:block w-64 p-3 bg-[#1a1a1a] text-white rounded-lg shadow-lg text-[11px] leading-relaxed">
          {tooltipLines.map((line, i) => (
            <p key={i} className={line.startsWith('⚠') ? 'text-[#ffe082] mt-1' : ''}>{line}</p>
          ))}
          <div className="absolute top-full left-4 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#1a1a1a]" />
        </div>
      )}
    </div>
  );
}


function HistoricalPerformanceDetail({ hp }) {
  const winRate = hp.category_bids > 0 ? ((hp.category_wins / hp.category_bids) * 100).toFixed(0) : 0;
  return (
    <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#999]">Historical Performance</p>
        {hp.experience_score > 0.5 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#d1fae5] text-[#1a7a3c]">Proven</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div>
          <p className="text-[10px] text-[#999]">Category Wins</p>
          <p className="text-xs font-bold text-[#333]">{hp.category_wins} / {hp.category_bids} bids ({winRate}%)</p>
        </div>
        <div>
          <p className="text-[10px] text-[#999]">Avg Savings</p>
          <p className="text-xs font-bold text-[#333]">{hp.avg_savings_pct}%</p>
        </div>
        <div>
          <p className="text-[10px] text-[#999]">Avg Lead Time</p>
          <p className="text-xs font-bold text-[#333]">{hp.avg_lead_time_days} days</p>
        </div>
        <div>
          <p className="text-[10px] text-[#999]">Escalation Rate</p>
          <p className={`text-xs font-bold ${hp.escalation_rate > 0.3 ? 'text-brand-500' : hp.escalation_rate > 0.1 ? 'text-[#856400]' : 'text-[#1a7a3c]'}`}>
            {(hp.escalation_rate * 100).toFixed(0)}%
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-[#999]">Experience Score</span>
        <div className="flex-1 h-[6px] bg-[#e0e0e0] rounded-full overflow-hidden">
          <div className="h-full bg-[#1a1a1a] rounded-full" style={{ width: `${hp.experience_score * 100}%` }} />
        </div>
        <span className="text-[10px] text-[#999] font-mono">{(hp.experience_score * 100).toFixed(0)}%</span>
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
        <div key={i} className="flex items-start justify-between p-3 bg-[#f4f4f4] rounded-lg gap-4">
          <div>
            <p className="text-sm font-bold text-[#333]">{e.supplier_name}</p>
            <p className="text-xs text-[#999] font-mono">{e.supplier_id}</p>
            <p className="text-xs text-[#999] mt-1">{e.reason}</p>
          </div>
          <span className="text-[10px] font-bold uppercase px-2 py-1 bg-[#e0e0e0] rounded text-[#666] whitespace-nowrap">
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
        <div className="p-3 bg-white border border-[#e0e0e0] rounded-lg" style={{ borderLeft: '3px solid #1a1a1a' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1a1a] mb-1">
            Approval Threshold — {policy.approval_threshold.rule_applied}
          </p>
          <p className="text-sm text-[#333]">{policy.approval_threshold.basis}</p>
          <p className="text-xs text-[#555] mt-1">
            Quotes required: {policy.approval_threshold.quotes_required} |
            Approvers: {policy.approval_threshold.approvers?.join(', ')}
          </p>
        </div>
      )}

      {policy.preferred_supplier && (
        <div className={`p-3 border rounded-lg ${
          policy.preferred_supplier.is_preferred
            ? 'bg-white border-[#1a7a3c]/30'
            : 'bg-[#f4f4f4] border-[#e0e0e0]'
        }`} style={policy.preferred_supplier.is_preferred ? { borderLeft: '3px solid #1a7a3c' } : {}}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#999] mb-1">Preferred Supplier Check</p>
          <p className="text-sm text-[#1a1a1a] font-bold">
            {policy.preferred_supplier.supplier || 'None stated'} — {policy.preferred_supplier.status}
          </p>
          {policy.preferred_supplier.policy_note && (
            <p className="text-xs text-[#999] mt-1">{policy.preferred_supplier.policy_note}</p>
          )}
        </div>
      )}

      {policy.category_rules_applied?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#999] mb-2">Category Rules</p>
          {policy.category_rules_applied.map((rule, i) => (
            <div key={i} className="p-2.5 bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg mb-1.5 text-sm text-[#333]">
              <span className="font-mono text-xs text-[#999]">{rule.rule_id}</span> {rule.rule_text}
            </div>
          ))}
        </div>
      )}

      {policy.geography_rules_applied?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#999] mb-2">Geography Rules</p>
          {policy.geography_rules_applied.map((rule, i) => (
            <div key={i} className="p-2.5 bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg mb-1.5 text-sm text-[#333]">
              <span className="font-mono text-xs text-[#999]">{rule.rule_id}</span> ({rule.country_or_region}) {rule.rule_text}
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
          className={`p-4 border rounded-lg ${
            e.blocking ? 'border-brand-200 bg-white' : 'border-[#ffe082] bg-white'
          }`}
          style={{ borderLeft: e.blocking ? '4px solid #e30613' : '4px solid #e67700' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              e.blocking ? 'bg-brand-500 text-white' : 'bg-[#fff8e1] text-[#856400]'
            }`}>
              {e.blocking ? 'BLOCKING' : 'WARNING'}
            </span>
            <span className="text-xs text-[#999] font-mono">{e.rule}</span>
          </div>
          <p className="text-sm text-[#333]">{e.trigger}</p>
          <p className="text-xs text-[#999] mt-1">Escalate to: {e.escalate_to}</p>
        </div>
      ))}
    </div>
  );
}

function WhatIfPanel({ scenarios, onApply }) {
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

  const canApply = (s) => onApply && s.parameter && s.parameter !== 'supplier_choice' && s.parameter !== 'delivery_countries';

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#999]">The system identified parameter changes that could improve this procurement outcome:</p>
      {scenarios.map((s, i) => (
        <div key={i} className="p-5 border border-[#e0e0e0] rounded-xl" style={{ borderLeft: '3px solid #e30613' }}>
          <div className="flex items-start gap-3">
            <span className="text-xl">{SCENARIO_ICONS[s.scenario] || '💡'}</span>
            <div className="flex-1">
              <p className="text-sm font-black text-[#1a1a1a]">{s.title}</p>
              <p className="text-sm text-[#555] mt-1">{s.description}</p>
              <div className="mt-2 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-[#999]">Parameter:</span>
                  <span className="px-2 py-0.5 bg-[#f4f4f4] rounded text-xs font-mono text-[#333]">{s.parameter}</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-[#999]">{typeof s.current_value === 'number' ? s.current_value.toLocaleString() : String(s.current_value)}</span>
                  <span className="text-[#ccc]">&rarr;</span>
                  <span className="font-black text-brand-500">{typeof s.suggested_value === 'number' ? s.suggested_value.toLocaleString() : String(s.suggested_value)}</span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-[#1a7a3c] font-bold">{s.impact}</p>
                {canApply(s) && (
                  <button
                    onClick={() => onApply(s)}
                    className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded-md text-[10px] font-bold uppercase tracking-[1px] hover:bg-brand-500 transition-colors"
                  >
                    Apply & Re-run
                  </button>
                )}
              </div>
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
      <div className="p-3 bg-white border border-teal-200 rounded-lg" style={{ borderLeft: '3px solid #0d9488' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] font-bold uppercase">
            {discovery.trigger_reason?.replace('_', ' ')}
          </span>
          <span className="text-xs text-teal-600">Proactive supplier search</span>
        </div>
        <p className="text-sm text-teal-900">{discovery.context}</p>
      </div>

      {/* Discovered suppliers */}
      {discovery.discovered_suppliers?.map((s, i) => (
        <div key={i} className="p-4 border border-[#e0e0e0] bg-white rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-[#1a1a1a]">{s.name}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  s.source === 'web_search'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-[#f4f4f4] text-[#666]'
                }`}>
                  {s.source === 'web_search' ? 'Web Search' : 'Market Intelligence'}
                </span>
                <span className="px-2 py-0.5 bg-[#fff8e1] text-[#856400] rounded text-[10px] font-bold uppercase">
                  {s.status}
                </span>
              </div>
              {s.url && (
                <p className="text-xs text-blue-500 mt-0.5 truncate max-w-md">{s.url}</p>
              )}
            </div>
          </div>
          <p className="text-sm text-[#333] mt-2">{s.estimated_capability}</p>
          {s.review_signals && (
            <p className="text-xs text-[#999] mt-1">Signals: {s.review_signals}</p>
          )}
          <p className="text-xs text-[#e67700] mt-2 font-bold">{s.action_required}</p>
        </div>
      ))}

      {/* Savings estimate */}
      {discovery.estimated_savings_if_onboarded && (
        <div className="p-3 bg-white border border-[#1a7a3c]/30 rounded-lg" style={{ borderLeft: '3px solid #1a7a3c' }}>
          <p className="text-sm text-[#1a7a3c] font-bold">{discovery.estimated_savings_if_onboarded}</p>
        </div>
      )}

      {/* Recommendation note */}
      {discovery.recommendation && (
        <p className="text-xs text-[#999] italic">{discovery.recommendation}</p>
      )}
    </div>
  );
}

function SendApprovalButton({ approvers }) {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-[#d1fae5] text-[#1a7a3c]">
        ✓ Approval request sent to {approvers?.join(', ')}
      </span>
    );
  }
  return (
    <button
      onClick={() => setSent(true)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-[#1a1a1a] text-white hover:bg-[#333] transition-colors"
    >
      Send for Approval
    </button>
  );
}

function AuditPanel({ audit }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#999] mb-1">Policies Checked</p>
          <div className="flex flex-wrap gap-1">
            {audit.policies_checked.map((p, i) => (
              <span key={i} className="px-2 py-0.5 bg-[#f4f4f4] rounded text-[#333] text-xs font-mono">{p}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#999] mb-1">Suppliers Evaluated</p>
          <p className="text-sm text-[#333] font-bold">{audit.supplier_ids_evaluated.length} suppliers</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#999] mb-1">Pricing Tier</p>
          <p className="text-sm text-[#333] font-bold">{audit.pricing_tiers_applied}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#999] mb-1">Data Sources</p>
          <div className="flex flex-wrap gap-1">
            {audit.data_sources_used.map((d, i) => (
              <span key={i} className="px-2 py-0.5 bg-[#fde8e8] rounded text-brand-600 text-xs font-mono">{d}</span>
            ))}
          </div>
        </div>
      </div>
      {audit.historical_award_note && (
        <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#999] mb-1">Historical Award</p>
          <p className="text-sm text-[#555]">{audit.historical_award_note}</p>
        </div>
      )}
      {audit.parameter_overrides?.length > 0 && (
        <div className="p-3 bg-white border border-brand-200 rounded-lg" style={{ borderLeft: '3px solid #e30613' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-500 mb-2">Parameter Overrides (user modified)</p>
          <div className="space-y-1">
            {audit.parameter_overrides.map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-bold text-[#333] w-28">{o.field.replace(/_/g, ' ')}</span>
                <span className="text-[#999] line-through">{o.original_value || '—'}</span>
                <span className="text-[#ccc]">&rarr;</span>
                <span className="font-black text-brand-500">{o.new_value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
