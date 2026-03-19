import { useState, useEffect, useRef } from 'react'

// Logical phases that group related backend steps
const PHASES = [
  {
    label: 'Understand the Request',
    steps: [
      { key: 'intake',     label: 'Receive & Parse',           num: '1' },
      { key: 'extraction', label: 'Extract & Translate Fields', num: '2' },
      { key: 'validation', label: 'Validate & Auto-Heal',      num: '3' },
    ],
  },
  {
    label: 'Source & Evaluate Suppliers',
    steps: [
      { key: 'matching',  label: 'Match Eligible Suppliers',        num: '4' },
      { key: 'scoring',   label: 'Score & Rank on Fit',             num: '5' },
      { key: 'narration', label: 'Generate Supplier Assessments',   num: '6' },
      { key: 'discovery', label: 'Discover Alternative Suppliers',  num: '7' },
    ],
  },
  {
    label: 'Compliance & Decision',
    steps: [
      { key: 'policy',         label: 'Evaluate Policy Rules',       num: '8' },
      { key: 'escalation',     label: 'Check Escalation Triggers',   num: '9' },
      { key: 'recommendation', label: 'Build Recommendation',        num: '10' },
      { key: 'narrative',      label: 'Write Decision Narrative',    num: '11' },
    ],
  },
  {
    label: 'Optimize & Finalize',
    steps: [
      { key: 'what_if', label: 'Explore What-If Scenarios', num: '12' },
      { key: 'audit',   label: 'Assemble Audit Trail',      num: '13' },
    ],
  },
];

const ALL_STEP_KEYS = PHASES.flatMap(p => p.steps.map(s => s.key));

function StepDataPanel({ stepKey, data }) {
  switch (stepKey) {
    case 'intake': return <IntakeData data={data} />;
    case 'extraction': return <ExtractionData data={data} />;
    case 'validation': return <ValidationData data={data} />;
    case 'matching': return <MatchingData data={data} />;
    case 'scoring': return <ScoringData data={data} />;
    case 'narration': return <NarrationData data={data} />;
    case 'discovery': return <DiscoveryData data={data} />;
    case 'policy': return <PolicyData data={data} />;
    case 'escalation': return <EscalationData data={data} />;
    case 'narrative': return <NarrativeData data={data} />;
    case 'what_if': return <WhatIfData data={data} />;
    case 'audit': return <AuditData data={data} />;
    default: return null;
  }
}

