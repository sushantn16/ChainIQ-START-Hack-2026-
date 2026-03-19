import { useState, useEffect } from 'react'
import { fetchRequests } from '../api'

const TAG_COLORS = {
  standard: 'bg-[#f4f4f4] text-[#666]',
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[3px] text-brand-500 mb-2">Browse</p>
          <h2 className="text-3xl font-black uppercase tracking-tight text-[#1a1a1a]">Requests</h2>
          <p className="text-sm text-[#999] mt-1">{total} total requests</p>
        </div>
        <select
          value={filter}
          onChange={e => { setFilter(e.target.value); setOffset(0); }}
          className="px-3 py-2 border border-[#e0e0e0] rounded-lg text-xs font-bold uppercase tracking-wide bg-white"
        >
          <option value="">All scenarios</option>
          {tags.filter(Boolean).map(t => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="border border-[#e0e0e0] rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0]">
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">ID</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Category</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Country</th>
              <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Qty</th>
              <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Budget</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Tags</th>
              <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-[1px] text-[#999]">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[#e0e0e0] animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-[#e0e0e0]"></div></td>
                  ))}
                </tr>
              ))
            ) : requests.map(r => (
              <tr key={r.request_id} className="border-b border-[#e0e0e0] hover:bg-[#f4f4f4] transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-[#333]">{r.request_id}</td>
                <td className="px-4 py-3">
                  <span className="text-[10px] uppercase tracking-wide text-[#999]">{r.category_l1}</span>
                  <br />
                  <span className="text-sm font-bold text-[#1a1a1a]">{r.category_l2}</span>
                </td>
                <td className="px-4 py-3 text-[#333]">{r.country}</td>
                <td className="px-4 py-3 text-right font-mono text-[#333]">
                  {r.quantity != null ? Number(r.quantity).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[#333]">
                  {r.budget_amount != null
                    ? `${r.currency || ''} ${Number(r.budget_amount).toLocaleString()}`
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(r.scenario_tags || []).map(t => (
                      <span key={t} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${TAG_COLORS[t] || 'bg-[#f4f4f4] text-[#666]'}`}>
                        {t.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onProcess({ request_id: r.request_id })}
                    className="px-3 py-1.5 bg-[#1a1a1a] text-white text-[10px] font-bold uppercase tracking-[1px] rounded-md hover:bg-brand-500 transition-colors"
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
        <p className="text-xs text-[#999]">
          Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="px-4 py-2 border border-[#e0e0e0] rounded-lg text-xs font-bold uppercase tracking-wide disabled:opacity-40 hover:bg-[#f4f4f4] transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={offset + LIMIT >= total}
            className="px-4 py-2 border border-[#e0e0e0] rounded-lg text-xs font-bold uppercase tracking-wide disabled:opacity-40 hover:bg-[#f4f4f4] transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
