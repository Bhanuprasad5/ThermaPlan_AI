import React from 'react';
import {
  X,
  FileCode,
  Volume2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Clock,
  Layers,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { TraceEvent } from '../../types';

export const TraceDrawer: React.FC = () => {
  const { traceDrawerOpen, setTraceDrawerOpen, traces } = usePlant();

  if (!traceDrawerOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Audit trace drawer"
      className="fixed inset-x-0 bottom-0 top-1/4 z-50 bg-white border-t-2 border-[#0F5FA8] shadow-2xl flex flex-col font-sans animate-in slide-in-from-bottom duration-200"
    >
      {/* Drawer Header */}
      <div className="bg-[#F4F5F7] px-6 py-3 border-b border-[#D9DDE2] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCode size={18} className="text-[#0F5FA8]" />
          <div>
            <h3 className="font-bold text-sm text-[#1B1F24] flex items-center gap-2">
              <span>Full Audit Trace (5 Columns)</span>
              <span className="text-xs bg-blue-100 text-[#0F5FA8] px-2 py-0.5 rounded font-mono">
                Press [T] to Close
              </span>
            </h3>
            <p className="text-[11px] text-[#5B636E]">
              Every model inference, deterministic critic gate, supervisor approval, and CP-SAT solver hash
            </p>
          </div>
        </div>

        <button
          onClick={() => setTraceDrawerOpen(false)}
          className="p-1.5 hover:bg-slate-200 rounded-md text-[#5B636E] transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Drawer Content: 5-Column Grid */}
      <div className="flex-1 overflow-y-auto p-6 divide-y divide-[#D9DDE2]">
        {traces.map((trace) => {
          const isNoModel = !trace.geminiCallJson || trace.eventName.toLowerCase().includes('emergency') || trace.tokens.total === 0;

          return (
            <div key={trace.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-sm text-[#1B1F24]">{trace.eventName}</span>
                <span className="font-mono text-[#5B636E]">{trace.timestamp}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                {/* Column 1: Clip & Voice Transcript */}
                <div className="bg-[#F4F5F7] p-3 rounded-lg border border-[#D9DDE2] flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-[10px] text-[#5B636E] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Volume2 size={12} className="text-[#0F5FA8]" />
                      <span>1. Audio / Telugu Clip</span>
                    </div>

                    {isNoModel ? (
                      <div className="text-xs text-[#5B636E] italic py-3">
                        No audio (Direct sensor or UI button trigger)
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="font-telugu text-sm text-[#1B1F24] font-medium bg-white p-2 rounded border border-[#D9DDE2]">
                          &ldquo;{trace.clipTranscriptTe}&rdquo;
                        </div>
                        <div className="text-[11px] text-[#5B636E] italic">
                          &ldquo;{trace.clipTranscriptEn}&rdquo;
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-[#5B636E] mt-2">Channel: Station Tablet Mic</span>
                </div>

                {/* Column 2: Gemini Call & Usage */}
                <div className="bg-[#F4F5F7] p-3 rounded-lg border border-[#D9DDE2] flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-[10px] text-[#5B636E] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Sparkles size={12} className="text-[#0F5FA8]" />
                      <span>2. Gemini Call & JSON</span>
                    </div>

                    {isNoModel ? (
                      <div className="text-xs text-[#1E7A46] font-bold py-3 bg-emerald-50 p-2 rounded border border-emerald-200">
                        Zero Model Call (100% Deterministic Code Path)
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-[#0F5FA8] font-bold">{trace.modelVersion}</span>
                          <span className="text-[#5B636E]">{trace.region}</span>
                        </div>
                        <pre className="text-[10px] font-mono bg-white p-2 rounded border border-[#D9DDE2] overflow-x-auto text-[#1B1F24] max-h-24">
                          {JSON.stringify(trace.geminiCallJson, null, 2)}
                        </pre>
                        <div className="flex justify-between text-[10px] text-[#5B636E] pt-1">
                          <span>Tokens: {trace.tokens.total} ({trace.tokens.input}in/{trace.tokens.output}out)</span>
                          <span className="font-semibold text-[#1B1F24]">{trace.latencyMs}ms</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 3: Critic Validation */}
                <div className="bg-[#F4F5F7] p-3 rounded-lg border border-[#D9DDE2] flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-[10px] text-[#5B636E] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <ShieldCheck size={12} className="text-[#1E7A46]" />
                      <span>3. Critic Gate</span>
                    </div>

                    <div className="space-y-1.5">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-[#1E7A46]">
                        {trace.criticResult.passed ? 'PASSED (Deterministic)' : 'REJECTED'}
                      </span>
                      <p className="text-[11px] text-[#1B1F24] leading-relaxed">
                        {trace.criticResult.rule}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#5B636E] mt-2">ISO 7243 Validation Engine</span>
                </div>

                {/* Column 4: Human Approval */}
                <div className="bg-[#F4F5F7] p-3 rounded-lg border border-[#D9DDE2] flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-[10px] text-[#5B636E] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-[#0F5FA8]" />
                      <span>4. Human Approval</span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="font-semibold text-xs text-[#1B1F24]">
                        {trace.approvalStatus}
                      </div>
                      <p className="text-[11px] text-[#5B636E]">
                        Role: Shift Supervisor / Planner Console
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#5B636E] mt-2">Human-in-the-Loop Enforced</span>
                </div>

                {/* Column 5: Re-Plan Solver Execution */}
                <div className="bg-[#F4F5F7] p-3 rounded-lg border border-[#D9DDE2] flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-[10px] text-[#5B636E] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Cpu size={12} className="text-[#0F5FA8]" />
                      <span>5. CP-SAT Solver Re-Plan</span>
                    </div>

                    <div className="space-y-1 font-mono text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-[#5B636E]">Status:</span>
                        <span className="font-bold text-[#1E7A46]">{trace.rePlanSolver.status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5B636E]">Solve Time:</span>
                        <span className="font-bold text-[#1B1F24]">{trace.rePlanSolver.solveTimeSec}s</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5B636E]">Seed:</span>
                        <span className="text-[#1B1F24]">{trace.rePlanSolver.seed}</span>
                      </div>
                      <div className="pt-1 border-t border-[#D9DDE2] text-[10px]">
                        <span className="text-[#5B636E]">Hash: </span>
                        <span className="text-slate-500 line-through">{trace.rePlanSolver.planHashBefore}</span>
                        <span className="text-[#0F5FA8] font-bold"> → {trace.rePlanSolver.planHashAfter}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
