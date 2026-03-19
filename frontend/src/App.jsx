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
  const [batchResults, setBatchResults] = useState([]);
  const [batchStats, setBatchStats] = useState(null);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, current: '' });
  const [batchRunning, setBatchRunning] = useState(false);

  function handleProcess(payload) {
    setProcessing(payload);
  }

  function handleBack() {
    setProcessing(null);
    setBatchResult(null);
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-[#111] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <span className="text-xl font-black tracking-tight text-white uppercase">
                CHAIN<span className="text-brand-500">IQ</span>
              </span>
              <span className="text-[10px] uppercase tracking-[2px] text-[#888] hidden sm:inline">
                Autonomous Sourcing Agent
              </span>
            </div>
            <nav className="flex gap-0">
              {TABS.map((t, i) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setProcessing(null); setBatchResult(null); }}
                  className={`px-5 py-4 text-xs font-bold uppercase tracking-[1.5px] transition-colors border-b-[3px] -mb-px ${
                    tab === t && !processing && !batchResult
                      ? 'text-white border-brand-500'
                      : 'text-[#999] border-transparent hover:text-white'
                  }`}
                >
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] mr-2 ${
                    tab === t && !processing && !batchResult
                      ? 'bg-brand-500 text-white'
                      : 'bg-[#333] text-[#888]'
                  }`}>{i + 1}</span>
                  {t}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {batchResult ? (
          <div>
            <button
              onClick={handleBack}
              className="mb-4 text-xs font-bold uppercase tracking-[1px] text-[#999] hover:text-[#111] flex items-center gap-1 transition-colors"
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
          <BatchDashboard
            onViewResult={setBatchResult}
            results={batchResults}
            setResults={setBatchResults}
            stats={batchStats}
            setStats={setBatchStats}
            progress={batchProgress}
            setProgress={setBatchProgress}
            running={batchRunning}
            setRunning={setBatchRunning}
          />
        ) : null}
      </main>
    </div>
  )
}
