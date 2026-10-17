import React, { useState } from 'react';
import { AlertOctagon, Phone, Copy, Check, ShieldAlert } from 'lucide-react';
import { usePlant } from '../../context/PlantContext';

export const SosBand: React.FC = () => {
  const { activeSos, acknowledgeSos } = usePlant();
  const [copied, setCopied] = useState(false);

  if (!activeSos || activeSos.acknowledged) {
    return null;
  }

  const { worker, station, timestamp, elapsedSec, escalated } = activeSos;

  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const timerFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const copyPhoneNumber = () => {
    navigator.clipboard?.writeText(worker.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside
      aria-label="Active emergency SOS alert"
      className="bg-[#B42318] text-white px-4 py-3 shadow-md animate-sos-pulse flex flex-wrap items-center justify-between gap-4 z-30"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <AlertOctagon size={22} className="animate-bounce" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-wide uppercase">Emergency SOS</span>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
              {timestamp} ({station.nameEn})
            </span>
            {escalated && (
              <span className="text-xs bg-black/40 text-amber-200 px-2 py-0.5 rounded font-bold">
                ESCALATED TO PLANT HEAD
              </span>
            )}
          </div>
          <p className="text-xs text-white/90">
            Worker <strong>{worker.name}</strong> triggered emergency stop signal at {station.nameEn}.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Suresh's Phone Number with Copy */}
        <div className="flex items-center gap-1.5 bg-black/25 px-2.5 py-1.5 rounded text-xs font-mono">
          <Phone size={13} className="text-white/80" />
          <span>{worker.phone}</span>
          <button
            onClick={copyPhoneNumber}
            className="ml-1 p-1 hover:bg-white/20 rounded transition-colors"
            title="Copy worker phone number"
          >
            {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
          </button>
        </div>

        {/* Elapsed Timer */}
        <div className="text-xs font-semibold tabular-nums bg-white/20 px-2.5 py-1.5 rounded">
          Not acknowledged for {timerFormatted}
        </div>

        {/* Acknowledge Button */}
        <button
          onClick={() => acknowledgeSos('Ravi on Desktop')}
          className="h-9 px-4 rounded-md bg-white hover:bg-slate-100 text-[#B42318] font-bold text-xs shadow-sm transition-colors cursor-pointer"
        >
          Acknowledge & Assign Relief
        </button>
      </div>
    </aside>
  );
};
