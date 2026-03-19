import { useState } from 'react'
import { processRequestStreaming } from '../api'

export default function BatchDashboard({ onViewResult, results, setResults, stats, setStats, progress, setProgress, running, setRunning }) {
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[3px] text-brand-500 mb-2">Batch</p>
          <h2 className="text-3xl font-black uppercase tracking-tight text-[#1a1a1a]">Batch Processing</h2>
          <p className="text-sm text-[#999] mt-1">Process multiple requests and view aggregate statistics</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={batchSize}
            onChange={e => setBatchSize(Number(e.target.value))}
            disabled={running}
            className="px-3 py-2 border border-[#e0e0e0] rounded-lg text-xs font-bold uppercase bg-white"
          >
            <option value={10}>10 requests</option>
            <option value={20}>20 requests</option>
            <option value={50}>50 requests</option>
            <option value={100}>100 requests</option>
          </select>
          <button
            onClick={runBatch}
            disabled={running}
            className="px-5 py-2.5 bg-brand-500 text-white text-xs font-bold uppercase tracking-[1px] rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors flex items-center gap-2"
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
        <div className="border border-[#e0e0e0] rounded-xl p-5 bg-white">
          <div className="flex items-center justify-between text-xs mb-3">
            <span className="text-[#555] font-bold">
              {running ? `Processing ${progress.current}...` : 'Batch complete'}
            </span>
            <span className="text-[#999] font-mono">{progress.done}/{progress.total}</span>
          </div>
          <div className="w-full bg-[#e0e0e0] h-2 rounded-full overflow-hidden">
            <div
              className="bg-brand-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="flex gap-0 border border-[#e0e0e0] rounded-xl overflow-hidden">
          <StatCard label="Auto-Resolved" value={stats.recommend} total={stats.total} accent="green" />
          <StatCard label="With Escalation" value={stats.recommend_with_escalation} total={stats.total} accent="amber" />
          <StatCard label="Blocked" value={stats.cannot_proceed} total={stats.total} accent="red" />
          <StatCard label="Avg Confidence" value={`${stats.avg_confidence}%`} accent="brand" />
        </div>
      )}

      {stats && (
        <div className="flex gap-0 border border-[#e0e0e0] rounded-xl overflow-hidden bg-white">
          <MiniStat label="Suppliers Evaluated" value={stats.total_suppliers_evaluated} />
          <MiniStat label="Discoveries Triggered" value={stats.discoveries_triggered} />
          <MiniStat label="What-If Scenarios" value={stats.what_if_scenarios} />
          <MiniStat label="Total Escalations" value={stats.total_escalations} />
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="border border-[#e0e0e0] rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-[#1a1a1a]">
            <h3 className="text-xs font-bold uppercase tracking-[1.5px] text-white">Results ({results.length})</h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#f4f4f4]">
                <tr className="border-b border-[#e0e0e0]">
                  <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Request</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Category</th>
                  <th className="text-center px-4 py-2 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Status</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Suppliers</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Escalations</th>
                  <th className="text-center px-4 py-2 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Discovery</th>
                  <th className="text-center px-4 py-2 text-[10px] font-bold uppercase tracking-[1px] text-[#999]"></th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.request_id} className="border-b border-[#e0e0e0] hover:bg-[#f4f4f4]">
                    <td className="px-4 py-2 font-mono text-xs text-[#333]">{r.request_id}</td>
                    <td className="px-4 py-2 text-[#333] text-xs">
                      {r.request_interpretation.category_l2}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        r.recommendation.status === 'recommend' ? 'bg-[#d1fae5] text-[#1a7a3c]' :
                        r.recommendation.status === 'recommend_with_escalation' ? 'bg-[#fff8e1] text-[#856400]' :
                        'bg-[#fde8e8] text-brand-500'
                      }`}>
                        {r.recommendation.status === 'recommend' ? 'OK' :
                         r.recommendation.status === 'recommend_with_escalation' ? 'ESC' : 'BLOCKED'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-[#333] font-mono">{r.supplier_shortlist.length}</td>
                    <td className="px-4 py-2 text-right text-[#333] font-mono">{r.escalations.length}</td>
                    <td className="px-4 py-2 text-center">
                      {r.supplier_discovery?.triggered ? (
                        <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold uppercase">Yes</span>
                      ) : (
                        <span className="text-[#ccc]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => onViewResult(r)}
                        className="text-[10px] font-bold uppercase tracking-[1px] text-[#1a1a1a] hover:text-brand-500 transition-colors"
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

function StatCard({ label, value, total, accent }) {
  const pct = total ? ((typeof value === 'number' ? value : 0) / total * 100).toFixed(0) : null;
  const colors = {
    green: { bg: '', num: 'text-[#1a7a3c]' },
    amber: { bg: '', num: 'text-[#e67700]' },
    red: { bg: 'bg-brand-500', num: 'text-white' },
    brand: { bg: '', num: 'text-brand-500' },
  };
  const c = colors[accent] || colors.brand;
  return (
    <div className={`flex-1 px-5 py-5 text-center border-r border-[#e0e0e0] last:border-r-0 ${c.bg}`}>
      <p className={`text-3xl font-black ${c.num}`}>{typeof value === 'number' ? value : value}</p>
      <p className={`text-[10px] font-bold uppercase tracking-[1.5px] mt-1 ${c.bg ? 'text-white/70' : 'text-[#999]'}`}>
        {label}
      </p>
      {pct !== null && <p className={`text-xs mt-0.5 ${c.bg ? 'text-white/50' : 'text-[#ccc]'}`}>({pct}%)</p>}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="flex-1 px-4 py-3 flex items-center justify-between border-r border-[#e0e0e0] last:border-r-0">
      <span className="text-[10px] font-bold uppercase tracking-wide text-[#999]">{label}</span>
      <span className="text-lg font-black text-[#1a1a1a]">{value}</span>
    </div>
  );
}
