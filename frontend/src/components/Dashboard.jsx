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
    { label: 'Total Requests', value: data.total_requests, color: 'brand' },
    { label: 'Suppliers', value: data.total_suppliers, color: 'emerald' },
    { label: 'Pricing Tiers', value: data.total_pricing_rows, color: 'purple' },
    { label: 'Historical Awards', value: data.total_awards, color: 'amber' },
  ];

  const tags = Object.entries(data.scenario_tag_distribution || {}).sort((a, b) => b[1] - a[1]);
  const maxTag = tags.length ? tags[0][1] : 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Dashboard</h2>
        <p className="text-slate-500 mt-1">Overview of procurement data and request pipeline</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 text-${s.color}-600`}>
              {s.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Scenario Tags */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Scenario Distribution</h3>
        <div className="space-y-3">
          {tags.map(([tag, count]) => (
            <div key={tag} className="flex items-center gap-3">
              <span className="text-sm text-slate-600 w-32 text-right capitalize">{tag.replace('_', ' ')}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                <div
                  className="bg-brand-500 h-full rounded-full flex items-center justify-end pr-2 transition-all"
                  style={{ width: `${(count / maxTag) * 100}%`, minWidth: '40px' }}
                >
                  <span className="text-xs text-white font-medium">{count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Requests with Awards</h3>
          <p className="text-4xl font-bold text-emerald-600">{data.requests_with_awards}</p>
          <p className="text-sm text-slate-500 mt-1">
            {((data.requests_with_awards / data.total_requests) * 100).toFixed(0)}% of total requests have historical award data
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Pipeline Status</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-sm text-slate-600">System operational — LLM + deterministic engine active</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-3 h-3 rounded-full bg-brand-500"></span>
            <span className="text-sm text-slate-600">10-step pipeline ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-slate-200 rounded w-48"></div>
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-200 rounded-xl"></div>)}
      </div>
      <div className="h-64 bg-slate-200 rounded-xl"></div>
    </div>
  );
}
