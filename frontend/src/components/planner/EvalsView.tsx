import React, { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { getEvalsSummary } from '../../services/managerApi';
import { EvalsSummary } from '../../types/backend';

const CHECKS = [
  ['Heat rule, checked again', 'A second pass reads every scheduled slot and confirms the crew limit was not crossed. It does not trust the solver’s own count.'],
  ['Same input, same plan', 'The identical order book is solved twice. The plan hash must match. Seed is fixed at 42.'],
  ['Energy adds up', 'Each job’s kWh is summed from its slots and compared with the job’s stated kWh.'],
  ['Bill recomputed', 'The rupee total is rebuilt from slot × rate, separately from the solver objective.'],
  ['A day held out', 'Four days train the check; the fifth day is scored only after the plan is produced.'],
  ['A second method', 'A simpler earliest-start plan is solved independently and used as the baseline the savings are measured against.'],
];

function money(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export const EvalsView: React.FC = () => {
  const { goBack } = usePlant();
  const [summary, setSummary] = useState<EvalsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getEvalsSummary()
      .then((s) => live && setSummary(s))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load run history'));
    return () => { live = false; };
  }, []);

  const rows: Array<[string, string, (s: EvalsSummary) => string, (s: EvalsSummary) => string]> = [
    ['Power bill', 'Lower is better', (s) => money(s.baseline.cost_inr), (s) => money(s.optimized.cost_inr)],
    ['Energy', 'Same means the saving is timing', (s) => `${s.baseline.kwh.toLocaleString()} kWh`, (s) => `${s.optimized.kwh.toLocaleString()} kWh`],
    ['Unsafe-heat slots', 'Work placed above the crew limit', (s) => s.baseline.heat_breach_slots.toFixed(1), (s) => s.optimized.heat_breach_slots.toFixed(1)],
    ['Restarts', 'Extra machine starts', (s) => s.baseline.restarts.toFixed(1), (s) => s.optimized.restarts.toFixed(1)],
    ['Output', 'Jobs placed by their due time', (s) => `${s.baseline.output_pct}%`, (s) => `${s.optimized.output_pct}%`],
  ];

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1B1F24] font-sans">
      <header className="bg-white border-b border-[#D9DDE2] px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-1.5 hover:bg-slate-100 rounded text-[#5B636E]" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-bold text-lg flex items-center gap-2">
              <ShieldCheck size={20} className="text-[#0F5FA8]" /> Evals
            </h1>
            <p className="text-xs text-[#5B636E]">What the runs saved, and how a plan is checked.</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <section className="bg-white rounded-xl border border-[#D9DDE2] p-6 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-bold">1. Baseline vs our plan</h2>
            <span className="text-xs text-[#5B636E]">
              {summary ? `Average of ${summary.runs} run${summary.runs === 1 ? '' : 's'}` : error ? 'Unavailable' : 'Loading…'}
            </span>
          </div>
          <p className="text-xs text-[#5B636E]">
            The baseline starts every job as early as it can, with no heat rule. Our plan keeps crews inside the heat limit and moves work into cheaper power. Both are solved on the same orders.
          </p>

          {summary && summary.runs > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                  <div className="text-xs text-[#1E7A46] font-semibold">Average saving per run</div>
                  <div className="text-3xl font-black tabular-nums">{money(summary.avg_saving_inr)}</div>
                  <div className="text-xs text-[#5B636E]">{summary.avg_saving_pct}% of the baseline bill</div>
                </div>
                <div className="rounded-lg bg-[#F4F5F7] border border-[#D9DDE2] p-4">
                  <div className="text-xs text-[#5B636E] font-semibold">Saved across these runs</div>
                  <div className="text-3xl font-black tabular-nums">{money(summary.total_saving_inr)}</div>
                  <div className="text-xs text-[#5B636E]">{summary.runs} morning plans</div>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#5B636E] border-b border-[#D9DDE2]">
                    <th className="py-2 font-semibold">Measure</th>
                    <th className="py-2 font-semibold">Baseline</th>
                    <th className="py-2 font-semibold">Our plan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([name, hint, base, opt]) => (
                    <tr key={name} className="border-b border-[#D9DDE2]/70">
                      <td className="py-2">
                        <div className="font-semibold">{name}</div>
                        <div className="text-[11px] text-[#5B636E]">{hint}</div>
                      </td>
                      <td className="py-2 tabular-nums">{base(summary)}</td>
                      <td className="py-2 tabular-nums font-bold">{opt(summary)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {summary.datasets.length > 0 && (
                <div className="text-xs text-[#5B636E] space-y-1">
                  {summary.datasets.map((d) => (
                    <div key={d.dataset} className="flex justify-between gap-3 border-t border-[#D9DDE2]/60 pt-1">
                      <span>{d.dataset} · {d.runs} run{d.runs === 1 ? '' : 's'}{d.same_plan_every_run ? ' · same plan each time' : ''}</span>
                      <span className="tabular-nums">{money(d.baseline_cost_inr)} → {money(d.optimized_cost_inr)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[#5B636E]">{error || 'No runs yet. Solve a day from the planner and come back.'}</p>
          )}
        </section>

        <section className="bg-white rounded-xl border border-[#D9DDE2] p-6 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-bold">2. How a plan gets checked</h2>
            <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded">Mockup</span>
          </div>
          <p className="text-xs text-[#5B636E]">
            These checks are the design for confirming a plan after it leaves the solver. They are drawn here so the idea is clear. They are not running on this page.
          </p>
          <ol className="space-y-2">
            {CHECKS.map(([title, body], i) => (
              <li key={title} className="flex gap-3 text-sm">
                <span className="w-6 h-6 shrink-0 rounded-full bg-[#F4F5F7] border border-[#D9DDE2] text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span>
                  <span className="font-semibold">{title}. </span>
                  <span className="text-[#5B636E]">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
};
