import React, { useEffect } from 'react';
import { TrendingUp, Zap, IndianRupee, ShieldCheck, RotateCcw, Leaf, FileCode, FileText, Sliders } from 'lucide-react';
import { usePlant } from '../../context/PlantContext';

function Chip({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#F4F5F7] border border-[#D9DDE2]">{children}</div>;
}

export const ImpactStrip: React.FC = () => {
  const { activePlan, setCurrentView, traceDrawerOpen, setTraceDrawerOpen } = usePlant();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 't' || e.key === 'T') && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        setTraceDrawerOpen(!traceDrawerOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [traceDrawerOpen, setTraceDrawerOpen]);

  const k = activePlan?.kpi;
  const b = activePlan?.baseline_kpi;
  const saved = b && k ? Math.round(b.total_cost_inr - k.total_cost_inr) : 0;
  const energyDelta = b && k ? Math.round(k.total_kwh - b.total_kwh) : 0;

  return (
    <footer className="bg-white border-t border-[#D9DDE2] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs z-20">
      {k && b ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Chip>
            <IndianRupee size={13} className="text-[#1E7A46]" />
            <span className="font-bold tabular-nums">₹{Math.round(k.total_cost_inr).toLocaleString()}</span>
            <span className="text-[10px] text-[#1E7A46] font-semibold">saves ₹{saved.toLocaleString()}</span>
          </Chip>
          <Chip>
            <ShieldCheck size={13} className="text-[#1E7A46]" />
            <span className="text-[#5B636E]">Unsafe heat</span>
            <span className="font-bold tabular-nums">{b.heat_breaches_count} → {k.heat_breaches_count} slots</span>
          </Chip>
          <Chip>
            <TrendingUp size={13} className="text-[#0F5FA8]" />
            <span className="font-bold tabular-nums">{k.output_percentage}%</span>
            <span className="text-[#5B636E]">output</span>
          </Chip>
          <Chip>
            <Zap size={13} className="text-[#F5B841]" />
            <span className="font-bold tabular-nums">{Math.round(k.total_kwh).toLocaleString()} kWh</span>
            <span className="text-[10px] text-[#5B636E]">{energyDelta === 0 ? 'same energy' : `${energyDelta > 0 ? '+' : ''}${energyDelta} kWh`}</span>
          </Chip>
          <Chip>
            <RotateCcw size={13} className="text-[#5B636E]" />
            <span className="text-[#5B636E]">Restarts</span>
            <span className="font-bold tabular-nums">{k.total_restarts}</span>
          </Chip>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 border border-emerald-200" title={k.honest_co2_banner}>
            <Leaf size={13} className="text-[#1E7A46]" />
            <span className="text-[#1E7A46] font-semibold">{k.co2_saved_tco2} tCO2</span>
            <span className="text-[10px] text-[#5B636E]">CEA v22</span>
          </div>
        </div>
      ) : (
        <span className="text-[#5B636E]">Run pending. Numbers appear after the first solve.</span>
      )}

      <div className="flex items-center gap-3">
        {activePlan && (
          <span className="hidden xl:inline font-mono text-[11px] text-[#5B636E]">
            {activePlan.dataset_label} · seed {activePlan.solver_seed ?? 42} · {activePlan.plan_id} · {activePlan.solve_time_sec}s
          </span>
        )}
        <button onClick={() => setTraceDrawerOpen(!traceDrawerOpen)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 font-semibold border border-[#D9DDE2]">
          <FileCode size={13} className="text-[#0F5FA8]" /> Trace [T]
        </button>
        <button onClick={() => setCurrentView('log')} className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[#F4F5F7] text-[#5B636E]">
          <FileText size={13} /> Log
        </button>
        <button onClick={() => setCurrentView('evals')} className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[#F4F5F7] text-[#5B636E]">
          <Sliders size={13} /> Evals
        </button>
      </div>
    </footer>
  );
};
