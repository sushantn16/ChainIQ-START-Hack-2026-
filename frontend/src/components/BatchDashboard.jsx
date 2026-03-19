import { useState } from 'react'
import { processRequestStreaming } from '../api'

export default function BatchDashboard({ onViewResult }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [batchSize, setBatchSize] = useState(20);

  async function runBatch() {
    setRunning(true);
    setResults([]);
    setStats(null);

    // Fetch request IDs first
    const res = await fetch(`/api/requests?limit=${batchSize}&offset=0`);
    const data = await res.json();
    const ids = data.items.map(r => r.request_id);
    setProgress({ done: 0, total: ids.length, current: '' });

    const batchResults = [];
    const batchStats = {
      total: ids.length,
      recommend: 0,
      recommend_with_escalation: 0,
      cannot_proceed: 0,
      avg_confidence: 0,
      total_suppliers_evaluated: 0,
      discoveries_triggered: 0,
      what_if_scenarios: 0,
      total_escalations: 0,
    };

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      setProgress({ done: i, total: ids.length, current: id });

      try {
        const result = await new Promise((resolve) => {
          let finalResult = null;
          processRequestStreaming({ request_id: id }, (event) => {
            if (event.step === 'done' && event.result) {
              finalResult = event.result;
            }
          }).then(() => resolve(finalResult));
        });

        if (result) {
          batchResults.push(result);
          batchStats[result.recommendation.status] = (batchStats[result.recommendation.status] || 0) + 1;
          batchStats.avg_confidence += result.request_interpretation.extraction_confidence || 0;
          batchStats.total_suppliers_evaluated += result.supplier_shortlist.length;
          if (result.supplier_discovery?.triggered) batchStats.discoveries_triggered++;
          batchStats.what_if_scenarios += (result.what_if?.length || 0);
          batchStats.total_escalations += result.escalations.length;
        }
      } catch (e) {
        batchStats.cannot_proceed++;
      }
    }

    batchStats.avg_confidence = batchStats.total > 0
      ? (batchStats.avg_confidence / batchStats.total * 100).toFixed(0)
      : 0;

    setResults(batchResults);
    setStats(batchStats);
    setProgress({ done: ids.length, total: ids.length, current: 'Complete' });
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Batch Processing</h2>
          <p className="text-slate-500 mt-1">Process multiple requests and view aggregate statistics</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={batchSize}
            onChange={e => setBatchSize(Number(e.target.value))}
            disabled={running}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value={10}>10 requests</option>
            <option value={20}>20 requests</option>
            <option value={50}>50 requests</option>
            <option value={100}>100 requests</option>
          </select>
          <button
            onClick={runBatch}
            disabled={running}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {running ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Processing...
              </>
            ) : 'Run Batch'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {(running || stats) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-600">
              {running ? `Processing ${progress.current}...` : 'Batch complete'}
            </span>
            <span className="text-slate-500 font-mono">{progress.done}/{progress.total}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Auto-Resolved"
            value={stats.recommend}
            total={stats.total}
            color="emerald"
          />
          <StatCard
            label="With Escalation"
            value={stats.recommend_with_escalation}
            total={stats.total}
            color="amber"
          />
          <StatCard
            label="Blocked"
            value={stats.cannot_proceed}
            total={stats.total}
            color="red"
          />
          <StatCard
            label="Avg Confidence"
            value={`${stats.avg_confidence}%`}
            color="blue"
          />
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MiniStat label="Suppliers Evaluated" value={stats.total_suppliers_evaluated} />
          <MiniStat label="Discoveries Triggered" value={stats.discoveries_triggered} />
          <MiniStat label="What-If Scenarios" value={stats.what_if_scenarios} />
          <MiniStat label="Total Escalations" value={stats.total_escalations} />
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">Results ({results.length})</h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200">
                  <th className="text-left px-4 py-2 text-slate-600 font-medium">Request</th>
                  <th className="text-left px-4 py-2 text-slate-600 font-medium">Category</th>
                  <th className="text-center px-4 py-2 text-slate-600 font-medium">Status</th>
                  <th className="text-right px-4 py-2 text-slate-600 font-medium">Suppliers</th>
                  <th className="text-right px-4 py-2 text-slate-600 font-medium">Escalations</th>
                  <th className="text-center px-4 py-2 text-slate-600 font-medium">Discovery</th>
                  <th className="text-center px-4 py-2 text-slate-600 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.request_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs">{r.request_id}</td>
                    <td className="px-4 py-2 text-slate-700 text-xs">
                      {r.request_interpretation.category_l2}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.recommendation.status === 'recommend' ? 'bg-emerald-100 text-emerald-700' :
                        r.recommendation.status === 'recommend_with_escalation' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {r.recommendation.status === 'recommend' ? 'OK' :
                         r.recommendation.status === 'recommend_with_escalation' ? 'ESC' : 'BLOCKED'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">{r.supplier_shortlist.length}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{r.escalations.length}</td>
                    <td className="px-4 py-2 text-center">
                      {r.supplier_discovery?.triggered ? (
                        <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs">Yes</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => onViewResult(r)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, total, color }) {
  const pct = total ? ((typeof value === 'number' ? value : 0) / total * 100).toFixed(0) : null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className={`text-3xl font-bold text-${color}-600`}>{typeof value === 'number' ? value : value}</p>
        {pct !== null && <span className="text-sm text-slate-400">({pct}%)</span>}
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-lg font-semibold text-slate-900">{value}</span>
    </div>
  );
}
