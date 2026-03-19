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

  function runPipeline(pl) {
    setSteps([]);
    setCurrentStep(null);
    setResult(null);
    setError(null);

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
  }, [runCount]);

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

  const missingFields = result?.missing_fields || [];
  const isPreview = result?.is_preview;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm text-brand-500 hover:text-brand-700 flex items-center gap-1"
      >
        <span>&larr;</span> Back
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 font-medium">Error: {error}</p>
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
          interpretation={result.request_interpretation}
          isPreview={isPreview}
          onReprocess={handleReprocess}
        />
      )}

      {/* Show result once done */}
      {result && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-slate-200"></div>
            <span className="text-sm font-medium text-slate-500 px-2">
              Results
            </span>
            <div className="h-px flex-1 bg-slate-200"></div>
          </div>
          {/* Preview banner removed — results are always shown as final */}
          <ResultView result={result} />
        </div>
      )}
    </div>
  );
}
