import React from 'react';
import {
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  Clock,
  CheckCircle,
  Phone,
  ArrowLeft,
  UserCheck,
  Flame,
  Radio,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { AlertItem } from '../../types';
import { maskPhone } from '../../utils/mapper';

interface SupervisorModeProps {
  onExit: () => void;
}

export const SupervisorMode: React.FC<SupervisorModeProps> = ({ onExit }) => {
  const { alerts, activeSos, acknowledgeSos, goBack } = usePlant();

  // Supervisor safety alerts: SOS, Dizzy, Not okay, Held checks
  const safetyAlerts = alerts.filter((a) =>
    ['sos', 'dizzy', 'not_okay', 'no_reply', 'held_check', 'tablet_heartbeat'].includes(a.type)
  );

  return (
    <div className="min-h-screen bg-[#121417] text-[#E8EAED] flex flex-col font-sans select-none">
      {/* Top Floor Bar */}
      <div className="bg-[#1C1F24] border-b border-[#2D3139] px-4 py-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={onExit || goBack}
            id="supervisormode-exit-btn"
            className="p-1 rounded bg-[#2D3139] text-white hover:bg-slate-700 cursor-pointer"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="font-bold text-sm text-white flex items-center gap-1.5">
              <span>Lakshmi (Floor Supervisor)</span>
              <span className="w-2 h-2 rounded-full bg-[#4CC38A] animate-ping" />
            </div>
            <div className="text-[11px] text-[#9AA3AD]">Active Floor Response Unit</div>
          </div>
        </div>

        <button
          onClick={goBack}
          id="supervisormode-console-btn"
          className="px-2.5 py-1 rounded bg-[#2D3139] text-[#9AA3AD] hover:text-white text-xs border border-[#3E434D] cursor-pointer"
        >
          Back
        </button>
      </div>

      {/* Main Floor Alert Feed */}
      <div className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {/* Banner about scope */}
        <div className="bg-[#1C1F24] p-3 rounded-xl border border-[#2D3139] text-xs text-[#9AA3AD] flex items-center gap-2">
          <Radio size={16} className="text-[#FFC857] shrink-0" />
          <span>
            Floor alerts only: receive, acknowledge, escalate. Plan approvals stay on the desktop console.
          </span>
        </div>

        {/* Unacknowledged Emergency SOS Card (if active) */}
        {activeSos && !activeSos.acknowledged && (
          <div className="bg-[#B42318] text-white p-5 rounded-2xl shadow-xl space-y-4 animate-sos-pulse">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm uppercase tracking-wider flex items-center gap-1.5">
                <AlertOctagon size={20} className="animate-bounce" />
                <span>EMERGENCY SOS DISPATCH</span>
              </span>
              <span className="text-xs bg-black/30 px-2 py-0.5 rounded font-mono">
                {activeSos.timestamp}
              </span>
            </div>

            <div>
              <div className="text-xl font-bold">{activeSos.worker.name}</div>
              <div className="text-sm opacity-90">{activeSos.station.nameEn}</div>
              <div className="text-xs font-mono mt-1 opacity-80">{maskPhone(activeSos.worker.phone)}</div>
            </div>

            <div className="space-y-2">
              {/* 64px Giant Touch Acknowledge Button */}
              <button
                onClick={() => acknowledgeSos('Lakshmi on Floor Phone')}
                className="w-full h-16 rounded-xl bg-white text-[#B42318] font-bold text-base shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-transform"
              >
                <CheckCircle size={22} />
                <span>Acknowledge on Floor (64px)</span>
              </button>

              <button
                onClick={() => alert("Notification sent: Lakshmi is en route to Furnace 1.")}
                className="w-full py-2.5 rounded-lg bg-black/30 text-white text-xs font-semibold"
              >
                &ldquo;I&apos;m on my way&rdquo; Quick Ping
              </button>
            </div>
          </div>
        )}

        {/* Safety & Heat Alerts List */}
        <div className="space-y-3">
          <h3 className="font-bold text-xs uppercase tracking-wider text-[#9AA3AD]">
            Floor Safety Feed ({safetyAlerts.length})
          </h3>

          {safetyAlerts.map((item) => (
            <div
              key={item.id}
              className="bg-[#1C1F24] rounded-xl p-4 border border-[#2D3139] space-y-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.type === 'sos' || item.type === 'dizzy' ? (
                    <AlertTriangle size={18} className="text-[#FF6B5E]" />
                  ) : item.type === 'held_check' ? (
                    <Clock size={18} className="text-[#FFC857]" />
                  ) : (
                    <Flame size={18} className="text-[#FFC857]" />
                  )}
                  <span className="font-bold text-sm text-[#E8EAED]">{item.title}</span>
                </div>
                <span className="text-[11px] font-mono text-[#9AA3AD]">{item.timestamp}</span>
              </div>

              <p className="text-[#9AA3AD] text-xs leading-relaxed">{item.description}</p>

              <div className="flex items-center justify-between pt-1 border-t border-[#2D3139] text-[11px]">
                <span className="text-[#4CC38A]">Station: {item.stationName}</span>
                {item.status === 'acknowledged' ? (
                  <span className="text-[#4CC38A] font-semibold">✓ Acknowledged</span>
                ) : item.status === 'held' ? (
                  <span className="text-[#FFC857] font-semibold">Held until pour ends</span>
                ) : (
                  <button
                    onClick={() => acknowledgeSos('Lakshmi on Floor Phone')}
                    className="px-3 py-1 rounded bg-[#2D3139] hover:bg-[#3E434D] text-white font-semibold"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Read-Only Plan Glance (Section 7 C8) */}
        <div className="bg-[#1C1F24] rounded-xl p-4 border border-[#2D3139] text-xs space-y-2">
          <div className="font-bold text-xs uppercase tracking-wider text-[#9AA3AD]">
            Read-Only Plan Glance
          </div>
          <p className="text-[#E8EAED]">
            Relief operator swap proposed: <strong>Ramesh</strong> for Suresh at Furnace 1.
          </p>
          <div className="text-[11px] text-[#FFC857]">
            Plan approvals and re-plans remain strictly on Ravi&apos;s desktop console.
          </div>
        </div>
      </div>
    </div>
  );
};
