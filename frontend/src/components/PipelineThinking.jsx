const STEP_CONFIG = {
  intake:         { label: 'Request Intake',       icon: '1', color: 'blue' },
  extraction:     { label: 'Extraction & Translation', icon: '2', color: 'violet' },
  validation:     { label: 'Validation',           icon: '3', color: 'amber' },
  matching:       { label: 'Supplier Matching',    icon: '4', color: 'cyan' },
  scoring:        { label: 'Pricing & Scoring',    icon: '5', color: 'emerald' },
  narration:      { label: 'LLM Narration',        icon: '6', color: 'purple' },
  discovery:      { label: 'Supplier Discovery',   icon: '7', color: 'teal' },
  policy:         { label: 'Policy Evaluation',    icon: '8', color: 'indigo' },
  escalation:     { label: 'Escalation Check',     icon: '9', color: 'red' },
  recommendation: { label: 'Recommendation',       icon: '10', color: 'blue' },
  narrative:      { label: 'Audit Narrative',       icon: '10', color: 'violet' },
  what_if:        { label: 'What-If Analysis',     icon: '11', color: 'orange' },
  audit:          { label: 'Audit Trail',           icon: '12', color: 'slate' },
  done:           { label: 'Complete',              icon: '✓', color: 'emerald' },
};

const STEP_ORDER = ['intake', 'extraction', 'validation', 'matching', 'scoring', 'narration', 'discovery', 'policy', 'escalation', 'recommendation', 'narrative', 'what_if', 'audit', 'done'];

