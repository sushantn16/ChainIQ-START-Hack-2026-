import { useState } from 'react'

export default function MissingFieldsPrompt({ missingFields, interpretation, isPreview, onReprocess }) {
  const [values, setValues] = useState(() => {
    const init = {};
    for (const f of missingFields) {
      // Don't pre-fill number/date fields with formatted suggestions — use them as placeholders only
      if (f.type === 'number' || f.type === 'date') {
        init[f.field] = '';
      } else {
        init[f.field] = f.suggestion || '';
      }
    }
    return init;
  });

  const required = missingFields.filter(f => f.required);
  const optional = missingFields.filter(f => !f.required);
  const canSubmit = required.every(f => values[f.field] && String(values[f.field]).trim() !== '');

  function handleSubmit() {
    // Build enriched payload
    const payload = {};

    // Carry forward existing interpretation fields (use != null to preserve 0 values)
    if (interpretation.category_l1) payload.category_l1 = interpretation.category_l1;
    if (interpretation.category_l2) payload.category_l2 = interpretation.category_l2;
    if (interpretation.quantity != null) payload.quantity = interpretation.quantity;
    if (interpretation.budget_amount != null) payload.budget_amount = interpretation.budget_amount;
    if (interpretation.currency) payload.currency = interpretation.currency;
    if (interpretation.delivery_countries?.length) {
      payload.delivery_countries = interpretation.delivery_countries;
      payload.country = interpretation.delivery_countries[0];
    }
    if (interpretation.required_by_date) payload.required_by_date = interpretation.required_by_date;
    if (interpretation.preferred_supplier_stated) payload.preferred_supplier_mentioned = interpretation.preferred_supplier_stated;

    // Override with user-provided values
    for (const [field, value] of Object.entries(values)) {
      if (!value || String(value).trim() === '') continue;
      const numericValue = String(value).replace(/[^0-9.]/g, '');
      switch (field) {
        case 'quantity': {
          const parsed = parseInt(numericValue, 10);
          payload.quantity = Number.isNaN(parsed) ? null : parsed;
          break;
        }
        case 'budget_amount': {
          const parsed = parseFloat(numericValue);
          payload.budget_amount = Number.isNaN(parsed) ? null : parsed;
          break;
        }
        case 'delivery_country':
          payload.delivery_countries = [String(value).trim().toUpperCase()];
          payload.country = String(value).trim().toUpperCase();
          break;
        case 'required_by_date':
          payload.required_by_date = value;
          break;
        case 'category':
          // Try to parse "L1/L2" format
          const parts = String(value).split('/');
          if (parts.length === 2) {
            payload.category_l1 = parts[0].trim();
            payload.category_l2 = parts[1].trim();
          }
          break;
        default:
          payload[field] = value;
      }
    }

    onReprocess(payload);
  }

  return (
    <div className="border border-brand-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 bg-brand-500">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-black">?</span>
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[1px] text-white">
              {isPreview ? 'Complete Your Request' : 'Improve Your Results'}
            </h3>
            <p className="text-xs text-white/70 mt-0.5">
              {isPreview
                ? 'We\'ve shown a preview based on what we know. Provide the missing details for a final recommendation.'
                : 'Your recommendation is ready. Adding these optional details will improve accuracy.'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="px-6 py-5 space-y-5 bg-white">
        {required.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-brand-500 uppercase tracking-[2px] mb-3">Required to finalize</p>
            <div className="space-y-3">
              {required.map(f => (
                <FieldInput key={f.field} field={f} value={values[f.field]} onChange={v => setValues(prev => ({ ...prev, [f.field]: v }))} />
              ))}
            </div>
          </div>
        )}

        {optional.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-[#999] uppercase tracking-[2px] mb-3">Optional (improves accuracy)</p>
            <div className="space-y-3">
              {optional.map(f => (
                <FieldInput key={f.field} field={f} value={values[f.field]} onChange={v => setValues(prev => ({ ...prev, [f.field]: v }))} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-[#e0e0e0] bg-[#f4f4f4] flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-[#999] font-bold">
          {isPreview
            ? (canSubmit
                ? 'Ready to re-process with complete data'
                : `${required.filter(f => !values[f.field] || String(values[f.field]).trim() === '').length} required field(s) still needed`)
            : 'Fill in any fields above and re-process'
          }
        </p>
        <button
          onClick={handleSubmit}
          disabled={isPreview && !canSubmit}
          className="px-5 py-2.5 bg-brand-500 text-white text-xs font-bold uppercase tracking-[1px] rounded-lg hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPreview ? 'Re-process with Complete Data' : 'Re-process for Better Accuracy'}
        </button>
      </div>
    </div>
  );
}


function FieldInput({ field, value, onChange }) {
  const inputBase = "w-full px-3 py-2.5 border border-[#e0e0e0] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";

  return (
    <div className="flex items-start gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <label className="text-sm font-bold text-[#1a1a1a]">{field.label}</label>
          {field.required && <span className="text-brand-500 text-[10px] font-bold uppercase">required</span>}
        </div>
        <p className="text-xs text-[#999] mb-1.5">{field.reason}</p>
        {field.type === 'number' ? (
          <input
            type="number"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={field.suggestion || `Enter ${field.label.toLowerCase()}`}
            className={inputBase}
          />
        ) : field.type === 'date' ? (
          <input
            type="date"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={inputBase}
          />
        ) : field.type === 'select' && field.options ? (
          <select value={value} onChange={e => onChange(e.target.value)} className={inputBase}>
            <option value="">Select...</option>
            {field.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={field.suggestion || `Enter ${field.label.toLowerCase()}`}
            className={inputBase}
          />
        )}
        {field.suggestion && field.type === 'number' && (
          <button
            onClick={() => onChange(field.suggestion.replace(/[^0-9.]/g, ''))}
            className="mt-1 text-xs text-brand-500 hover:text-brand-700 font-bold"
          >
            Use suggested: {field.suggestion}
          </button>
        )}
      </div>
    </div>
  );
}
