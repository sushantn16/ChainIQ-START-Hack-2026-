import { useState, useEffect, useRef } from 'react'
import { processRequestStreaming } from '../api'
import PipelineThinking from './PipelineThinking'
import ResultView from './ResultView'
import MissingFieldsPrompt from './MissingFieldsPrompt'

export default function ProcessingView({ payload, onBack }) {
  const [steps, setSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [currentPayload, setCurrentPayload] = useState(payload);
  const startedRef = useRef(false);
  const [runCount, setRunCount] = useState(0);
  const [appliedOverrides, setAppliedOverrides] = useState([]);
  const overridesRef = useRef(appliedOverrides);

  function runPipeline(pl) {
    setSteps([]);
    setCurrentStep(null);
    setResult(null);
    setError(null);
    setAppliedOverrides([]);
    overridesRef.current = [];

    processRequestStreaming(pl, (event) => {
      setSteps(prev => [...prev, event]);
      setCurrentStep(event.step);
      if (event.step === 'done' && event.result) {
        setResult(event.result);
      }
    }).catch(err => {
      setError(err.message);
    });
  }

  useEffect(() => {
    if (startedRef.current && runCount === 0) return;
    startedRef.current = true;
    runPipeline(currentPayload);
  }, [currentPayload, runCount]);

  function handleReprocess(enrichedPayload) {
    // Merge with a request_text if original had one
    const newPayload = { ...enrichedPayload };
    if (payload.request_text && !newPayload.request_id) {
      newPayload.request_text = payload.request_text;
    }
    if (payload.request_id) {
      newPayload.request_id = payload.request_id;
    }
    setCurrentPayload(newPayload);
    setRunCount(prev => prev + 1);
  }

  function handleApplyScenario(scenario) {
    // Build override payload from the what-if scenario
    const interp = result?.request_interpretation || {};
    const newPayload = {};

    // Carry forward all existing interpretation fields (use != null to preserve 0 values)
    if (interp.category_l1) newPayload.category_l1 = interp.category_l1;
    if (interp.category_l2) newPayload.category_l2 = interp.category_l2;
    if (interp.quantity != null) newPayload.quantity = interp.quantity;
    if (interp.budget_amount != null) newPayload.budget_amount = interp.budget_amount;
    if (interp.currency) newPayload.currency = interp.currency;
    if (interp.delivery_countries?.length) {
      newPayload.delivery_countries = interp.delivery_countries;
      newPayload.country = interp.delivery_countries[0];
    }
    if (interp.required_by_date) newPayload.required_by_date = interp.required_by_date;
    if (interp.preferred_supplier_stated) newPayload.preferred_supplier_mentioned = interp.preferred_supplier_stated;

    // Apply the scenario's suggested value
    const param = scenario.parameter;
    const suggestedValue = scenario.suggested_value;
    if (param === 'budget_amount') newPayload.budget_amount = suggestedValue;
    else if (param === 'quantity') newPayload.quantity = suggestedValue;
    else if (param === 'days_until_required' && typeof suggestedValue === 'number') {
      // Convert days to a date
      const d = new Date();
      d.setDate(d.getDate() + suggestedValue);
      newPayload.required_by_date = d.toISOString().slice(0, 10);
    }

    // Track the override for audit
    const override = {
      field: param,
      original_value: String(scenario.current_value ?? ''),
      new_value: String(suggestedValue ?? ''),
      scenario: scenario.scenario,
      title: scenario.title,
    };

    // Use ref to get latest overrides (avoids stale closure)
    const updated = [...overridesRef.current, override];
    overridesRef.current = updated;
    setAppliedOverrides(updated);

    // Pass overrides to the backend
    newPayload.parameter_overrides = updated;

    handleReprocess(newPayload);
  }

  const missingFields = result?.missing_fields || [];
  const isPreview = result?.is_preview;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-xs font-bold uppercase tracking-[1px] text-[#999] hover:text-[#1a1a1a] flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> Back
      </button>

      {error && (
        <div className="bg-[#fde8e8] border border-brand-200 rounded-xl p-5">
          <p className="text-brand-500 font-bold text-sm">Error: {error}</p>
        </div>
      )}

      {/* Show thinking panel */}
      <PipelineThinking
        steps={steps}
        currentStep={result ? null : currentStep}
        done={!!result}
      />

      {/* Show missing fields prompt when there are fields to fill */}
      {missingFields.length > 0 && (
        <MissingFieldsPrompt
          missingFields={missingFields}
          interpretation={result.request_interpretation || {}}
          isPreview={isPreview}
          onReprocess={handleReprocess}
        />
      )}

      {/* Show result once done */}
      {result && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-[#e0e0e0]"></div>
            <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#999] px-2">
              Results
            </span>
            <div className="h-px flex-1 bg-[#e0e0e0]"></div>
          </div>
          <ResultView
            result={appliedOverrides.length > 0
              ? { ...result, audit_trail: { ...result.audit_trail, parameter_overrides: [...(result.audit_trail?.parameter_overrides || []), ...appliedOverrides] } }
              : result
            }
            onApplyScenario={handleApplyScenario}
          />
        </div>
      )}
    </div>
  );
}
