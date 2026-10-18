import React, { useState } from 'react';
import {
  Clock,
  Lock,
  Sun,
  Flame,
  Info,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  Users,
  ChevronDown,
  X,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { ScheduledJob, Station, HeatLevel } from '../../types';
import { maskPhone } from '../../utils/mapper';

export const PlanCanvas: React.FC = () => {
  const {
    stations,
    workers,
    jobs,
    frozenUntilTime,
    selectedStationId,
    setSelectedStationId,
    triggerBreakdown,
    isRePlanning,
    showBeforeAfter,
    setShowBeforeAfter,
    isBreakdownActive,
  } = usePlant();

  const [zoomLevel, setZoomLevel] = useState<'4h' | '12h' | '48h'>('4h');
  const [selectedGroup, setSelectedGroup] = useState<'all' | 'furnace' | 'paint' | 'automated'>('furnace');
  const [hoveredJob, setHoveredJob] = useState<ScheduledJob | null>(null);
  const [openCrewStationId, setOpenCrewStationId] = useState<string | null>(null);

  // Time boundaries based on zoom
  // 4h: 13:00 to 17:00 (Peak heat & solar focus)
  // 12h: 06:00 to 18:00 (Standard day shifts 1 & 2)
  // 48h: 00:00 Day 1 to 48:00 Day 2 (Full continuous multi-horizon)
  const startHour = zoomLevel === '4h' ? 13 : (zoomLevel === '12h' ? 6 : 0);
  const endHour = zoomLevel === '4h' ? 17 : (zoomLevel === '12h' ? 18 : 48);
  const totalHours = endHour - startHour;

  // Filter stations by group
  const filteredStations = stations.filter((s) => {
    if (selectedGroup === 'all') return true;
    if (selectedGroup === 'furnace') return s.group === 'furnace';
    if (selectedGroup === 'paint') return s.group === 'paint';
    if (selectedGroup === 'automated') return s.group === 'automated' || s.group === 'cnc';
    return true;
  });

  const getPositionStyle = (start: number, duration: number) => {
    // Continuous 48-hour calculation
    const clampedStart = Math.max(startHour, Math.min(endHour, start));
    const clampedEnd = Math.max(startHour, Math.min(endHour, start + duration));
    const visibleDuration = clampedEnd - clampedStart;

    if (visibleDuration <= 0 && (start + duration < startHour || start > endHour)) {
      return { display: 'none' };
    }

    const leftPct = ((clampedStart - startHour) / totalHours) * 100;
    const widthPct = Math.max(1.2, (visibleDuration / totalHours) * 100);

    return {
      left: `${leftPct}%`,
      width: `${widthPct}%`,
    };
  };

  // Heat slot colors per 15 min
  const getSlotHeatColor = (hour: number, stationId: string): string => {
    const normHour = hour % 24;
    if (stationId.includes('furnace')) {
      if (normHour >= 12 && normHour <= 16) return '#C2410C'; // Hot
      if (normHour >= 10 && normHour <= 17) return '#F5B841'; // Watch
      return '#D9DDE2';
    }
    if (stationId.includes('paint') || stationId.includes('oven')) {
      if (normHour >= 13 && normHour <= 15) return '#C2410C'; // Hot
      if (normHour >= 11 && normHour <= 16) return '#F5B841'; // Watch
      return '#D9DDE2';
    }
    if (stationId.includes('charging') || stationId.includes('heat_treat')) {
      if (normHour >= 12 && normHour <= 16) return '#F5B841'; // Watch
      return '#D9DDE2';
    }
    return '#D9DDE2'; // Normal CNC / Assembly
  };

  // Time Axis Marker Generator
  const renderTimeMarkers = () => {
    if (zoomLevel === '4h') {
      return [13, 14, 15, 16, 17].map((h) => ({
        hour: h,
        label: `${h}:00`,
        leftPct: ((h - 13) / 4) * 100,
      }));
    }
    if (zoomLevel === '12h') {
      return [6, 8, 10, 12, 14, 16, 18].map((h) => ({
        hour: h,
        label: `${h.toString().padStart(2, '0')}:00`,
        leftPct: ((h - 6) / 12) * 100,
      }));
    }
    // 48h view: show 4-hour key steps across Day 1 and Day 2
    return [0, 6, 10, 16, 20, 24, 30, 34, 40, 44, 48].map((h) => {
      const dayNum = h < 24 ? 'D1' : (h === 48 ? 'D2' : 'D2');
      const timeInDay = h <= 24 ? h : h - 24;
      const label = h === 24 ? 'D1 End / D2 Start' : `${dayNum} ${timeInDay.toString().padStart(2, '0')}:00`;
      return {
        hour: h,
        label,
        leftPct: (h / 48) * 100,
      };
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F4F5F7] overflow-hidden select-none">
      {/* Top Controls Bar: Zoom & Groups */}
      <div className="bg-white border-b border-[#D9DDE2] px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          {/* Zoom Selector */}
          <div className="flex items-center gap-1 bg-[#F4F5F7] p-0.5 rounded border border-[#D9DDE2]">
            {(
              [
                { id: '4h', label: '4h (Peak Focus)' },
                { id: '12h', label: '12h (Day Shift)' },
                { id: '48h', label: '48h (Full Plan)' },
              ] as const
            ).map((z) => (
              <button
                key={z.id}
                onClick={() => setZoomLevel(z.id)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  zoomLevel === z.id
                    ? 'bg-[#0F5FA8] text-white shadow-xs'
                    : 'text-[#5B636E] hover:text-[#1B1F24] hover:bg-slate-200'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>

          <span className="text-[#D9DDE2]">|</span>

          {/* Group Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[#5B636E] font-medium text-[11px]">Bays:</span>
            {(['furnace', 'paint', 'automated', 'all'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors cursor-pointer ${
                  selectedGroup === g
                    ? 'bg-slate-800 text-white'
                    : 'bg-white hover:bg-slate-100 text-[#5B636E] border border-[#D9DDE2]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Breakdown Simulation & Shift Actions */}
        <div className="flex items-center gap-2">
          {showBeforeAfter && (
            <button
              onClick={() => setShowBeforeAfter(!showBeforeAfter)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F5FA8] bg-blue-50 px-2 py-1 rounded border border-blue-200"
            >
              <Eye size={12} />
              <span>Replay 600ms Plan Shift</span>
            </button>
          )}

          <button
            onClick={() => triggerBreakdown('st_cnc_2')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C2410C] hover:bg-orange-50 px-2.5 py-1 rounded border border-orange-200 transition-colors cursor-pointer"
            title="Simulate sudden CNC 2 breakdown to test frozen-window rescheduling"
          >
            <Wrench size={12} />
            <span>Simulate CNC 2 Breakdown</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Scroll Area */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {/* Timeline Header with Tariff Bar */}
        <div className="bg-white rounded-lg border border-[#D9DDE2] p-3 shadow-2xs">
          {/* Tariff Windows Strip */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[11px] text-[#5B636E] mb-1">
              <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Calendar size={12} className="text-[#0F5FA8]" />
                <span>
                  Grid Tariffs & Solar Incentive ({zoomLevel === '48h' ? '48-Hour Horizon' : (zoomLevel === '12h' ? '12-Hour Shift' : 'Peak 4-Hour Window')})
                </span>
              </span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Sun size={12} />
                TGSPDCL Solar Window ₹6.00/kWh (10:00 - 16:00 IST)
              </span>
            </div>

            {/* Tariff Bar Display by Zoom */}
            {zoomLevel === '4h' ? (
              <div className="h-4 w-full rounded flex overflow-hidden text-[9px] font-bold text-center">
                <div className="w-[75%] bg-amber-100 text-amber-900 border-r border-amber-300 flex items-center justify-center">
                  Peak Solar Window ₹6.00/kWh (13:00 - 16:00)
                </div>
                <div className="w-[25%] bg-red-100 text-red-900 flex items-center justify-center">
                  Evening Peak ₹9.20/kWh (16:00 - 17:00)
                </div>
              </div>
            ) : zoomLevel === '12h' ? (
              <div className="h-4 w-full rounded flex overflow-hidden text-[9px] font-bold text-center">
                <div className="w-[33.3%] bg-slate-100 text-slate-700 border-r border-slate-300 flex items-center justify-center">
                  Base Tariff ₹7.50 (06:00 - 10:00)
                </div>
                <div className="w-[50%] bg-amber-100 text-amber-900 border-r border-amber-300 flex items-center justify-center">
                  Peak Solar Window ₹6.00/kWh (10:00 - 16:00)
                </div>
                <div className="w-[16.7%] bg-red-100 text-red-900 flex items-center justify-center">
                  Evening Peak ₹9.20 (16:00 - 18:00)
                </div>
              </div>
            ) : (
              /* 48h Full Plan Dual-Day Solar & Peak Cycles */
              <div className="h-4 w-full rounded flex overflow-hidden text-[8px] font-bold text-center">
                <div className="w-[50%] flex border-r-2 border-slate-400">
                  <div className="w-[20.8%] bg-slate-100 text-slate-700 flex items-center justify-center">D1 Off-Peak</div>
                  <div className="w-[25%] bg-amber-100 text-amber-900 flex items-center justify-center border-x border-amber-300">D1 Solar (₹6.00)</div>
                  <div className="w-[16.7%] bg-red-100 text-red-900 flex items-center justify-center border-r border-red-300">D1 Peak (₹9.20)</div>
                  <div className="w-[37.5%] bg-slate-100 text-slate-700 flex items-center justify-center">D1 Night Shift</div>
                </div>
                <div className="w-[50%] flex">
                  <div className="w-[20.8%] bg-slate-100 text-slate-700 flex items-center justify-center">D2 Off-Peak</div>
                  <div className="w-[25%] bg-amber-100 text-amber-900 flex items-center justify-center border-x border-amber-300">D2 Solar (₹6.00)</div>
                  <div className="w-[16.7%] bg-red-100 text-red-900 flex items-center justify-center border-r border-red-300">D2 Peak (₹9.20)</div>
                  <div className="w-[37.5%] bg-slate-100 text-slate-700 flex items-center justify-center">D2 Night Shift</div>
                </div>
              </div>
            )}
          </div>

          {/* Time Marker Axis */}
          <div className="relative h-6 border-t border-[#D9DDE2] flex items-center text-[10px] text-[#5B636E] font-mono tabular-nums">
            {renderTimeMarkers().map((m, idx) => (
              <div
                key={idx}
                style={{ left: `${m.leftPct}%` }}
                className="absolute transform -translate-x-1/2 flex flex-col items-center"
              >
                <div className="h-1.5 w-px bg-[#5B636E]"></div>
                <span className="whitespace-nowrap font-medium text-[9px] sm:text-[10px]">{m.label}</span>
              </div>
            ))}

            {/* Now Marker (14:10 = 14.166) - Only visible if within current range */}
            {14.166 >= startHour && 14.166 <= endHour && (
              <div
                style={{ left: `${((14.166 - startHour) / totalHours) * 100}%` }}
                className="absolute top-0 bottom-0 z-20 flex flex-col items-center pointer-events-none"
              >
                <div className="bg-[#B42318] text-white text-[9px] font-bold px-1 rounded-xs -mt-2 shadow-xs whitespace-nowrap">
                  NOW 14:10
                </div>
                <div className="w-0.5 h-full bg-[#B42318]"></div>
              </div>
            )}
          </div>
        </div>

        {/* Stations Gantt Canvas */}
        <div className={`space-y-3 transition-opacity duration-300 ${isRePlanning ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          {filteredStations.map((station) => {
            const stationJobs = jobs.filter((j) => j.stationId === station.id);
            const assignedWorkers = workers.filter((w) => w.stationId === station.id);
            const reliefCount = assignedWorkers.filter((w) => w.isFurnaceQualified).length;
            const restingCount = assignedWorkers.filter((w) => w.status === 'resting').length;
            const isSelected = selectedStationId === station.id;

            return (
              <div
                key={station.id}
                onClick={() => setSelectedStationId(station.id)}
                className={`bg-white rounded-lg border transition-all shadow-2xs overflow-visible cursor-pointer ${
                  isSelected ? 'border-[#0F5FA8] ring-1 ring-[#0F5FA8]' : 'border-[#D9DDE2] hover:border-slate-400'
                }`}
              >
                {/* Station Row Header: Title, Telemetry, and Clean Crew Popover Button */}
                <div className="bg-[#F4F5F7] px-3 py-1.5 border-b border-[#D9DDE2] flex items-center justify-between text-xs relative">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1B1F24]">{station.nameEn}</span>
                    <span className="font-telugu text-[11px] text-[#5B636E]">({station.nameTe})</span>
                    {station.activePour && (
                      <span className="bg-amber-100 text-[#7A4100] px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1">
                        <Flame size={11} />
                        <span>Continuous Pour (ends {station.pourEndTime})</span>
                      </span>
                    )}
                    {restingCount > 0 && (
                      <span className="bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse">
                        ⚠️ {restingCount} Resting on Buffer
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 text-[11px]">
                    <span className="text-[#5B636E] hidden sm:inline">
                      Offset: +{station.offsetC}°C ({station.metabolicClass})
                    </span>
                    <span className="font-mono font-bold text-[#1B1F24] bg-white px-1.5 py-0.5 rounded border border-[#D9DDE2]">
                      {station.currentWBGTEstimate}°C screening estimate
                    </span>

                    {/* Compact Crew Dropdown (SOLVES THE 15-BOX CLUTTER) */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenCrewStationId(openCrewStationId === station.id ? null : station.id);
                        }}
                        className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-[#0F5FA8] border border-blue-200 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Click to view assigned operators and relief certifications"
                      >
                        <Users size={12} />
                        <span>{assignedWorkers.length} Crew ({reliefCount} Relief)</span>
                        <ChevronDown size={11} className={openCrewStationId === station.id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                      </button>

                      {/* Dropdown Crew Popover */}
                      {openCrewStationId === station.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-full mt-1.5 w-80 bg-white rounded-lg shadow-xl border border-[#D9DDE2] p-3 z-50 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between pb-1.5 border-b border-[#D9DDE2]">
                            <span className="font-bold text-[#1B1F24] flex items-center gap-1.5">
                              <Users size={13} className="text-[#0F5FA8]" />
                              <span>{station.nameEn} Crew ({assignedWorkers.length})</span>
                            </span>
                            <button
                              onClick={() => setOpenCrewStationId(null)}
                              className="text-[#5B636E] hover:text-[#1B1F24] p-0.5 rounded cursor-pointer"
                            >
                              <X size={13} />
                            </button>
                          </div>

                          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 space-y-1">
                            {assignedWorkers.map((w) => (
                              <div key={w.id} className="pt-1.5 pb-1 flex items-center justify-between text-[11px]">
                                <div>
                                  <div className="font-semibold text-[#1B1F24] flex items-center gap-1">
                                    <span>{w.name}</span>
                                    {w.isFurnaceQualified && (
                                      <span className="bg-emerald-100 text-[#1E7A46] text-[9px] font-bold px-1 rounded">
                                        ✓ Relief
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-[#5B636E]">{w.role} • {maskPhone(w.phone)}</div>
                                </div>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  w.status === 'resting'
                                    ? 'bg-amber-100 text-amber-800'
                                    : w.status === 'sos'
                                    ? 'bg-red-100 text-red-700 animate-pulse'
                                    : 'bg-slate-100 text-[#5B636E]'
                                }`}>
                                  {w.status === 'resting' ? 'Resting' : w.status === 'sos' ? 'SOS' : 'On Shift'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Heat Exposure Scale Row (15-min colored slots) */}
                <div className="px-3 pt-1.5 pb-1 bg-slate-50/50 border-b border-[#D9DDE2]/60">
                  <div className="relative h-1.5 w-full rounded flex overflow-hidden border border-[#D9DDE2]/60">
                    {Array.from({ length: Math.min(192, totalHours * 4) }).map((_, slotIdx) => {
                      const slotHour = startHour + slotIdx * 0.25;
                      const color = getSlotHeatColor(slotHour, station.id);
                      return (
                        <div
                          key={slotIdx}
                          style={{ width: `${100 / Math.min(192, totalHours * 4)}%`, backgroundColor: color }}
                          className="h-full"
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Gantt Timeline Track with vertical time guide grid */}
                <div className="relative h-16 w-full bg-slate-50/30 px-3 py-1.5 overflow-hidden">
                  {/* Faint vertical time grid lines */}
                  {renderTimeMarkers().map((m, idx) => (
                    <div
                      key={idx}
                      style={{ left: `${m.leftPct}%` }}
                      className="absolute top-0 bottom-0 w-px bg-slate-200/60 pointer-events-none"
                    />
                  ))}

                  {/* Red NOW vertical guide line */}
                  {14.166 >= startHour && 14.166 <= endHour && (
                    <div
                      style={{ left: `${((14.166 - startHour) / totalHours) * 100}%` }}
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500/40 pointer-events-none z-10"
                    />
                  )}

                  {/* Scheduled Jobs & Heat Buffer Blocks */}
                  {stationJobs.map((job) => {
                    const pos = getPositionStyle(job.startHour, job.durationHours);
                    if (pos.display === 'none') return null;

                    const isBuffer = job.isBuffer;
                    const isBreakdown = job.status === 'breakdown';
                    const isPour = job.isPourStep || job.name.toLowerCase().includes('pour');
                    const isHot = job.heatClass >= 3;

                    // Modern Heat Buffer Design: Clean, intentional rest cushion
                    if (isBuffer) {
                      const usedMins = job.bufferUsedHours ? Math.round(job.bufferUsedHours * 60) : 0;
                      return (
                        <div
                          key={job.id}
                          style={pos}
                          onMouseEnter={() => setHoveredJob(job)}
                          onMouseLeave={() => setHoveredJob(null)}
                          className="absolute top-1 bottom-1 rounded-md border-2 border-dashed border-amber-400 bg-amber-50/95 shadow-xs z-10 flex flex-col justify-center px-2.5 cursor-pointer transition-all hover:bg-amber-100/90 hover:scale-[1.01]"
                          title={`${job.name}: Scheduled rest cushion under peak thermal conditions`}
                        >
                          <div className="flex items-center gap-1.5 text-amber-950 font-bold text-[11px] truncate">
                            <span className="text-amber-700">☕</span>
                            <span className="truncate">{job.name}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] font-semibold text-amber-800 bg-white/95 px-1.5 py-0.2 rounded border border-amber-200 shadow-2xs whitespace-nowrap">
                              {usedMins > 0 ? `${usedMins}m rest absorbed` : 'Safety cushion ready'}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    // Breakdown Job Card
                    if (isBreakdown) {
                      return (
                        <div
                          key={job.id}
                          style={pos}
                          onMouseEnter={() => setHoveredJob(job)}
                          onMouseLeave={() => setHoveredJob(null)}
                          className="absolute top-1 bottom-1 rounded-md px-2.5 py-1 text-xs border-l-4 border-l-red-600 border border-red-300 bg-red-50 shadow-xs z-10 flex flex-col justify-center transition-all hover:shadow-md cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-red-900 truncate text-[11px]">{job.name}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-red-600 text-white rounded font-bold whitespace-nowrap">
                              FAULT
                            </span>
                          </div>
                          <div className="text-[10px] text-red-700 font-medium truncate">
                            Halted • Reallocating downstream
                          </div>
                        </div>
                      );
                    }

                    // Continuous Pour / Molten Processing (Furnace High Heat)
                    if (isPour) {
                      return (
                        <div
                          key={job.id}
                          style={pos}
                          onMouseEnter={() => setHoveredJob(job)}
                          onMouseLeave={() => setHoveredJob(null)}
                          className="absolute top-1 bottom-1 rounded-md px-2.5 py-1 text-xs border-l-4 border-l-amber-500 border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 shadow-xs z-10 flex flex-col justify-center transition-all hover:shadow-md hover:border-amber-400 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-slate-900 truncate text-[11px] flex items-center gap-1">
                              <span className="text-amber-600">🔥</span>
                              <span className="truncate">{job.name}</span>
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-amber-500 text-white rounded font-extrabold whitespace-nowrap shadow-2xs">
                              POUR
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-600 font-medium truncate flex items-center gap-1.5 mt-0.5">
                            <span className="font-semibold text-amber-900">Class {job.heatClass}</span>
                            <span>•</span>
                            <span>{Math.round(job.durationHours * 60)} min</span>
                          </div>
                        </div>
                      );
                    }

                    // Standard Machine & Automated Processing Card (Crisp, High-Contrast Industrial Card)
                    const leftBorderColor = isHot
                      ? 'border-l-orange-500'
                      : station.id.includes('automated') || station.id.includes('cnc')
                      ? 'border-l-emerald-600'
                      : 'border-l-blue-600';

                    return (
                      <div
                        key={job.id}
                        style={pos}
                        onMouseEnter={() => setHoveredJob(job)}
                        onMouseLeave={() => setHoveredJob(null)}
                        className={`absolute top-1 bottom-1 rounded-md px-2.5 py-1 text-xs border-l-4 ${leftBorderColor} border border-slate-200 bg-white shadow-xs z-10 flex flex-col justify-center transition-all hover:shadow-md hover:border-slate-300 cursor-pointer`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-slate-900 truncate text-[11px]">
                            {job.name}
                          </span>
                          <span className="text-[9px] px-1 py-0.2 bg-slate-100 text-slate-600 rounded font-mono font-bold whitespace-nowrap border border-slate-200">
                            {job.id.slice(-4).toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium truncate flex items-center gap-1.5 mt-0.5">
                          <span>Class {job.heatClass}</span>
                          <span>•</span>
                          <span>{Math.round(job.durationHours * 60)} min</span>
                          {station.currentWBGTEstimate && (
                            <>
                              <span>•</span>
                              <span className="text-slate-700 font-semibold">{station.currentWBGTEstimate}°C screening estimate</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hovered Job Citation & Reasoning Tooltip/Bar */}
      {hoveredJob && (
        <div className="bg-[#1B1F24] text-white px-4 py-2 text-xs flex items-center justify-between gap-4 shadow-lg border-t border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-amber-400 shrink-0" />
            <span>
              <strong>{hoveredJob.name}</strong>:{' '}
              {hoveredJob.reasonMoved || 'Scheduled per ISO 7243 rest-pause standard & on-site solar tariff.'}
            </span>
          </div>
          {hoveredJob.citations && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <span className="text-slate-400">Cited:</span>
              {hoveredJob.citations.map((c, i) => (
                <span key={i} className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-amber-200">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
