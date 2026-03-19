import { useState } from 'react'

const EXAMPLES = [
  'We need 50 laptops for our Berlin office, budget around 75000 EUR, needed by 2026-06-01',
  'Brauchen 200 Docking Stations fur unsere Buros in Zurich und Munchen, Budget ca. 30000 CHF',
  'Nous avons besoin de 100 jours de conseil en cybersecurite pour notre equipe a Paris, budget 250000 EUR',
  'Need 20 ergonomic office chairs for the London office, delivery within 2 weeks',
  'Looking for cloud compute instances, 5000 instance-hours per month, data must stay in EU, budget 15000 EUR',
];

export default function FreeTextInput({ onProcess }) {
  const [text, setText] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    onProcess({ request_text: text });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">New Request</h2>
        <p className="text-slate-500 mt-1">
          Type a purchase request in any language — the AI will extract, classify, and evaluate it
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Describe your procurement need
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={5}
            placeholder="e.g., We need 50 laptops for our Berlin office, budget around 75000 EUR, needed by June 2026..."
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-base resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={!text.trim()}
              className="px-6 py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Process Request
            </button>
          </div>
        </div>
      </form>

      {/* Example Prompts */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-medium text-slate-700 mb-3">Try an example</h3>
        <div className="space-y-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setText(ex)}
              className="w-full text-left px-4 py-3 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
