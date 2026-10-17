import React from 'react';
import { Thermometer, AlertTriangle, ShieldCheck } from 'lucide-react';
import { HeatLevel, HEAT_LEVELS } from '../../types';

interface HeatBadgeProps {
  level: HeatLevel;
  showTelugu?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showOriginTag?: boolean;
}

export const HeatBadge: React.FC<HeatBadgeProps> = ({
  level,
  showTelugu = true,
  size = 'md',
  showOriginTag = false,
}) => {
  const info = HEAT_LEVELS[level];

  // Specific high contrast text styling per design token specifications:
  // Level 1: Normal #D9DDE2 -> ink text #1B1F24
  // Level 2: Watch #F5B841 -> ink text #1B1F24 (9.32:1)
  // Level 3: Hot #C2410C -> white text (5.18:1)
  // Level 4: Stop #B42318 -> white text (6.57:1)
  const isLightBackground = level <= 2;
  const textColorClass = isLightBackground ? 'text-[#1B1F24]' : 'text-white';
  const iconColor = isLightBackground ? '#1B1F24' : '#FFFFFF';

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs font-semibold gap-1.5',
    md: 'px-2.5 py-1 text-sm font-semibold gap-2',
    lg: 'px-3.5 py-1.5 text-base font-semibold gap-2.5',
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <span
        style={{ backgroundColor: info.color }}
        className={`inline-flex items-center rounded-md ${sizeClasses[size]} ${textColorClass} shadow-xs border border-black/10`}
      >
        {level === 1 && <ShieldCheck size={size === 'sm' ? 14 : 16} color={iconColor} />}
        {level === 2 && <Thermometer size={size === 'sm' ? 14 : 16} color={iconColor} />}
        {level === 3 && <Thermometer size={size === 'sm' ? 14 : 16} color={iconColor} />}
        {level === 4 && <AlertTriangle size={size === 'sm' ? 14 : 16} color={iconColor} />}

        <span>{info.wordEn}</span>
        {showTelugu && (
          <span className="font-telugu opacity-90 border-l border-current/25 pl-1.5">
            {info.wordTe}
          </span>
        )}
      </span>

      {showOriginTag && (
        <span className="text-[11px] text-[#5B636E]">
          Screening estimate: outdoor forecast + station offset. Not a WBGT measurement.
        </span>
      )}
    </div>
  );
};
