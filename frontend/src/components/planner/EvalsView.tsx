import React from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { usePlant } from '../../context/PlantContext';

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

function hours(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function kwh(n: number) {
  return n.toLocaleString('en-IN');
}

export const EvalsView: React.FC = () => {
  const { goBack, activePlan } = usePlant();

  const crew = activePlan?.crew_summary;
  const peopleLine = crew
    ? `${crew.workers_assigned} of ${crew.workers_on_roster} workers assigned, about ${hours(crew.avg_hours)} h each.`
    : 'People hours appear after the next solve.';
  const machinesLine = crew
    ? `${crew.machines_used} of ${crew.machines_total} machines scheduled, ${hours(crew.machine_hours)} machine-hours.`
    : 'Machine hours appear after the next solve.';

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
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold flex items-center gap-2">
              1. Baseline vs our plan
              <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#E8F2FC] text-[#0F5FA8] border border-[#0F5FA8]/30">
                Mockup
              </span>
            </h2>
            <span className="text-xs text-[#5B636E]">Illustrative day</span>
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
              <tr className="border-b border-[#D9DDE2]/70">
                <td className="py-2 font-semibold">Power bill</td>
                <td className="py-2 tabular-nums">{money(1029000)}</td>
                <td className="py-2 tabular-nums font-bold">{money(987000)}</td>
              </tr>
              <tr className="border-b border-[#D9DDE2]/70">
                <td className="py-2 font-semibold">Plant output</td>
                <td className="py-2 tabular-nums">100%</td>
                <td className="py-2 tabular-nums font-bold">100%</td>
              </tr>
              <tr className="border-b border-[#D9DDE2]/70">
                <td className="py-2 font-semibold">Heat</td>
                <td className="py-2">100 workers over the crew limit</td>
                <td className="py-2 tabular-nums font-bold">0</td>
              </tr>
            </tbody>
          </table>

          <p className="text-sm">
            Saved {money(42000)} and {kwh(4800)} kWh (baseline {kwh(139000)} kWh, our plan {kwh(134200)} kWh), avoiding 3.24 t CO2 at 0.675 tCO2 per MWh, with 43 of 43 jobs placed on time and all 100 workers inside the limit.
          </p>

          <div className="text-sm space-y-1 border-t border-[#D9DDE2] pt-3">
            <p>
              <span className="font-semibold">People. </span>
              <span className={crew ? '' : 'text-[#5B636E]'}>{peopleLine}</span>
            </p>
            <p>
              <span className="font-semibold">Machines. </span>
              <span className={crew ? '' : 'text-[#5B636E]'}>{machinesLine}</span>
            </p>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-[#D9DDE2] p-6 space-y-4">
          <h2 className="font-bold">2. How a plan gets checked</h2>
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
