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
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[3px] text-brand-500 mb-2">New Request</p>
        <h2 className="text-3xl font-black uppercase tracking-tight text-[#1a1a1a]">Free-Text Input</h2>
        <p className="text-sm text-[#999] mt-1 max-w-xl">
          Type a purchase request in any language — the AI will extract, classify, and evaluate it
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="border border-[#e0e0e0] rounded-xl overflow-hidden">
          <div className="bg-[#f4f4f4] px-6 py-4 border-b border-[#e0e0e0]">
            <label className="text-xs font-bold uppercase tracking-[2px] text-[#666]">
              Describe your procurement need
            </label>
          </div>
          <div className="p-6 bg-white">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={5}
              placeholder="e.g., We need 50 laptops for our Berlin office, budget around 75000 EUR, needed by June 2026..."
              className="w-full px-4 py-3 border border-[#e0e0e0] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-[inherit]"
            />
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={!text.trim()}
                className="px-6 py-2.5 bg-brand-500 text-white text-xs font-bold uppercase tracking-[1px] rounded-lg hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Process Request
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Example Prompts */}
      <div className="border border-[#e0e0e0] rounded-xl overflow-hidden">
        <div className="bg-[#f4f4f4] px-6 py-4 border-b border-[#e0e0e0]">
          <h3 className="text-xs font-bold uppercase tracking-[2px] text-[#666]">Try an example</h3>
        </div>
        <div className="divide-y divide-[#e0e0e0] bg-white">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setText(ex)}
              className="w-full text-left px-6 py-4 text-sm text-[#555] hover:bg-[#f4f4f4] hover:text-[#1a1a1a] transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
