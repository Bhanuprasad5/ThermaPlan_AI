import React from 'react';
import { Sun, AlertCircle } from 'lucide-react';

interface AreaAlertBadgeProps {
  showTelugu?: boolean;
  className?: string;
}

export const AreaAlertBadge: React.FC<AreaAlertBadgeProps> = ({
  showTelugu = true,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#5B2A86] text-white shadow-xs border border-purple-900/30 ${className}`}
      title="Area weather heat alert: Outdoor conditions exceed regional safety threshold"
    >
      <Sun size={13} className="text-amber-300 animate-spin-slow" />
      <AlertCircle size={13} />
      <span>Area heat alert</span>
      {showTelugu && (
        <span className="font-telugu opacity-95 border-l border-white/30 pl-1.5">
          వేడి హెచ్చరిక
        </span>
      )}
    </span>
  );
};
