import React from 'react';
import {
  Layers,
  X,
  Play,
  RotateCcw,
  Tablet,
  LayoutDashboard,
  ShieldAlert,
  Flame,
  Volume2,
  Wrench,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { PlannerConsole } from '../planner/PlannerConsole';
import { WorkerApp } from '../worker/WorkerApp';

export const SideBySideJudgeView: React.FC = () => {
  const {
    setJudgeSideBySide,
    loadDemoPlant,
    triggerHeatRise,
    triggerSos,
    triggerDizzy,
    triggerVoiceReport,
    triggerBreakdown,
  } = usePlant();

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1B1F24] text-white overflow-hidden font-sans">
      {/* Judge Mode Demo Control Header */}
      <div className="bg-[#121417] border-b border-slate-700 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#0F5FA8] px-2.5 py-1 rounded text-white font-bold text-xs">
            <Layers size={14} />
            <span>Judge Dual-Screen Mode</span>
          </div>
          <span className="text-slate-400 hidden sm:inline">
            Planner Console (Left) synchronized with Shared Station Tablet (Right)
          </span>
        </div>

        {/* 4 Core Scenario Action Triggers */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400 font-semibold mr-1">Demo Scripts:</span>

          <button
            onClick={triggerHeatRise}
            className="px-2.5 py-1 rounded bg-amber-900/60 hover:bg-amber-800 text-amber-200 border border-amber-700/50 text-[11px] font-semibold inline-flex items-center gap-1"
          >
            <Flame size={12} />
            <span>1. Heat Rise (Feature 6)</span>
          </button>

          <button
            onClick={() => triggerSos()}
            className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-700/50 text-[11px] font-semibold inline-flex items-center gap-1"
          >
            <ShieldAlert size={12} />
            <span>2. Suresh SOS (No AI)</span>
          </button>

          <button
            onClick={() =>
              triggerVoiceReport(
                'పెయింట్ లైన్ వద్ద చాలా వేడిగా ఉంది, 10 నిమిషాలు రెస్ట్ కావాలి',
                'Paint line is too hot, need a 10 minute rest'
              )
            }
            className="px-2.5 py-1 rounded bg-blue-900/60 hover:bg-blue-800 text-blue-200 border border-blue-700/50 text-[11px] font-semibold inline-flex items-center gap-1"
          >
            <Volume2 size={12} />
            <span>3. Telugu Voice (Gemini)</span>
          </button>

          <button
            onClick={() => triggerDizzy('st_paint', 'w_anitha')}
            className="px-2.5 py-1 rounded bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/50 text-[11px] font-semibold inline-flex items-center gap-1"
          >
            <ShieldAlert size={12} />
            <span>4. Dizzy Auto-Removal</span>
          </button>

          <button
            onClick={() => loadDemoPlant()}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Reset to pristine morning state"
          >
            <RotateCcw size={14} />
          </button>

          <button
            onClick={() => setJudgeSideBySide(false)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 ml-1 inline-flex items-center gap-1"
          >
            <X size={13} />
            <span>Exit Dual-View</span>
          </button>
        </div>
      </div>

      {/* Dual Pane Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Pane: Planner Console (65%) */}
        <div className="flex-1 lg:w-[65%] h-full border-r-2 border-slate-700 flex flex-col overflow-hidden bg-[#F4F5F7]">
          <PlannerConsole />
        </div>

        {/* Right Pane: Worker Station Tablet View (35%) */}
        <div className="lg:w-[35%] h-full flex flex-col overflow-hidden bg-slate-900 border-l border-slate-800">
          <div className="bg-slate-800 px-3 py-1 text-[11px] text-slate-300 flex items-center justify-between border-b border-slate-700">
            <span className="font-semibold flex items-center gap-1.5">
              <Tablet size={13} className="text-[#0F5FA8]" />
              <span>Station Tablet: Paint Line (Mounted)</span>
            </span>
            <span className="text-[10px] text-emerald-400">Live Socket Active</span>
          </div>

          <div className="flex-1 overflow-auto">
            <WorkerApp />
          </div>
        </div>
      </div>
    </div>
  );
};
