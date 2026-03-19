import { useState, useEffect } from 'react'
import { fetchRequests } from '../api'

const TAG_COLORS = {
  standard: 'bg-slate-100 text-slate-700',
  missing_info: 'bg-amber-100 text-amber-700',
  contradictory: 'bg-red-100 text-red-700',
  restricted: 'bg-red-100 text-red-700',
  threshold: 'bg-purple-100 text-purple-700',
  lead_time: 'bg-orange-100 text-orange-700',
  multilingual: 'bg-blue-100 text-blue-700',
  capacity: 'bg-yellow-100 text-yellow-700',
  multi_country: 'bg-teal-100 text-teal-700',
};

export default function RequestList({ onProcess }) {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    setLoading(true);
    fetchRequests(LIMIT, offset, filter || null).then(d => {
      setRequests(d.items);
      setTotal(d.total);
      setLoading(false);
    });
  }, [offset, filter]);

  const tags = ['', 'standard', 'missing_info', 'contradictory', 'restricted', 'threshold', 'lead_time', 'multilingual', 'capacity', 'multi_country'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Requests</h2>
          <p className="text-slate-500 mt-1">{total} total requests</p>
        </div>
        <select
          value={filter}
          onChange={e => { setFilter(e.target.value); setOffset(0); }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">All scenarios</option>
          {tags.filter(Boolean).map(t => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-slate-600 font-medium">ID</th>
              <th className="text-left px-4 py-3 text-slate-600 font-medium">Category</th>
              <th className="text-left px-4 py-3 text-slate-600 font-medium">Country</th>
              <th className="text-right px-4 py-3 text-slate-600 font-medium">Qty</th>
              <th className="text-right px-4 py-3 text-slate-600 font-medium">Budget</th>
              <th className="text-left px-4 py-3 text-slate-600 font-medium">Tags</th>
              <th className="text-center px-4 py-3 text-slate-600 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded"></div></td>
                  ))}
                </tr>
              ))
            ) : requests.map(r => (
              <tr key={r.request_id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.request_id}</td>
                <td className="px-4 py-3">
                  <span className="text-slate-500 text-xs">{r.category_l1}</span>
                  <br />
                  <span className="text-slate-900">{r.category_l2}</span>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.country}</td>
                <td className="px-4 py-3 text-right text-slate-700">
                  {r.quantity != null ? Number(r.quantity).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">
                  {r.budget_amount != null
                    ? `${r.currency || ''} ${Number(r.budget_amount).toLocaleString()}`
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(r.scenario_tags || []).map(t => (
                      <span key={t} className={`px-2 py-0.5 rounded-full text-xs font-medium ${TAG_COLORS[t] || 'bg-slate-100 text-slate-600'}`}>
                        {t.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onProcess({ request_id: r.request_id })}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                  >
                    Process
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-100"
          >
            Previous
          </button>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={offset + LIMIT >= total}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-100"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
