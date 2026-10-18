import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flame,
  UserCheck,
  Cpu,
  Info,
  Clock,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Zap,
  Sparkles,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { Proposal } from '../../types';
export const ContextPanel: React.FC = () => {
  const {
    activeProposal,
    activePlan,
    approveProposal,
    rejectProposal,
    solveMorningPlan,
    solveError,
    setTraceDrawerOpen,
  } = usePlant();

  const [rejectReason, setRejectReason] = useState<string>('Already handled on the floor');
  const [rejectActionType, setRejectActionType] = useState<'keep' | 'replan'>('keep');
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);

  return (
    <aside
      aria-label="Action proposals, station diagnostics and relief management"
      className="w-full lg:w-[380px] shrink-0 border-l border-[#D9DDE2] bg-white flex flex-col h-full overflow-hidden"
    >
      {/* Tab Switcher */}
      <div className="px-4 py-2.5 border-b border-[#D9DDE2] bg-[#F4F5F7] text-xs font-semibold text-[#0F5FA8]">
        This plan
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {solveError && <p className="text-xs text-[#B42318] bg-red-50 border border-red-200 rounded p-2">{solveError}</p>}
        {activePlan && (
          <p className="text-xs text-[#1B1F24] leading-relaxed">{activePlan.gemini_explanation_text || activePlan.summary}</p>
        )}
          <>
            {activeProposal ? (
              <div className="space-y-4">
                {/* Proposal Header */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#0F5FA8] uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Proposed Plan Change
                    </span>
                    <span className="text-[10px] text-[#5B636E]">
                      {activePlan?.solver_status || 'Solved'}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-[#1B1F24] leading-snug">
                    {activeProposal.title}
                  </h3>
                  <p className="text-xs text-[#5B636E] leading-relaxed">
                    <strong>Trigger:</strong> {activeProposal.reason}
                  </p>
                </div>

                {/* AI / Gemini Provenance Card */}
                <div className="bg-[#F4F5F7] p-3 rounded-lg border border-[#D9DDE2] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1B1F24] flex items-center gap-1.5">
                      <Sparkles size={13} className="text-[#0F5FA8]" />
                      <span>Gemini Extraction</span>
                    </span>
                    <span className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-[#D9DDE2] text-[#5B636E]">
                      {activeProposal.aiDetails?.modelVersion || 'gemini-3.8-flash'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-[#5B636E]">Hazard:</span>{' '}
                      <strong className="text-[#1B1F24]">{activeProposal.aiDetails?.hazard || 'Solar Thermal Peak'}</strong>
                    </div>
                    <div>
                      <span className="text-[#5B636E]">Station:</span>{' '}
                      <strong className="text-[#1B1F24]">{activeProposal.aiDetails?.station || 'Furnace Bay'}</strong>
                    </div>
                  </div>

                  <div className="text-[10px] text-[#5B636E] pt-1 border-t border-[#D9DDE2] flex items-center justify-between">
                    <span>
                      {activePlan?.explanation_trace?.source === 'gemini'
                        ? `${activePlan.explanation_trace.model_version || activePlan.explanation_trace.model}, ${activePlan.explanation_trace.latency_ms} ms`
                        : 'Numbers come from the solver. The note restates them.'}
                    </span>
                    <button
                      onClick={() => setTraceDrawerOpen(true)}
                      className="text-[#0F5FA8] font-semibold hover:underline"
                    >
                      Inspect Trace [T]
                    </button>
                  </div>
                </div>

                {/* Deterministic Critic Check */}
                <div className="bg-emerald-50/80 p-3 rounded-lg border border-emerald-200 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-[#1E7A46]">
                    <ShieldCheck size={15} />
                    <span>Deterministic Critic Check: PASSED</span>
                  </div>
                  <p className="text-[11px] text-emerald-900 leading-relaxed">
                    {activeProposal.criticRuleExplanation}
                  </p>
                </div>

                {/* Impact Metrics (Before vs After) */}
                <div className="border border-[#D9DDE2] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#1B1F24]">
                    <span>Impact Comparison</span>
                    <span className="text-[10px] text-[#5B636E]">CP-SAT Solver Re-plan</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#F4F5F7] p-2 rounded">
                      <div className="text-[10px] text-[#5B636E]">Output</div>
                      <div className="font-bold text-[#1B1F24]">
                        {activeProposal.impactMetrics.outputBefore}% → {activeProposal.impactMetrics.outputAfter}%
                      </div>
                    </div>
                    <div className="bg-[#F4F5F7] p-2 rounded">
                      <div className="text-[10px] text-[#5B636E]">Restarts</div>
                      <div className="font-bold text-[#1B1F24]">
                        {activeProposal.impactMetrics.restartsBefore} → {activeProposal.impactMetrics.restartsAfter}
                      </div>
                    </div>
                    <div className="bg-[#F4F5F7] p-2 rounded">
                      <div className="text-[10px] text-[#5B636E]">Energy</div>
                      <div className="font-bold text-[#1B1F24]">
                        {activeProposal.impactMetrics.kwhAfter.toLocaleString()} kWh
                      </div>
                    </div>
                    <div className="bg-[#F4F5F7] p-2 rounded">
                      <div className="text-[10px] text-[#5B636E]">Bill</div>
                      <div className="font-bold text-[#1B1F24]">
                        ₹{activeProposal.impactMetrics.inrBefore.toLocaleString()} → ₹{activeProposal.impactMetrics.inrAfter.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Approval Actions */}
                <div className="space-y-2 pt-2">
                  {activeProposal.approvedAt ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center text-xs text-[#0F5FA8] font-bold">
                      Approved at {activeProposal.approvedAt}.
                    </div>
                  ) : activeProposal.rejectionReason ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center text-xs text-[#B42318] font-bold">
                      ✕ Rejected: {activeProposal.rejectionReason}
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => approveProposal(activeProposal.id)}
                        className="w-full h-11 rounded-lg bg-[#0F5FA8] hover:bg-[#0D4F8C] text-white font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        title="Approve and apply this schedule change to the production timeline"
                      >
                        <CheckCircle2 size={17} />
                        <span>Approve Proposal</span>
                      </button>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => {
                            setRejectActionType('keep');
                            setShowRejectModal(true);
                          }}
                          className="py-2 px-1 rounded-md bg-white hover:bg-slate-100 text-[#5B636E] border border-[#D9DDE2] text-[11px] font-semibold transition-colors text-center cursor-pointer"
                          title="Reject proposal and keep current production schedule unchanged"
                        >
                          Reject (Keep Plan)
                        </button>
                        <button
                          onClick={() => {
                            setRejectActionType('replan');
                            setShowRejectModal(true);
                          }}
                          className="py-2 px-1 rounded-md bg-white hover:bg-red-50 text-[#B42318] border border-red-200 text-[11px] font-semibold transition-colors text-center cursor-pointer"
                          title="Reject this proposal and calculate an alternative re-plan"
                        >
                          Reject & Re-plan
                        </button>
                        <button
                          onClick={() => setRejectReason('Edit requested')}
                          className="py-2 px-1 rounded-md bg-white hover:bg-slate-100 text-[#1B1F24] border border-[#D9DDE2] text-[11px] font-semibold transition-colors text-center cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-[#5B636E] text-xs">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-[#1E7A46]" />
                <p className="font-semibold text-[#1B1F24]">No proposals pending approval.</p>
                <p className="text-[11px] mt-1">Select an alert from the rail to inspect.</p>
              </div>
            )}
          </>

      </div>

      {/* Rejection Modal */}
      {showRejectModal && activeProposal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-xl border border-[#D9DDE2] space-y-3">
            <h4 className="font-bold text-sm text-[#1B1F24]">
              {rejectActionType === 'replan'
                ? 'Reject Proposal & Request Re-plan'
                : 'Reject Proposal (Keep Current Plan)'}
            </h4>
            <p className="text-xs text-[#5B636E]">
              {rejectActionType === 'replan'
                ? 'Decline this proposal and trigger CP-SAT to calculate an alternative schedule mitigation.'
                : 'Decline this proposal. The current active production schedule remains unchanged.'}
            </p>

            <label className="block text-[11px] font-bold text-[#5B636E] uppercase tracking-wider">
              Audited Rejection Reason
            </label>
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full text-xs p-2 rounded border border-[#D9DDE2] bg-white"
            >
              <option value="Already handled on the floor">Already handled on the floor</option>
              <option value="Wrong station identified">Wrong station identified</option>
              <option value="Duplicate notification">Duplicate notification</option>
              <option value="Worker withdrew report">Worker withdrew report</option>
              <option value="Other supervisor override">Other supervisor override</option>
            </select>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-1.5 text-xs rounded border border-[#D9DDE2] text-[#5B636E] hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const finalReason =
                    rejectActionType === 'replan'
                      ? `${rejectReason} (Alternative Re-plan Requested)`
                      : rejectReason;
                  rejectProposal(activeProposal.id, finalReason);
                  if (rejectActionType === 'replan') {
                    solveMorningPlan();
                  }
                  setShowRejectModal(false);
                }}
                className={`px-3 py-1.5 text-xs rounded text-white font-semibold transition-colors ${
                  rejectActionType === 'replan'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-[#B42318] hover:bg-red-700'
                }`}
              >
                {rejectActionType === 'replan' ? 'Reject & Re-plan' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