export default function PipelineThinking({ steps, currentStep, done }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-slate-900">Pipeline Thinking</h3>
          {!done && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              Processing...
            </span>
          )}
          {done && (
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
              Complete
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {steps.length} step{steps.length !== 1 ? 's' : ''} completed
        </span>
      </div>

      <div className="px-6 py-4">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[15px] top-0 bottom-0 w-px bg-slate-200"></div>

          <div className="space-y-0">
            {STEP_ORDER.map((stepKey) => {
              const config = STEP_CONFIG[stepKey];
              const stepEntries = steps.filter(s => s.step === stepKey);
              const isActive = currentStep === stepKey;
              const isCompleted = steps.some(s => s.step === stepKey);
              const isPending = !isCompleted && !isActive;

              // Skip 'done' in the list
              if (stepKey === 'done') return null;

              // Get the last entry with data for this step
              const dataEntry = [...stepEntries].reverse().find(s => s.data);
              const data = dataEntry?.data;

              return (
                <div key={stepKey} className="relative flex gap-3 pb-4">
                  {/* Step indicator */}
                  <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    isActive
                      ? `bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse`
                      : isCompleted
                        ? `bg-emerald-500 text-white`
                        : `bg-slate-100 text-slate-400`
                  }`}>
                    {isCompleted && !isActive ? '✓' : config.icon}
                  </div>

                  {/* Step content */}
                  <div className={`flex-1 min-w-0 pt-1 transition-opacity duration-300 ${isPending ? 'opacity-40' : 'opacity-100'}`}>
                    <p className={`text-sm font-medium ${
                      isActive ? 'text-blue-700' : isCompleted ? 'text-slate-900' : 'text-slate-400'
                    }`}>
                      {config.label}
                    </p>

                    {stepEntries.map((entry, i) => (
                      <p
                        key={i}
                        className={`text-xs mt-0.5 leading-relaxed ${
                          isActive && i === stepEntries.length - 1
                            ? 'text-blue-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {entry.detail}
                      </p>
                    ))}

                    {isActive && stepEntries.length > 0 && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    )}

                    {/* Rich data panel */}
                    {isCompleted && data && (
                      <div className="mt-2">
                        <StepDataPanel stepKey={stepKey} data={data} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


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


function DataCard({ children, className = '' }) {
  return (
    <div className={`bg-slate-50 rounded-lg border border-slate-100 p-3 text-xs ${className}`}>
      {children}
    </div>
  );
}

function KV({ label, value, mono = false }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-800 font-medium text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function Badge({ text, color = 'slate' }) {
  const colors = {
    emerald: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    teal: 'bg-teal-100 text-teal-700',
    purple: 'bg-purple-100 text-purple-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[color] || colors.slate}`}>
      {text}
    </span>
  );
}


// --- Step-specific renderers ---

function IntakeData({ data }) {
  if (data.type === 'free_text') {
    return (
      <DataCard>
        <p className="text-slate-600 italic">"{data.request_text}"</p>
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
        <KV label="Budget" value={data.budget_amount ? `${data.currency} ${Number(data.budget_amount).toLocaleString()}` : '—'} />
        <KV label="Delivery" value={data.delivery_countries?.join(', ')} />
        <KV label="Required By" value={data.required_by_date} />
        <KV label="Days Available" value={data.days_until_required} />
        <KV label="Preferred" value={data.preferred_supplier || '—'} />
        <KV label="Confidence" value={data.confidence ? `${(data.confidence * 100).toFixed(0)}%` : '—'} />
      </div>
      {data.translated_text && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <p className="text-slate-500 mb-0.5">Translation:</p>
          <p className="text-slate-700 italic">"{data.translated_text}"</p>
        </div>
      )}
      {data.contradictions?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
          {data.contradictions.map((c, i) => (
            <div key={i} className="flex items-start gap-1">
              <Badge text="Contradiction" color="red" />
              <span className="text-slate-600">{c}</span>
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
          <span className="text-emerald-600">&#10003;</span>
          <span className="text-emerald-700 font-medium">All checks passed</span>
        </div>
      </DataCard>
    );
  }
  return (
    <DataCard>
      <div className="space-y-1.5">
        {hasAdaptations && (
          <div className="space-y-1 pb-1.5 mb-1.5 border-b border-slate-100">
            {data.adaptations.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge text="auto-adapted" color="blue" />
                <div>
                  <span className="text-slate-600">{a.description}</span>
                  <p className="text-blue-600 text-[11px]">{a.action}</p>
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
              <span className="text-slate-700 font-medium">{issue.type.replace(/_/g, ' ')}</span>
              <p className="text-slate-500 text-[11px]">{issue.description}</p>
              <p className="text-blue-600 text-[11px]">{issue.action}</p>
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
            <div key={i} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-slate-700 font-medium">{c.supplier_name}</span>
                {c.preferred && <Badge text="Preferred" color="blue" />}
              </div>
              <div className="flex gap-2 text-[10px] text-slate-500">
                <span>Q:{c.quality_score}</span>
                <span>R:{c.risk_score}</span>
                <span>E:{c.esg_score}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {data.excluded?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <p className="text-slate-500 mb-1">Excluded:</p>
          {data.excluded.map((e, i) => (
            <div key={i} className="flex items-center justify-between py-0.5 text-slate-400">
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
        <span className="text-slate-500">No suppliers scored — supplier discovery triggered to find alternatives</span>
      </DataCard>
    );
  }
  const isUnitPricing = data.unit_pricing_mode;
  return (
    <DataCard className="p-0 overflow-hidden">
      {isUnitPricing && (
        <div className="px-2 py-1.5 bg-blue-50 text-blue-700 text-[11px] flex items-center gap-1.5">
          <Badge text="auto-adapted" color="blue" />
          <span>No quantity specified — showing per-unit pricing. Provide quantity for total costs.</span>
        </div>
      )}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className="text-left px-2 py-1.5 font-medium">#</th>
            <th className="text-left px-2 py-1.5 font-medium">Supplier</th>
            <th className="text-right px-2 py-1.5 font-medium">{isUnitPricing ? 'Unit Price' : 'Price'}</th>
            <th className="text-right px-2 py-1.5 font-medium">Score</th>
            <th className="text-center px-2 py-1.5 font-medium">Tags</th>
          </tr>
        </thead>
        <tbody>
          {data.shortlist.map((s, i) => (
            <tr key={i} className={`border-t border-slate-100 ${i === 0 ? 'bg-emerald-50/50' : ''}`}>
              <td className="px-2 py-1.5 font-mono text-slate-500">{s.rank}</td>
              <td className="px-2 py-1.5 text-slate-800 font-medium">{s.supplier_name}</td>
              <td className="px-2 py-1.5 text-right font-mono text-slate-700">
                {s.currency} {isUnitPricing
                  ? Number(s.unit_price).toLocaleString() + '/unit'
                  : Number(s.total_price).toLocaleString()
                }
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-slate-700">
                {Number(s.composite_score).toFixed(2)}
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
            <p className="text-slate-700 font-medium">{n.supplier_name}</p>
            <p className="text-slate-500 mt-0.5 leading-relaxed">{n.note}</p>
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
          <span className="text-slate-400">&#8212;</span>
          <span className="text-slate-500">Sufficient supplier coverage</span>
        </div>
      </DataCard>
    );
  }
  return (
    <DataCard>
      <div className="flex items-center gap-2 mb-2">
        <Badge text={data.trigger_reason} color="teal" />
        <span className="text-slate-500">{data.suppliers.length} discovered</span>
      </div>
      <div className="space-y-1.5">
        {data.suppliers.map((s, i) => (
          <div key={i} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-0">
            <div>
              <span className="text-slate-700 font-medium">{s.name}</span>
              <span className="text-slate-400 ml-2 text-[10px]">via {s.source}</span>
            </div>
            {s.estimated_capability && (
              <span className="text-slate-500 text-[10px]">{s.estimated_capability}</span>
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
        <div className="pb-1.5 mb-1.5 border-b border-slate-200">
          <KV label="Approval Rule" value={data.approval_threshold.rule} />
          <KV label="Quotes Required" value={data.approval_threshold.quotes_required} />
          <KV label="Basis" value={data.approval_threshold.basis} />
        </div>
      )}
      {data.preferred_supplier && (
        <div className="pb-1.5 mb-1.5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Preferred:</span>
            <span className="text-slate-800 font-medium">{data.preferred_supplier.supplier || 'None'}</span>
            <Badge
              text={data.preferred_supplier.status}
              color={data.preferred_supplier.status === 'confirmed' ? 'emerald' : data.preferred_supplier.status === 'not_matched' ? 'amber' : 'slate'}
            />
          </div>
        </div>
      )}
      <div className="flex gap-4">
        <div>
          <span className="text-slate-500">Category rules: </span>
          <span className="font-medium text-slate-700">{data.category_rules?.length || 0}</span>
          {data.category_rules?.some(r => !r.applies) && <Badge text="Non-compliant" color="red" />}
        </div>
        <div>
          <span className="text-slate-500">Geo rules: </span>
          <span className="font-medium text-slate-700">{data.geography_rules?.length || 0}</span>
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
          <span className="text-emerald-600">&#10003;</span>
          <span className="text-emerald-700 font-medium">No escalations — ready for approval</span>
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
              <span className="text-slate-700 font-medium">{e.rule}</span>
              <p className="text-slate-500 text-[11px]">{e.trigger}</p>
              <p className="text-red-500 text-[10px]">Requires: {e.escalate_to}</p>
            </div>
          </div>
        ))}
        {advisories.map((e, i) => (
          <div key={`a-${i}`} className="flex items-start gap-2">
            <Badge text="ADVISORY" color="blue" />
            <div>
              <span className="text-slate-700 font-medium">{e.rule}</span>
              <p className="text-slate-500 text-[11px]">{e.trigger}</p>
              <p className="text-blue-500 text-[10px]">FYI: {e.escalate_to}</p>
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
          <span className="text-slate-700 font-medium">{data.chosen_supplier}</span>
        )}
        {data.total_price && (
          <span className="text-slate-500 font-mono">{data.currency} {Number(data.total_price).toLocaleString()}</span>
        )}
      </div>
      {data.narrative && (
        <p className="text-slate-600 leading-relaxed">{data.narrative}</p>
      )}
    </DataCard>
  );
}

function WhatIfData({ data }) {
  if (!data.scenarios?.length) {
    return (
      <DataCard>
        <span className="text-slate-500">Current parameters are optimal</span>
      </DataCard>
    );
  }
  return (
    <DataCard>
      <div className="space-y-2">
        {data.scenarios.map((s, i) => (
          <div key={i} className="pb-1.5 border-b border-slate-100 last:border-0 last:pb-0">
            <div className="flex items-center gap-2">
              <Badge text={s.scenario?.replace(/_/g, ' ')} color="blue" />
              <span className="text-slate-700 font-medium">{s.title}</span>
            </div>
            <p className="text-slate-500 text-[11px] mt-0.5">{s.description}</p>
            {s.current_value && s.suggested_value && (
              <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                <span className="text-slate-400">{s.current_value}</span>
                <span className="text-slate-300">&rarr;</span>
                <span className="text-blue-600 font-medium">{s.suggested_value}</span>
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
        <div className="mt-1.5 pt-1.5 border-t border-slate-200">
          <p className="text-slate-500 mb-0.5">Historical:</p>
          <p className="text-slate-600">{data.historical_award}</p>
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
