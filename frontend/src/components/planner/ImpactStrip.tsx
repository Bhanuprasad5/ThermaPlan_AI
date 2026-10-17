import React, { useEffect } from 'react';
import {
  TrendingUp,
  Zap,
  IndianRupee,
  ShieldCheck,
  RotateCcw,
  Layers,
  Leaf,
  FileCode,
  FileText,
  Sliders,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';

export const ImpactStrip: React.FC = () => {
  const {
    metrics,
    setCurrentView,
    traceDrawerOpen,
    setTraceDrawerOpen,
  } = usePlant();

  // Keyboard shortcut 'T' toggles trace drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') {
        // avoid triggering when typing in input
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
        setTraceDrawerOpen(!traceDrawerOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [traceDrawerOpen, setTraceDrawerOpen]);

  return (
    <footer className="bg-white border-t border-[#D9DDE2] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs z-20">
      {/* Metric Chips with Before vs After */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Output */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#F4F5F7] border border-[#D9DDE2]">
          <TrendingUp size={13} className="text-[#0F5FA8]" />
          <span className="font-bold text-[#1B1F24] tabular-nums">{metrics.outputPct}%</span>
          <span className="text-[10px] text-[#1E7A46] font-semibold">(+{(metrics.outputPct - metrics.outputPctBefore).toFixed(1)}%)</span>
        </div>

        {/* Energy kWh */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#F4F5F7] border border-[#D9DDE2]">
          <Zap size={13} className="text-[#F5B841]" />
          <span className="text-[#5B636E]">Energy:</span>
          <span className="font-bold text-[#1B1F24] tabular-nums">{metrics.energyKwhAfter.toLocaleString()}</span>
          <span className="text-[10px] text-[#1E7A46] font-semibold">(-{metrics.energyKwhBefore - metrics.energyKwhAfter} kWh)</span>
        </div>

        {/* Cost Rupees */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#F4F5F7] border border-[#D9DDE2]">
          <IndianRupee size={13} className="text-[#1E7A46]" />
          <span className="text-[#5B636E]">Cost:</span>
          <span className="font-bold text-[#1B1F24] tabular-nums">₹{metrics.inrCostAfter.toLocaleString()}</span>
          <span className="text-[10px] text-[#1E7A46] font-semibold">(-₹{(metrics.inrCostBefore - metrics.inrCostAfter).toLocaleString()})</span>
        </div>

        {/* Min Heat Margin */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#F4F5F7] border border-[#D9DDE2]">
          <ShieldCheck size={13} className="text-[#1E7A46]" />
          <span className="text-[#5B636E]">Min Heat Margin:</span>
          <span className="font-bold text-[#1E7A46] tabular-nums">+{metrics.minMarginC}°C</span>
        </div>

        {/* Restarts */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#F4F5F7] border border-[#D9DDE2]">
          <RotateCcw size={13} className="text-[#5B636E]" />
          <span className="text-[#5B636E]">Restarts:</span>
          <span className="font-bold text-[#1B1F24] tabular-nums">{metrics.restartsCount}</span>
        </div>

        {/* Buffer Cost */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50/70 border border-amber-200">
          <Layers size={13} className="text-[#7A4100]" />
          <span className="text-[#7A4100]">Buffer Cost:</span>
          <span className="font-bold text-[#7A4100] tabular-nums">{metrics.bufferCostPct}% output</span>
        </div>

        {/* Carbon Reduction */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 cursor-help"
          title="CEA v22.0, FY 2025-26 weighted average @ 0.675 tCO2/MWh. CO2 is claimed only because total kWh fell by 390 kWh."
        >
          <Leaf size={13} className="text-[#1E7A46]" />
          <span className="text-[#1E7A46] font-bold tabular-nums">{metrics.co2SavedTons} tCO2</span>
          <span className="text-[10px] text-[#5B636E]">(CEA v22.0)</span>
        </div>
      </div>

      {/* Solver Provenance & Navigation Links */}
      <div className="flex items-center gap-3">
        <div className="hidden xl:flex items-center gap-2 text-[11px] text-[#5B636E] font-mono">
          <span>Run {metrics.solverTimestamp}</span>
          <span>•</span>
          <span>Seed {metrics.solverSeed}</span>
          <span>•</span>
          <span>Hash <strong className="text-[#0F5FA8]">{metrics.planHash}</strong></span>
        </div>

        <button
          onClick={() => setTraceDrawerOpen(!traceDrawerOpen)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[#1B1F24] font-semibold text-xs border border-[#D9DDE2] transition-colors"
        >
          <FileCode size={13} className="text-[#0F5FA8]" />
          <span>Trace [T]</span>
        </button>

        <button
          onClick={() => setCurrentView('log')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[#F4F5F7] text-[#5B636E] hover:text-[#1B1F24] text-xs transition-colors"
        >
          <FileText size={13} />
          <span>Safety Log</span>
        </button>

        <button
          onClick={() => setCurrentView('evals')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[#F4F5F7] text-[#5B636E] hover:text-[#1B1F24] text-xs transition-colors"
        >
          <Sliders size={13} />
          <span>Evals & Trust</span>
        </button>
      </div>
    </footer>
  );
};
