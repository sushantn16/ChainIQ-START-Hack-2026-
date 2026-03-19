import { useState } from 'react'
import Dashboard from './components/Dashboard'
import RequestList from './components/RequestList'
import FreeTextInput from './components/FreeTextInput'
import ProcessingView from './components/ProcessingView'
import BatchDashboard from './components/BatchDashboard'
import ResultView from './components/ResultView'

const TABS = ['Dashboard', 'Requests', 'New Request', 'Batch'];

export default function App() {
  const [tab, setTab] = useState('Dashboard');
  const [processing, setProcessing] = useState(null);
  const [batchResult, setBatchResult] = useState(null);

  function handleProcess(payload) {
    setProcessing(payload);
  }

  function handleBack() {
    setProcessing(null);
    setBatchResult(null);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">CQ</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900 leading-tight">Chain IQ</h1>
                <p className="text-xs text-slate-500 leading-tight">Autonomous Sourcing Agent</p>
              </div>
            </div>
            <nav className="flex gap-1">
              {TABS.map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setProcessing(null); setBatchResult(null); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tab === t && !processing && !batchResult
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {batchResult ? (
          <div>
            <button
              onClick={handleBack}
              className="mb-4 text-sm text-brand-500 hover:text-brand-700 flex items-center gap-1"
            >
              <span>&larr;</span> Back to Batch
            </button>
            <ResultView result={batchResult} />
          </div>
        ) : processing ? (
          <ProcessingView payload={processing} onBack={handleBack} />
        ) : tab === 'Dashboard' ? (
          <Dashboard />
        ) : tab === 'Requests' ? (
          <RequestList onProcess={handleProcess} />
        ) : tab === 'New Request' ? (
          <FreeTextInput onProcess={handleProcess} />
        ) : tab === 'Batch' ? (
          <BatchDashboard onViewResult={setBatchResult} />
        ) : null}
      </main>
    </div>
  )
}
