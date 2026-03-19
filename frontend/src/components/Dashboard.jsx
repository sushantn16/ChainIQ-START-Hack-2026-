import { useState, useEffect } from 'react'
import { fetchDashboard } from '../api'

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard().then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <Skeleton />;

  const stats = [
    { label: 'Total Requests', value: data.total_requests, accent: true },
    { label: 'Suppliers', value: data.total_suppliers },
    { label: 'Pricing Tiers', value: data.total_pricing_rows },
    { label: 'Historical Awards', value: data.total_awards },
  ];

  const tags = Object.entries(data.scenario_tag_distribution || {}).sort((a, b) => b[1] - a[1]);
  const maxTag = tags.length ? tags[0][1] : 1;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[3px] text-brand-500 mb-2">Overview</p>
        <h2 className="text-3xl font-black uppercase tracking-tight text-[#1a1a1a]">Dashboard</h2>
        <p className="text-sm text-[#999] mt-1">Procurement data and request pipeline</p>
      </div>

      {/* Stat Cards */}
      <div className="flex gap-0 border border-[#e0e0e0] rounded-xl overflow-hidden">
        {stats.map(s => (
          <div key={s.label} className={`flex-1 px-6 py-6 text-center border-r border-[#e0e0e0] last:border-r-0 ${s.accent ? 'bg-brand-500' : 'bg-white'}`}>
            <p className={`text-3xl font-black ${s.accent ? 'text-white' : 'text-[#1a1a1a]'}`}>
              {s.value.toLocaleString()}
            </p>
            <p className={`text-[10px] font-bold uppercase tracking-[1.5px] mt-1 ${s.accent ? 'text-white/70' : 'text-[#999]'}`}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Scenario Tags */}
      <div className="border border-[#e0e0e0] rounded-xl overflow-hidden">
        <div className="bg-[#f4f4f4] px-6 py-4 border-b border-[#e0e0e0]">
          <h3 className="text-xs font-bold uppercase tracking-[2px] text-[#666]">Scenario Distribution</h3>
        </div>
        <div className="p-6 space-y-3 bg-white">
          {tags.map(([tag, count]) => (
            <div key={tag} className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wide text-[#1a1a1a] w-32 text-right">{tag.replace('_', ' ')}</span>
              <div className="flex-1 h-[6px] bg-[#e0e0e0] rounded-full overflow-hidden">
                <div
                  className="bg-[#1a1a1a] h-full rounded-full transition-all"
                  style={{ width: `${(count / maxTag) * 100}%`, minWidth: '24px' }}
                />
              </div>
              <span className="text-xs font-bold text-[#1a1a1a] w-8 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-[#e0e0e0] rounded-xl overflow-hidden">
        <div className="p-6 bg-white border-r border-[#e0e0e0]">
          <p className="text-xs font-bold uppercase tracking-[2px] text-[#999] mb-2">Requests with Awards</p>
          <p className="text-4xl font-black text-[#1a7a3c]">{data.requests_with_awards}</p>
          <p className="text-xs text-[#999] mt-1">
            {((data.requests_with_awards / data.total_requests) * 100).toFixed(0)}% of total requests have historical award data
          </p>
        </div>
        <div className="p-6 bg-white">
          <p className="text-xs font-bold uppercase tracking-[2px] text-[#999] mb-2">Pipeline Status</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="w-3 h-3 rounded-full bg-[#1a7a3c] animate-pulse"></span>
            <span className="text-sm text-[#555]">System operational — LLM + deterministic engine active</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-3 h-3 rounded-full bg-brand-500"></span>
            <span className="text-sm text-[#555]">10-step pipeline ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-[#e0e0e0] w-48"></div>
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-[#e0e0e0]"></div>)}
      </div>
      <div className="h-64 bg-[#e0e0e0]"></div>
    </div>
  );
}
