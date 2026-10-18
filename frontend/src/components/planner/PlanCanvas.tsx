import React, { useMemo, useState } from 'react';
import { Info, Wrench } from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { JobMove, ScheduleSlotAssignment, TariffBand } from '../../types/backend';

type ViewRange = 'day1' | 'day2' | 'all';
type PlanSide = 'ours' | 'baseline';

const KIND_COLOR: Record<JobMove['kind'], string> = {
  heat: 'bg-orange-500',
  tariff: 'bg-emerald-600',
  machine: 'bg-slate-600',
  due: 'bg-amber-600',
  unchanged: 'bg-[#0F5FA8]',
  dropped: 'bg-red-500',
};

function clock(slot: number, minutes: number) {
  const mins = slot * minutes;
  const day = Math.floor(mins / 1440) + 1;
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return `Day ${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hourOf(slot: number, minutes: number) {
  return (slot * minutes) / 60;
}

function groupRuns(slots: ScheduleSlotAssignment[]) {
  const groups = new Map<string, ScheduleSlotAssignment[]>();
  for (const s of slots.filter((x) => x.is_active && !x.is_heat_buffer)) {
    const key = `${s.machine_id}|${s.order_id}`;
    const list = groups.get(key) || [];
    list.push(s);
    groups.set(key, list);
  }
  const runs: Array<{
    key: string;
    orderId: string;
    jobName: string;
    machineId: string;
    start: number;
    end: number;
    kwh: number;
    cost: number;
    heat: number;
  }> = [];
  for (const [, group] of groups) {
    group.sort((a, b) => a.slot_index - b.slot_index);
    let start = group[0];
    let prev = group[0];
    let kwh = 0;
    let cost = 0;
    let heat = 0;
    const flush = (last: ScheduleSlotAssignment) => {
      runs.push({
        key: `${start.machine_id}|${start.order_id}|${start.slot_index}`,
        orderId: start.order_id,
        jobName: start.job_name,
        machineId: start.machine_id,
        start: start.slot_index,
        end: last.slot_index + 1,
        kwh,
        cost,
        heat,
      });
      kwh = 0;
      cost = 0;
      heat = 0;
    };
    for (const s of group) {
      if (s.slot_index !== prev.slot_index && s.slot_index !== prev.slot_index + 1) {
        flush(prev);
        start = s;
      }
      kwh += s.active_kwh;
      cost += s.cost_inr;
      if (s.thermal_margin_c < 0) heat += 1;
      prev = s;
    }
    flush(prev);
  }
  return runs;
}

function bandColor(band: TariffBand) {
  if (band.label === 'Solar') return 'bg-amber-200 text-amber-950';
  if (band.label === 'Peak') return 'bg-red-200 text-red-950';
  return 'bg-slate-100 text-slate-600';
}

export const PlanCanvas: React.FC = () => {
  const { activePlan, isRePlanning, triggerBreakdown, solveError } = usePlant();
  const [view, setView] = useState<ViewRange>('day1');
  const [side, setSide] = useState<PlanSide>('ours');
  const [hover, setHover] = useState<string | null>(null);

  const slotMin = activePlan?.slot_minutes || 15;
  const horizonH = activePlan?.horizon_hours || 48;
  const startHour = view === 'day2' ? 24 : 0;
  const endHour = view === 'day1' ? 24 : view === 'day2' ? Math.min(48, horizonH) : horizonH;
  const totalHours = Math.max(1, endHour - startHour);

  const ticks = useMemo(() => {
    const step = view === 'all' ? 8 : 4;
    const out: number[] = [];
    for (let h = startHour; h <= endHour; h += step) out.push(h);
    return out;
  }, [startHour, endHour, view]);

  const runs = useMemo(() => {
    if (!activePlan) return [];
    return groupRuns(side === 'ours' ? activePlan.schedule_slots : activePlan.baseline_schedule_slots);
  }, [activePlan, side]);

  const moveBy = useMemo(() => {
    const map = new Map<string, JobMove>();
    for (const m of activePlan?.job_moves || []) map.set(`${m.machine_id}|${m.order_id}`, m);
    return map;
  }, [activePlan]);

  const pos = (startSlot: number, endSlot: number) => {
    const s = Math.max(startHour, Math.min(endHour, hourOf(startSlot, slotMin)));
    const e = Math.max(startHour, Math.min(endHour, hourOf(endSlot, slotMin)));
    if (e <= startHour || s >= endHour) return null;
    return {
      left: `${((s - startHour) / totalHours) * 100}%`,
      width: `${Math.max(0.8, ((e - s) / totalHours) * 100)}%`,
    };
  };

  const hovered = hover ? runs.find((r) => r.key === hover) : null;
  const hoveredMove = hovered ? moveBy.get(`${hovered.machineId}|${hovered.orderId}`) : null;

  if (!activePlan) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F4F5F7] text-sm text-[#5B636E] p-8 text-center">
        <div>
          <p className="font-semibold text-[#1B1F24] mb-1">Run pending</p>
          <p>Open New plan, pick a day, and solve. The Gantt is the live CP-SAT result — nothing is drawn until then.</p>
          {solveError && <p className="mt-3 text-[#B42318]">{solveError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F4F5F7] overflow-hidden">
      <div className="bg-white border-b border-[#D9DDE2] px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex bg-[#F4F5F7] p-0.5 rounded border border-[#D9DDE2]">
            {([
              ['ours', 'Our plan'],
              ['baseline', 'Baseline'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSide(id)}
                className={`px-2.5 py-1 rounded font-semibold ${
                  side === id ? 'bg-[#0F5FA8] text-white' : 'text-[#5B636E] hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex bg-[#F4F5F7] p-0.5 rounded border border-[#D9DDE2]">
            {([
              ['day1', 'Day 1'],
              ['day2', 'Day 2'],
              ['all', '48 h'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`px-2.5 py-1 rounded font-semibold ${
                  view === id ? 'bg-slate-800 text-white' : 'text-[#5B636E] hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => triggerBreakdown('st_cnc_2')}
          className="inline-flex items-center gap-1 font-semibold text-[#C2410C] hover:bg-orange-50 px-2.5 py-1 rounded border border-orange-200"
        >
          <Wrench size={12} />
          CNC 2 breaks
        </button>
      </div>

      <p className="px-4 py-2 text-xs text-[#1B1F24] bg-white border-b border-[#D9DDE2] shrink-0">
        {activePlan.summary}
      </p>

      <div className="flex-1 overflow-auto p-4 space-y-2">
        <div className="bg-white rounded-lg border border-[#D9DDE2] p-3">
          <div className="relative h-5 w-full rounded overflow-hidden flex text-[9px] font-bold">
            {activePlan.tariff_bands.map((band, i) => {
              const style = pos(band.start_slot, band.end_slot);
              if (!style) return null;
              return (
                <div key={i} style={style} className={`absolute inset-y-0 flex items-center justify-center ${bandColor(band)}`}>
                  {hourOf(band.end_slot, slotMin) - hourOf(band.start_slot, slotMin) >= 3 ? `${band.label} ₹${band.rate_inr}` : ''}
                </div>
              );
            })}
          </div>
          <div className="relative h-5 mt-1 text-[10px] font-mono text-[#5B636E]">
            {ticks.map((h) => (
              <span
                key={h}
                style={{ left: `${((h - startHour) / totalHours) * 100}%` }}
                className="absolute -translate-x-1/2 whitespace-nowrap"
              >
                {`${String(h % 24).padStart(2, '0')}${h === 24 ? ' D2' : ''}`}
              </span>
            ))}
          </div>
        </div>

        <div className={`space-y-2 ${isRePlanning ? 'opacity-50' : ''}`}>
          {activePlan.machines.map((row) => {
            const machineRuns = runs.filter((r) => r.machineId === row.machine_id);
            const windows = activePlan.heat_windows.filter((w) => w.machine_id === row.machine_id);
            return (
              <div key={row.machine_id} className="bg-white rounded-lg border border-[#D9DDE2] overflow-hidden">
                <div className="px-3 py-1.5 bg-[#F4F5F7] border-b border-[#D9DDE2] flex items-center justify-between text-xs">
                  <span className="font-bold text-[#1B1F24]">{row.label}</span>
                  <span className="text-[#5B636E]">Class {row.work_class} · crew limit {row.limit_c}°C</span>
                </div>
                <div className="relative h-14 bg-slate-50">
                  {windows.map((w, i) => {
                    const style = pos(w.start_slot, w.end_slot);
                    if (!style) return null;
                    return (
                      <div
                        key={i}
                        style={style}
                        title={`Unsafe heat ${clock(w.start_slot, slotMin)}–${clock(w.end_slot, slotMin)}. Peak ${w.peak_wbgt_c}°C vs ${w.limit_c}°C.`}
                        className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,#fecaca_0_6px,#fee2e2_6px_12px)] opacity-80"
                      />
                    );
                  })}
                  {machineRuns.map((run) => {
                    const style = pos(run.start, run.end);
                    if (!style) return null;
                    const move = moveBy.get(`${run.machineId}|${run.orderId}`);
                    const kind = move?.kind || 'unchanged';
                    const baselineBreach = side === 'baseline' && run.heat > 0;
                    return (
                      <div
                        key={run.key}
                        style={style}
                        onMouseEnter={() => setHover(run.key)}
                        onMouseLeave={() => setHover(null)}
                        className={`absolute top-1.5 bottom-1.5 rounded px-2 text-white text-[11px] font-semibold flex items-center truncate shadow-xs ${KIND_COLOR[kind]} ${
                          baselineBreach ? 'ring-2 ring-red-700' : ''
                        }`}
                      >
                        {run.jobName}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white border-t border-[#D9DDE2] px-4 py-2 text-[11px] text-[#5B636E] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-500" /> Out of heat</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-600" /> Cheaper power</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#0F5FA8]" /> Kept</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-[repeating-linear-gradient(135deg,#fecaca_0_4px,#fee2e2_4px_8px)] border border-red-200" /> Unsafe heat</span>
        </div>
        {hovered && (
          <div className="flex items-center gap-2 text-[#1B1F24]">
            <Info size={12} className="text-[#0F5FA8]" />
            <span>
              <strong>{hovered.jobName}</strong> {clock(hovered.start, slotMin)}–{clock(hovered.end, slotMin)} · {hovered.kwh.toFixed(0)} kWh · ₹{hovered.cost.toFixed(0)}
              {hoveredMove ? ` · ${hoveredMove.reason}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