export default function PipelineThinking({ steps, currentStep, done }) {
  const [collapsed, setCollapsed] = useState(false);

  const prevDoneRef = useRef(done);
  useEffect(() => {
    if (done && !prevDoneRef.current) {
      setCollapsed(true);
    }
    prevDoneRef.current = done;
  }, [done]);

  const completedSteps = new Set(steps.map(s => s.step));
  const completedCount = ALL_STEP_KEYS.filter(k => completedSteps.has(k)).length;

  return (
    <div className="border border-[#e0e0e0] rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-6 py-4 bg-[#111] flex items-center justify-between hover:bg-[#1a1a1a] transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-black uppercase tracking-[1.5px] text-white">Agent Pipeline</h3>
          {!done && (
            <span className="flex items-center gap-1.5 text-xs text-brand-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
              Processing...
            </span>
          )}
          {done && (
            <span className="px-2 py-0.5 bg-[#1a7a3c] text-white rounded text-[10px] font-bold uppercase tracking-[1px]">
              Complete
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#888] font-mono">
            {completedCount}/13 steps
          </span>
          <span className={`text-[#888] transition-transform text-xs ${collapsed ? '' : 'rotate-180'}`}>&#9660;</span>
        </div>
      </button>

      {!collapsed && (
        <div className="py-2 bg-white">
          {PHASES.map((phase, phaseIdx) => {
            const phaseStepKeys = phase.steps.map(s => s.key);
            const phaseIsActive = phaseStepKeys.includes(currentStep);
            const phaseCompleted = phaseStepKeys.every(k => completedSteps.has(k));
            const phaseStarted = phaseStepKeys.some(k => completedSteps.has(k)) || phaseIsActive;

            return (
              <div key={phaseIdx}>
                {/* Phase header */}
                <div className={`px-6 py-2 flex items-center gap-2 ${phaseIdx > 0 ? 'mt-1' : ''}`}>
                  <div className={`h-px flex-1 ${phaseStarted ? 'bg-[#e0e0e0]' : 'bg-[#f4f4f4]'}`}></div>
                  <span className={`text-[10px] font-bold uppercase tracking-[2px] ${
                    phaseIsActive ? 'text-brand-500' : phaseCompleted ? 'text-[#1a1a1a]' : 'text-[#ccc]'
                  }`}>
                    {phase.label}
                  </span>
                  <div className={`h-px flex-1 ${phaseStarted ? 'bg-[#e0e0e0]' : 'bg-[#f4f4f4]'}`}></div>
                </div>

                {/* Steps within this phase */}
                <div className="px-6">
                  <div className="relative">
                    <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[#e0e0e0]"></div>

                    {phase.steps.map((step) => {
                      const stepEntries = steps.filter(s => s.step === step.key);
                      const isActive = currentStep === step.key;
                      const isCompleted = completedSteps.has(step.key);
                      const isPending = !isCompleted && !isActive;

                      const dataEntry = [...stepEntries].reverse().find(s => s.data);
                      const data = dataEntry?.data;

                      return (
                        <div key={step.key} className="relative flex gap-3 pb-3">
                          {/* Step indicator */}
                          <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                            isActive
                              ? 'bg-brand-500 text-white ring-4 ring-brand-100 animate-pulse'
                              : isCompleted
                                ? 'bg-[#1a1a1a] text-white'
                                : 'bg-[#f4f4f4] text-[#ccc]'
                          }`}>
                            {isCompleted && !isActive ? '✓' : step.num}
                          </div>

                          {/* Step content */}
                          <div className={`flex-1 min-w-0 pt-1 transition-opacity duration-300 ${isPending ? 'opacity-30' : 'opacity-100'}`}>
                            <p className={`text-xs font-bold uppercase tracking-wide ${
                              isActive ? 'text-brand-500' : isCompleted ? 'text-[#1a1a1a]' : 'text-[#ccc]'
                            }`}>
                              {step.label}
                            </p>

                            {stepEntries.map((entry, i) => (
                              <p
                                key={i}
                                className={`text-xs mt-0.5 leading-relaxed ${
                                  isActive && i === stepEntries.length - 1
                                    ? 'text-brand-400'
                                    : 'text-[#999]'
                                }`}
                              >
                                {entry.detail}
                              </p>
                            ))}

                            {isActive && stepEntries.length > 0 && (
                              <div className="mt-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                <span className="w-1.5 h-1.5 bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                <span className="w-1.5 h-1.5 bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                              </div>
                            )}

                            {/* Rich data panel */}
                            {isCompleted && data && (
                              <div className="mt-2">
                                <StepDataPanel stepKey={step.key} data={data} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// --- Shared UI primitives ---

function DataCard({ children, className = '' }) {
  return (
    <div className={`bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg p-3 text-xs ${className}`}>
      {children}
    </div>
  );
}

function KV({ label, value, mono = false }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-[#999]">{label}</span>
      <span className={`text-[#1a1a1a] font-medium text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function Badge({ text, color = 'slate' }) {
  const colors = {
    emerald: 'bg-[#d1fae5] text-[#1a7a3c]',
    red: 'bg-[#fde8e8] text-brand-500',
    amber: 'bg-[#fff8e1] text-[#856400]',
    blue: 'bg-blue-100 text-blue-700',
    teal: 'bg-teal-100 text-teal-700',
    purple: 'bg-purple-100 text-purple-700',
    slate: 'bg-[#f4f4f4] text-[#666]',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${colors[color] || colors.slate}`}>
      {text}
    </span>
  );
}


// --- Step-specific data renderers ---

function IntakeData({ data }) {
  if (data.type === 'free_text') {
    return (
      <DataCard>
        <p className="text-[#555] italic">"{data.request_text}"</p>
      </DataCard>
    );
  }
  return (
    <DataCard>
      <KV label="Request ID" value={data.request_id} mono />
      <KV label="Category" value={data.category} />
      <KV label="Language" value={data.language} />
      <KV label="Country" value={data.country} />
      {data.scenario_tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {data.scenario_tags.map(t => <Badge key={t} text={t} color="blue" />)}
        </div>
      )}
    </DataCard>
  );
}

function ExtractionData({ data }) {
  return (
    <DataCard>
      <div className="grid grid-cols-2 gap-x-4">
        <KV label="Category" value={`${data.category_l1}/${data.category_l2}`} />
        <KV label="Quantity" value={data.quantity} />
        <KV label="Budget" value={data.budget_amount ? `${data.currency} ${Number(data.budget_amount).toLocaleString()}` : null} />
        <KV label="Delivery" value={data.delivery_countries?.join(', ')} />
        <KV label="Required By" value={data.required_by_date} />
        <KV label="Days Available" value={data.days_until_required} />
        <KV label="Preferred" value={data.preferred_supplier} />
        <KV label="Confidence" value={data.confidence ? `${(data.confidence * 100).toFixed(0)}%` : null} />
      </div>
      {data.translated_text && (
        <div className="mt-2 pt-2 border-t border-[#e0e0e0]">
          <p className="text-[#999] mb-0.5">Translation:</p>
          <p className="text-[#333] italic">"{data.translated_text}"</p>
        </div>
      )}
      {data.contradictions?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[#e0e0e0] space-y-1">
          {data.contradictions.map((c, i) => (
            <div key={i} className="flex items-start gap-1">
              <Badge text="Contradiction" color="red" />
              <span className="text-[#555]">{c}</span>
            </div>
          ))}
        </div>
      )}
      {data.flexibility_signals?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {data.flexibility_signals.map((f, i) => <Badge key={i} text={f} color="teal" />)}
        </div>
      )}
    </DataCard>
  );
}

function ValidationData({ data }) {
  const hasAdaptations = data.adaptations?.length > 0;
  const hasIssues = data.issues?.length > 0;

  if (!hasAdaptations && !hasIssues) {
    return (
      <DataCard>
        <div className="flex items-center gap-1.5">
          <span className="text-[#1a7a3c]">&#10003;</span>
          <span className="text-[#1a7a3c] font-bold">All checks passed</span>
        </div>
      </DataCard>
    );
  }
  return (
    <DataCard>
      <div className="space-y-1.5">
        {hasAdaptations && (
          <div className="space-y-1 pb-1.5 mb-1.5 border-b border-[#e0e0e0]">
            {data.adaptations.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge text="auto-adapted" color="blue" />
                <div>
                  <span className="text-[#555]">{a.description}</span>
                  <p className="text-brand-500 text-[11px]">{a.action}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {data.issues?.map((issue, i) => (
          <div key={i} className="flex items-start gap-2">
            <Badge
              text={issue.severity}
              color={issue.severity === 'critical' ? 'red' : issue.severity === 'high' ? 'amber' : issue.severity === 'medium' ? 'amber' : 'slate'}
            />
            <div>
              <span className="text-[#333] font-bold">{issue.type.replace(/_/g, ' ')}</span>
              <p className="text-[#999] text-[11px]">{issue.description}</p>
              <p className="text-brand-500 text-[11px]">{issue.action}</p>
            </div>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function MatchingData({ data }) {
  return (
    <DataCard>
      <div className="flex items-center gap-3 mb-2">
        <Badge text={`${data.total_candidates} eligible`} color="emerald" />
        {data.total_excluded > 0 && <Badge text={`${data.total_excluded} excluded`} color="red" />}
      </div>
      {data.candidates?.length > 0 && (
        <div className="space-y-1">
          {data.candidates.slice(0, 5).map((c, i) => (
            <div key={i} className="flex items-center justify-between py-0.5 border-b border-[#e0e0e0] last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-[#333] font-bold">{c.supplier_name}</span>
                {c.preferred && <Badge text="Preferred" color="blue" />}
              </div>
              <div className="flex gap-2 text-[10px] text-[#999] font-mono">
                <span>Q:{c.quality_score}</span>
                <span>R:{c.risk_score}</span>
                <span>E:{c.esg_score}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {data.excluded?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[#e0e0e0]">
          <p className="text-[#999] mb-1">Excluded:</p>
          {data.excluded.map((e, i) => (
            <div key={i} className="flex items-center justify-between py-0.5 text-[#999]">
              <span>{e.supplier_name}</span>
              <Badge text={e.reason} color="red" />
            </div>
          ))}
        </div>
      )}
    </DataCard>
  );
}

function ScoringData({ data }) {
  if (!data.shortlist?.length) {
    return (
      <DataCard>
        <span className="text-[#999]">No suppliers scored — discovery triggered to find alternatives</span>
      </DataCard>
    );
  }
  const isUnitPricing = data.unit_pricing_mode;
  return (
    <DataCard className="!p-0 overflow-hidden">
      {isUnitPricing && (
        <div className="px-3 py-2 bg-brand-50 text-brand-700 text-[11px] flex items-center gap-1.5">
          <Badge text="auto-adapted" color="blue" />
          <span>No quantity specified — showing per-unit pricing. Provide quantity for total costs.</span>
        </div>
      )}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-[#1a1a1a] text-white">
            <th className="text-left px-2 py-1.5 font-bold">#</th>
            <th className="text-left px-2 py-1.5 font-bold">Supplier</th>
            <th className="text-right px-2 py-1.5 font-bold">{isUnitPricing ? 'Unit Price' : 'Price'}</th>
            <th className="text-right px-2 py-1.5 font-bold">Fit</th>
            <th className="text-center px-2 py-1.5 font-bold">Tags</th>
          </tr>
        </thead>
        <tbody>
          {data.shortlist.map((s, i) => (
            <tr key={i} className={`border-t border-[#e0e0e0] ${i === 0 ? 'bg-[#d1fae5]/40' : ''}`}>
              <td className="px-2 py-1.5 font-mono text-[#999]">{s.rank}</td>
              <td className="px-2 py-1.5 text-[#1a1a1a] font-bold">{s.supplier_name}</td>
              <td className="px-2 py-1.5 text-right font-mono text-[#333]">
                {s.currency} {isUnitPricing
                  ? Number(s.unit_price).toLocaleString() + '/unit'
                  : Number(s.total_price).toLocaleString()
                }
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-[#333]">
                {(Number(s.composite_score) * 100).toFixed(1)}%
              </td>
              <td className="px-2 py-1.5 text-center">
                <div className="flex justify-center gap-0.5 flex-wrap">
                  {s.preferred && <Badge text="Pref" color="blue" />}
                  {s.incumbent && <Badge text="Inc" color="purple" />}
                  {s.lead_time_feasible === false && <Badge text="Late" color="red" />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataCard>
  );
}

function NarrationData({ data }) {
  if (!data.notes?.length) return null;
  return (
    <DataCard>
      <div className="space-y-2">
        {data.notes.slice(0, 3).map((n, i) => (
          <div key={i}>
            <p className="text-[#333] font-bold">{n.supplier_name}</p>
            <p className="text-[#999] mt-0.5 leading-relaxed">{n.note}</p>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function DiscoveryData({ data }) {
  if (!data.triggered) {
    return (
      <DataCard>
        <div className="flex items-center gap-1.5">
          <span className="text-[#999]">&#8212;</span>
          <span className="text-[#999]">Sufficient supplier coverage — no discovery needed</span>
        </div>
      </DataCard>
    );
  }
  return (
    <DataCard>
      <div className="flex items-center gap-2 mb-2">
        <Badge text={data.trigger_reason} color="teal" />
        <span className="text-[#999]">{data.suppliers.length} discovered</span>
      </div>
      <div className="space-y-1.5">
        {data.suppliers.map((s, i) => (
          <div key={i} className="flex items-center justify-between py-0.5 border-b border-[#e0e0e0] last:border-0">
            <div>
              <span className="text-[#333] font-bold">{s.name}</span>
              <span className="text-[#999] ml-2 text-[10px]">via {s.source}</span>
            </div>
            {s.estimated_capability && (
              <span className="text-[#999] text-[10px]">{s.estimated_capability}</span>
            )}
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function PolicyData({ data }) {
  return (
    <DataCard>
      {data.approval_threshold && (
        <div className="pb-1.5 mb-1.5 border-b border-[#e0e0e0]">
          <KV label="Approval Rule" value={data.approval_threshold.rule} />
          <KV label="Quotes Required" value={data.approval_threshold.quotes_required} />
          <KV label="Basis" value={data.approval_threshold.basis} />
        </div>
      )}
      {data.preferred_supplier && (
        <div className="pb-1.5 mb-1.5 border-b border-[#e0e0e0]">
          <div className="flex items-center gap-2">
            <span className="text-[#999]">Preferred:</span>
            <span className="text-[#1a1a1a] font-bold">{data.preferred_supplier.supplier || 'None'}</span>
            <Badge
              text={data.preferred_supplier.status}
              color={data.preferred_supplier.status === 'confirmed' ? 'emerald' : data.preferred_supplier.status === 'not_matched' ? 'amber' : 'slate'}
            />
          </div>
        </div>
      )}
      <div className="flex gap-4">
        <div>
          <span className="text-[#999]">Category rules: </span>
          <span className="font-bold text-[#333]">{data.category_rules?.length || 0}</span>
          {data.category_rules?.some(r => !r.applies) && <Badge text="Non-compliant" color="red" />}
        </div>
        <div>
          <span className="text-[#999]">Geo rules: </span>
          <span className="font-bold text-[#333]">{data.geography_rules?.length || 0}</span>
          {data.geography_rules?.some(r => !r.applies) && <Badge text="Non-compliant" color="red" />}
        </div>
      </div>
    </DataCard>
  );
}

function EscalationData({ data }) {
  if (!data.escalations?.length) {
    return (
      <DataCard>
        <div className="flex items-center gap-1.5">
          <span className="text-[#1a7a3c]">&#10003;</span>
          <span className="text-[#1a7a3c] font-bold">No escalations — ready for approval</span>
        </div>
      </DataCard>
    );
  }
  const blocking = data.escalations.filter(e => e.blocking);
  const advisories = data.escalations.filter(e => !e.blocking);
  return (
    <DataCard>
      <div className="space-y-1.5">
        {blocking.map((e, i) => (
          <div key={`b-${i}`} className="flex items-start gap-2">
            <Badge text="COMPLIANCE" color="red" />
            <div>
              <span className="text-[#333] font-bold">{e.rule}</span>
              <p className="text-[#999] text-[11px]">{e.trigger}</p>
              <p className="text-brand-500 text-[10px]">Requires: {e.escalate_to}</p>
            </div>
          </div>
        ))}
        {advisories.map((e, i) => (
          <div key={`a-${i}`} className="flex items-start gap-2">
            <Badge text="ADVISORY" color="amber" />
            <div>
              <span className="text-[#333] font-bold">{e.rule}</span>
              <p className="text-[#999] text-[11px]">{e.trigger}</p>
              <p className="text-[#856400] text-[10px]">FYI: {e.escalate_to}</p>
            </div>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function NarrativeData({ data }) {
  const statusColors = {
    recommend: 'emerald',
    recommend_with_escalation: 'amber',
    cannot_proceed: 'red',
  };
  return (
    <DataCard>
      <div className="flex items-center gap-2 mb-2">
        <Badge
          text={data.status?.replace(/_/g, ' ').toUpperCase()}
          color={statusColors[data.status] || 'slate'}
        />
        {data.chosen_supplier && (
          <span className="text-[#333] font-bold">{data.chosen_supplier}</span>
        )}
        {data.total_price && (
          <span className="text-[#999] font-mono">{data.currency} {Number(data.total_price).toLocaleString()}</span>
        )}
      </div>
      {data.narrative && (
        <p className="text-[#555] leading-relaxed">{data.narrative}</p>
      )}
    </DataCard>
  );
}

function WhatIfData({ data }) {
  if (!data.scenarios?.length) {
    return (
      <DataCard>
        <span className="text-[#999]">Current parameters are optimal</span>
      </DataCard>
    );
  }
  return (
    <DataCard>
      <div className="space-y-2">
        {data.scenarios.map((s, i) => (
          <div key={i} className="pb-1.5 border-b border-[#e0e0e0] last:border-0 last:pb-0">
            <div className="flex items-center gap-2">
              <Badge text={s.scenario?.replace(/_/g, ' ')} color="blue" />
              <span className="text-[#333] font-bold">{s.title}</span>
            </div>
            <p className="text-[#999] text-[11px] mt-0.5">{s.description}</p>
            {s.current_value && s.suggested_value && (
              <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                <span className="text-[#999]">{s.current_value}</span>
                <span className="text-[#ccc]">&rarr;</span>
                <span className="text-brand-500 font-bold">{s.suggested_value}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function AuditData({ data }) {
  return (
    <DataCard>
      <KV label="Policies Checked" value={data.policies_checked?.length || 0} />
      <KV label="Suppliers Evaluated" value={data.suppliers_evaluated} />
      <KV label="Pricing Tier" value={data.pricing_tier} />
      {data.historical_award && (
        <div className="mt-1.5 pt-1.5 border-t border-[#e0e0e0]">
          <p className="text-[#999] mb-0.5">Historical:</p>
          <p className="text-[#555]">{data.historical_award}</p>
        </div>
      )}
      {data.policies_checked?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {data.policies_checked.map((p, i) => <Badge key={i} text={p} />)}
        </div>
      )}
    </DataCard>
  );
}
