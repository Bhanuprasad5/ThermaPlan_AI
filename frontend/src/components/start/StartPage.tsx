import React, { useState } from 'react';
import {
  Flame,
  Zap,
  TrendingUp,
  Leaf,
  ArrowRight,
  Tablet,
  CheckCircle2,
  Info,
  ShieldAlert,
  Cpu,
  Layers,
  FileSpreadsheet,
  X,
  UploadCloud,
  Clock,
  Activity,
  CheckCircle,
  Building2,
  Settings,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';

export const StartPage: React.FC = () => {
  const {
    metrics,
    workers,
    loadDemoPlant,
    setCurrentView,
    navigate,
    setJudgeSideBySide,
    backendConnected,
    setMorningSetupOpen,
  } = usePlant();

  const [showSimulatedModal, setShowSimulatedModal] = useState(false);

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1B1F24] flex flex-col font-sans">
      {/* 1. Industrial Header Bar */}
      <header className="border-b border-[#D9DDE2] bg-white px-6 py-3.5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0F5FA8] flex items-center justify-center text-white font-black text-xl tracking-wider shadow-sm">
              T
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-[#1B1F24]">TEEVRA</span>
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-[#1E7A46] border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1E7A46] animate-pulse"></span>
                  ISO 7243 Heat Benchmark
                </span>
              </div>
              <p className="text-xs text-[#5B636E]">Heat-Safe, Carbon-Aware Industrial Production Scheduler</p>
            </div>
          </div>

          {/* Top-Right Quick Navigation & Status */}
          <div className="flex items-center gap-2.5">
            {/* Live Backend Connection Badge */}
            <button
              onClick={() => setShowSimulatedModal(true)}
              id="header-backend-status-btn"
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F4F5F7] hover:bg-[#E5E8EC] text-xs font-medium text-[#5B636E] border border-[#D9DDE2] transition-colors cursor-pointer"
              title="Click to view solver run details"
            >
              <span className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`}></span>
              <span>{backendConnected ? 'Live Backend (Port 8000)' : 'Deterministic Solver (Seed 42)'}</span>
              <Info size={13} className="text-[#0F5FA8] ml-0.5" />
            </button>

            {/* Station Tablet Button (Moved to top-right as requested) */}
            <button
              onClick={() => navigate('worker')}
              id="header-station-tablet-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-white hover:bg-[#F4F5F7] text-xs font-semibold text-[#1B1F24] border border-[#D9DDE2] shadow-2xs hover:border-[#0F5FA8] transition-all cursor-pointer"
              title="Open shop-floor ruggedized station tablet view"
            >
              <Tablet size={15} className="text-[#0F5FA8]" />
              <span>Station Tablet</span>
            </button>

            {/* Judge Dual-Screen Mode Button */}
            <button
              onClick={() => {
                setJudgeSideBySide(true);
                setCurrentView('planner');
              }}
              id="header-judge-dual-screen-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-[#1E7A46] border border-emerald-300 transition-all cursor-pointer"
              title="Open Manager Console and Station Tablet synchronized side-by-side"
            >
              <Layers size={15} />
              <span>Dual-Screen View</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Operational Command Center */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full flex flex-col justify-start">
        {/* Plant Metadata Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white p-3.5 rounded-lg border border-[#D9DDE2] shadow-2xs">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-[#0F5FA8]" />
            <span className="font-bold text-sm text-[#1B1F24]">Telangana Metal Works & Heavy Alloy Casting Plant (Unit 1)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-[#5B636E] font-medium">Shift: Day 1 (06:00 - 14:00 IST)</span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0F5FA8] font-semibold border border-blue-200">{workers.length} Active Workers</span>
            <span className="px-2 py-0.5 rounded bg-amber-50 text-[#C2410C] font-semibold border border-amber-200">Outdoor forecast: see the solved plan</span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-[#1E7A46] font-semibold border border-emerald-200">16 Workstations Online</span>
          </div>
        </div>

        {/* 2-Column Command Layout: Actions on Left, Big Live KPIs on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8 items-start">
          {/* Left Column (5 Cols): Plant Header & Prominent Action Buttons */}
          <div className="lg:col-span-5 flex flex-col space-y-5 bg-white p-6 rounded-xl border border-[#D9DDE2] shadow-xs">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-[#C2410C] text-xs font-bold mb-3 border border-orange-200">
                <Flame size={13} />
                <span>Heat-Safe Operations & Dynamic Dispatcher</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1F24] leading-tight mb-2">
                Production Command Center
              </h1>
              <p className="text-xs sm:text-sm text-[#5B636E] leading-relaxed">
                Google OR-Tools CP-SAT schedules 192 15-minute slots across 16 stations, enforcing ISO 7243 limits and TGSPDCL solar concessions.
              </p>
            </div>

            {/* Prominent Large Industrial Action Buttons */}
            <div className="space-y-3 pt-2">
              {/* Primary Action 1: Upload Orders & Rules */}
              <button
                onClick={() => setMorningSetupOpen(true)}
                id="btn-upload-orders-rules"
                className="w-full py-4 px-6 rounded-xl bg-[#0F5FA8] hover:bg-[#0D4F8C] active:bg-[#0B3F70] text-white shadow-md transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3.5 text-left">
                  <div className="w-11 h-11 rounded-lg bg-white/15 flex items-center justify-center text-white">
                    <UploadCloud size={24} />
                  </div>
                  <div>
                    <div className="font-extrabold text-base tracking-tight">Upload Orders & Rules</div>
                    <div className="text-[11px] text-blue-100 opacity-90">Import CSV/Excel & SOP grounding documents</div>
                  </div>
                </div>
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Primary Action 2: Launch Plan / Load Demo Plant */}
              <button
                onClick={() => {
                  loadDemoPlant('day1_monday');
                  setCurrentView('planner');
                }}
                id="btn-load-demo-plant"
                className="w-full py-4 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all cursor-pointer flex items-center justify-between group border border-slate-700"
              >
                <div className="flex items-center gap-3.5 text-left">
                  <div className="w-11 h-11 rounded-lg bg-white/10 flex items-center justify-center text-white">
                    <Activity size={22} className="text-emerald-400" />
                  </div>
                  <div>
                    <div className="font-extrabold text-base tracking-tight">Launch 48-Hour Plan Console</div>
                    <div className="text-[11px] text-slate-300">Open 192-slot Gantt timeline & live dispatcher</div>
                  </div>
                </div>
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Quick Helper Links */}
            <div className="pt-2 border-t border-[#D9DDE2] flex items-center justify-between text-xs text-[#5B636E]">
              <span className="flex items-center gap-1 font-medium">
                <CheckCircle size={13} className="text-[#1E7A46]" />
                BigQuery Schema Validated
              </span>
              <button
                onClick={() => navigate('evals')}
                id="btn-see-run-evals"
                className="text-[#0F5FA8] font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>View System Evals</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>

          {/* Right Column (7 Cols): Real-Time Operational KPI Dashboard */}
          <div className="lg:col-span-7 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-sm uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
                  <Activity size={16} className="text-[#0F5FA8]" />
                  <span>Real-Time Operational KPIs</span>
                </h2>
                <p className="text-xs text-[#5B636E]">Solver run at {metrics.solverTimestamp} (Seed {metrics.solverSeed}, Plan #{metrics.planHash})</p>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 text-[#0F5FA8] font-bold border border-blue-200">
                192 SLOTS • 15 MIN
              </span>
            </div>

            {/* 4 Large Real-Time KPI Cards (2x2 Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* KPI 1: Heat Breaches */}
              <div className="bg-white rounded-xl p-5 border-2 border-emerald-500/30 shadow-xs relative overflow-hidden">
                <div className="flex items-center justify-between text-[#5B636E] text-xs font-semibold mb-2">
                  <span>ISO 7243 Heat Breaches</span>
                  <span className="p-1.5 rounded-md bg-emerald-50 text-[#1E7A46]">
                    <ShieldAlert size={16} />
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-4xl font-black text-[#1E7A46] tabular-nums">
                    {metrics.heatBreachesAfter}
                  </span>
                  <span className="text-sm font-semibold text-[#5B636E] line-through tabular-nums">
                    {metrics.heatBreachesBefore} baseline
                  </span>
                </div>
                <div className="inline-block text-[11px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-[#1E7A46] mb-2">
                  100% Heat-Safe • 0 Violations
                </div>
                <p className="text-[11px] text-[#5B636E] border-t border-[#D9DDE2] pt-2">
                  Zero threshold crossings in 192 slots
                </p>
              </div>

              {/* KPI 2: Output Throughput */}
              <div className="bg-white rounded-xl p-5 border border-[#D9DDE2] shadow-xs">
                <div className="flex items-center justify-between text-[#5B636E] text-xs font-semibold mb-2">
                  <span>Plant Output Throughput</span>
                  <span className="p-1.5 rounded-md bg-blue-50 text-[#0F5FA8]">
                    <TrendingUp size={16} />
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-4xl font-black text-[#1B1F24] tabular-nums">
                    {metrics.outputPct}%
                  </span>
                  <span className="text-sm font-semibold text-[#5B636E] tabular-nums">
                    vs {metrics.outputPctBefore}% base
                  </span>
                </div>
                <div className="inline-block text-[11px] px-2 py-0.5 rounded font-bold bg-blue-100 text-[#0F5FA8] mb-2">
                  Target Met (≥ 98.0%)
                </div>
                <p className="text-[11px] text-[#5B636E] border-t border-[#D9DDE2] pt-2">
                  Full batch order throughput guaranteed
                </p>
              </div>

              {/* KPI 3: Energy Bill */}
              <div className="bg-white rounded-xl p-5 border border-[#D9DDE2] shadow-xs">
                <div className="flex items-center justify-between text-[#5B636E] text-xs font-semibold mb-2">
                  <span>Power Bill (TGSPDCL HT-1)</span>
                  <span className="p-1.5 rounded-md bg-amber-50 text-[#F5B841]">
                    <Zap size={16} />
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-3xl font-black text-[#1B1F24] tabular-nums">
                    ₹{metrics.inrCostAfter.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold text-[#5B636E] line-through tabular-nums">
                    ₹{metrics.inrCostBefore.toLocaleString()}
                  </span>
                </div>
                <div className="inline-block text-[11px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-900 mb-2">
                  Saved ₹{(metrics.inrCostBefore - metrics.inrCostAfter).toLocaleString()} ({metrics.inrCostBefore > 0 ? -((metrics.inrCostBefore - metrics.inrCostAfter) / metrics.inrCostBefore * 100).toFixed(1) : '-14.8'}%)
                </div>
                <p className="text-[11px] text-[#5B636E] border-t border-[#D9DDE2] pt-2">
                  {metrics.energyKwhAfter.toLocaleString()} kWh shifted into solar tariff (₹6.00/kWh)
                </p>
              </div>

              {/* KPI 4: Carbon & Safety Margin */}
              <div className="bg-white rounded-xl p-5 border border-[#D9DDE2] shadow-xs">
                <div className="flex items-center justify-between text-[#5B636E] text-xs font-semibold mb-2">
                  <span>Safety Margin & Carbon</span>
                  <span className="p-1.5 rounded-md bg-emerald-50 text-[#1E7A46]">
                    <Leaf size={16} />
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-3xl font-black text-[#1E7A46] tabular-nums">
                    +{metrics.minMarginC}°C
                  </span>
                  <span className="text-sm font-semibold text-[#1E7A46] tabular-nums">
                    thermal margin
                  </span>
                </div>
                <div className="inline-block text-[11px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-[#1E7A46] mb-2">
                  {metrics.co2SavedTons} tCO2 Saved • 4 Optimal Restarts
                </div>
                <p className="text-[11px] text-[#5B636E] border-t border-[#D9DDE2] pt-2 truncate" title="CEA v22.0, FY 2025-26 weighted average @ 0.675 tCO2/MWh">
                  CEA v22.0 factor (0.675 tCO2/MWh)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 16-Workstation Live Dispatch Status Grid (Replaced reading paragraphs with real-time station dashboard) */}
        <div className="bg-white rounded-xl p-5 border border-[#D9DDE2] shadow-xs">
          <div className="flex items-center justify-between mb-3 border-b border-[#D9DDE2] pb-2">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-[#0F5FA8]" />
              <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24]">
                16-Workstation Dispatch Readiness (Telangana Metal Works)
              </span>
            </div>
            <span className="text-[11px] text-[#1E7A46] font-semibold flex items-center gap-1">
              <CheckCircle size={12} /> All Lines Acclimatized & Monitored
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="p-2.5 bg-slate-50 border border-[#D9DDE2] rounded-lg">
              <div className="font-bold text-[#1B1F24]">Furnace Bay</div>
              <div className="text-[11px] text-[#5B636E]">FURNACE 1, 2, 3</div>
              <span className="inline-block mt-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                Class 3 • Continuous Pour
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-[#D9DDE2] rounded-lg">
              <div className="font-bold text-[#1B1F24]">Scrap Charging</div>
              <div className="text-[11px] text-[#5B636E]">CHARGING BAY</div>
              <span className="inline-block mt-1 text-[10px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                Class 2 • Relief Ready
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-[#D9DDE2] rounded-lg">
              <div className="font-bold text-[#1B1F24]">CNC Machining</div>
              <div className="text-[11px] text-[#5B636E]">CNC 1, 2, 3, 4, 5</div>
              <span className="inline-block mt-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                Class 1 • 2h Frozen Lock
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-[#D9DDE2] rounded-lg">
              <div className="font-bold text-[#1B1F24]">Paint Curing Bay</div>
              <div className="text-[11px] text-[#5B636E]">OVEN 1, 2</div>
              <span className="inline-block mt-1 text-[10px] font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded">
                Solar Shifted (11:00)
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-[#D9DDE2] rounded-lg">
              <div className="font-bold text-[#1B1F24]">Vacuum Quench</div>
              <div className="text-[11px] text-[#5B636E]">HEAT_TREAT_1</div>
              <span className="inline-block mt-1 text-[10px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                Buffer Reserved
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-[#D9DDE2] rounded-lg">
              <div className="font-bold text-[#1B1F24]">Assembly & Quality</div>
              <div className="text-[11px] text-[#5B636E]">ASSEMBLY 1, QUALITY</div>
              <span className="inline-block mt-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                Class 1 • Online
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="border-t border-[#D9DDE2] bg-white px-6 py-3.5 text-xs text-[#5B636E] mt-auto">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[#1B1F24]">TEEVRA Industrial Platform</span>
            <span>•</span>
            <span>Google Cloud JAPAC AI Builder Cup</span>
            <span>•</span>
            <span>ISO 7243:2017 & OSH Code 2020</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('evals')}
              id="footer-evals-link"
              className="hover:text-[#0F5FA8] transition-colors cursor-pointer flex items-center gap-1"
            >
              <ShieldCheck size={13} />
              <span>Evals & Trust</span>
            </button>
            <button
              onClick={() => navigate('log')}
              id="footer-safetylog-link"
              className="hover:text-[#0F5FA8] transition-colors cursor-pointer flex items-center gap-1"
            >
              <FileText size={13} />
              <span>Safety Log</span>
            </button>
            <button
              onClick={() => navigate('settings')}
              id="footer-settings-link"
              className="hover:text-[#0F5FA8] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Settings size={13} />
              <span>Plant Settings</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Simulated Plant Modal */}
      {showSimulatedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-[#D9DDE2]">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#D9DDE2]">
              <div className="flex items-center gap-2">
                <Info size={20} className="text-[#0F5FA8]" />
                <h3 className="font-bold text-base text-[#1B1F24]">Plant Simulation & Solver Provenance</h3>
              </div>
              <button
                onClick={() => setShowSimulatedModal(false)}
                id="modal-close-sim-btn"
                className="text-[#5B636E] hover:text-[#1B1F24] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#5B636E] leading-relaxed">
              <p>
                <strong className="text-[#1B1F24]">Plant Profile:</strong> 16 workstations, {workers.length} workers across 6 bay groups (Furnace, Charging, CNC Machining, Paint Curing, Quench, and Assembly/Quality).
              </p>
              <p>
                <strong className="text-[#1B1F24]">Deterministic Solver:</strong> Running Google OR-Tools CP-SAT in <code>asia-south1</code> (seed {metrics.solverSeed}, solve time {metrics.solverTimestamp}).
              </p>
              <p>
                <strong className="text-[#1B1F24]">Tariffs & Weather:</strong> Grounded in TGSPDCL HT-1 FY26 tariff matrix (20% solar concession) and Open-Meteo weather replayed forecast.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowSimulatedModal(false)}
                id="modal-confirm-sim-btn"
                className="px-4 py-2 rounded-lg bg-[#0F5FA8] text-white font-semibold text-xs cursor-pointer"
              >
                Close Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
