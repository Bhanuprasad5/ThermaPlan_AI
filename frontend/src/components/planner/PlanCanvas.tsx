import React, { useMemo, useState } from 'react';
import { ChevronDown, Info, Wrench } from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { HeatWindow, JobMove, SchedulePlanResponse, ScheduleSlotAssignment, TariffBand } from '../../types/backend';

type ViewRange = 'today' | 'tomorrow' | 'both';
type PlanSide = 'ours' | 'baseline';

const KIND_COLOR: Record<JobMove['kind'], string> = {
  heat: 'bg-orange-500',
  tariff: 'bg-emerald-600',
  machine: 'bg-slate-600',
  due: 'bg-amber-600',
  unchanged: 'bg-[#0F5FA8]',
  dropped: 'bg-red-500',
};

const KIND_EDGE: Record<JobMove['kind'], string> = {
  heat: 'border-orange-500',
  tariff: 'border-emerald-600',
  machine: 'border-slate-600',
  due: 'border-amber-600',
  unchanged: 'border-[#0F5FA8]',
  dropped: 'border-red-500',
};

const LOAD_LABELS: Record<string, string> = {
  fixed: 'Fixed',
  shiftable: 'Shiftable',
  interruptible: 'Interruptible',
};

const MEMBER_TAGS: Record<string, string> = {
  heavy: 'Heavy',
  relief: 'Relief',
  qualified: 'Qualified',
  light: 'Light',
};

interface CrewMember {
  name: string;
  role: string;
  heat_class?: string;
  tag?: string;
}

interface JobCrew {
  machine_id: string;
  order_id: string;
  job_name?: string;
  load_tag?: string;
  expected_wbgt_c?: number | null;
  supervisor?: string | null;
  members?: CrewMember[];
}

interface WorkRun {
  key: string;
  orderId: string;
  jobName: string;
  machineId: string;
  start: number;
  end: number;
  kwh: number;
  cost: number;
  heat: number;
}

function clockAtHour(planHour: number, originHour: number) {
  const total = Math.round((planHour + originHour) * 60);
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function clockLabel(slot: number, slotMinutes: number, originHour: number) {
  return clockAtHour((slot * slotMinutes) / 60, originHour);
}

function hourOf(slot: number, minutes: number) {
  return (slot * minutes) / 60;
}

function readOriginHour(plan: SchedulePlanResponse) {
  const raw = (plan as SchedulePlanResponse & { clock_origin_hour?: unknown }).clock_origin_hour;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 8;
}

function readJobCrews(plan: SchedulePlanResponse): JobCrew[] | null {
  const raw = (plan as SchedulePlanResponse & { job_crews?: unknown }).job_crews;
  if (!Array.isArray(raw)) return null;
  return raw.filter((row): row is JobCrew => {
    if (!row || typeof row !== 'object') return false;
    const crew = row as Partial<JobCrew>;
    return typeof crew.machine_id === 'string' && typeof crew.order_id === 'string';
  });
}

function namedLoad(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  return LOAD_LABELS[tag.trim().toLowerCase()] ?? null;
}

function namedMemberTag(tag: unknown): string | null {
  if (typeof tag !== 'string' || !tag.trim()) return null;
  const key = tag.trim().toLowerCase();
  return MEMBER_TAGS[key] ?? tag.trim();
}

function memberTagClass(label: string) {
  if (label === 'Heavy') return 'bg-red-100 text-red-800';
  if (label === 'Relief') return 'bg-sky-100 text-sky-900';
  if (label === 'Qualified') return 'bg-emerald-100 text-emerald-900';
  if (label === 'Light') return 'bg-slate-200 text-slate-700';
  return 'bg-slate-100 text-slate-700';
}

function loadTagClass(label: string) {
  if (label === 'Fixed') return 'bg-slate-200 text-slate-800';
  if (label === 'Shiftable') return 'bg-blue-100 text-blue-900';
  if (label === 'Interruptible') return 'bg-amber-100 text-amber-950';
  return 'bg-slate-100 text-slate-700';
}

function slotLoadTag(slots: ScheduleSlotAssignment[], machineId: string, orderId: string, startSlot: number) {
  const slot = slots.find(
    (item) => item.machine_id === machineId && item.order_id === orderId && item.slot_index === startSlot,
  );
  if (!slot) return null;
  return namedLoad((slot as ScheduleSlotAssignment & { load_tag?: unknown }).load_tag);
}

function crewMembers(crew: JobCrew | undefined): CrewMember[] {
  if (!crew || !Array.isArray(crew.members)) return [];
  return crew.members.filter((member) => !!member && typeof member.name === 'string' && member.name.trim().length > 0);
}

function formatDegrees(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function unsafeHeatLine(windows: HeatWindow[], start: number, end: number, slotMin: number, originHour: number) {
  const hits = windows.filter((window) => window.start_slot < end && window.end_slot > start);
  if (hits.length === 0) return null;
  const ranges = hits.map(
    (window) => `${clockLabel(window.start_slot, slotMin, originHour)}–${clockLabel(window.end_slot, slotMin, originHour)}`,
  );
  return `Unsafe heat ${ranges.join(', ')}`;
}

function groupRuns(slots: ScheduleSlotAssignment[]): WorkRun[] {
  const groups = new Map<string, ScheduleSlotAssignment[]>();
  for (const s of slots.filter((x) => x.is_active && !x.is_heat_buffer)) {
    const key = `${s.machine_id}|${s.order_id}`;
    const list = groups.get(key) || [];
    list.push(s);
    groups.set(key, list);
  }
  const runs: WorkRun[] = [];
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

function tickAlign(pct: number) {
  if (pct <= 0) return 'translate-x-0';
  if (pct >= 100) return '-translate-x-full';
  return '-translate-x-1/2';
}

export const PlanCanvas: React.FC = () => {
  const { activePlan, isRePlanning, triggerBreakdown, solveError } = usePlant();
  const [view, setView] = useState<ViewRange>('today');
  const [side, setSide] = useState<PlanSide>('ours');
  const [hover, setHover] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const slotMin = activePlan?.slot_minutes || 15;
  const horizonH = activePlan?.horizon_hours || 48;
  const originHour = activePlan ? readOriginHour(activePlan) : 8;
  const originClock = clockLabel(0, slotMin, originHour);
  const startHour = view === 'tomorrow' ? 24 : 0;
  const endHour = view === 'today' ? 24 : view === 'tomorrow' ? Math.min(48, horizonH) : horizonH;
  const totalHours = Math.max(1, endHour - startHour);

  const ticks = useMemo(() => {
    const step = view === 'both' ? 8 : 4;
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

  const crews = useMemo(() => (activePlan ? readJobCrews(activePlan) : null), [activePlan]);

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
  const planSlots = activePlan
    ? side === 'ours'
      ? activePlan.schedule_slots
      : activePlan.baseline_schedule_slots
    : [];

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
      <div className="bg-white border-b border-[#D9DDE2] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-[#F4F5F7] p-0.5 rounded border border-[#D9DDE2]">
            {([
              ['ours', 'Our plan'],
              ['baseline', 'Baseline'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSide(id);
                  setOpenRun(null);
                }}
                className={`px-2.5 py-1 rounded font-semibold ${
                  side === id ? 'bg-[#0F5FA8] text-white' : 'text-[#5B636E] hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap bg-[#F4F5F7] p-0.5 rounded border border-[#D9DDE2]">
            {([
              ['today', `Today ${originClock}–${originClock}`],
              ['tomorrow', `Tomorrow ${originClock}–${originClock}`],
              ['both', '48 hours'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setView(id);
                  setOpenRun(null);
                }}
                className={`px-2.5 py-1 rounded font-semibold whitespace-nowrap ${
                  view === id ? 'bg-slate-800 text-white' : 'text-[#5B636E] hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
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
            {ticks.map((h) => {
              const pct = ((h - startHour) / totalHours) * 100;
              return (
                <span
                  key={h}
                  style={{ left: `${pct}%` }}
                  className={`absolute whitespace-nowrap ${tickAlign(pct)}`}
                >
                  {clockAtHour(h, originHour)}
                </span>
              );
            })}
          </div>
        </div>

        <div className={`space-y-2 ${isRePlanning ? 'opacity-50' : ''}`}>
          {activePlan.machines.map((row) => {
            const machineRuns = runs.filter((r) => r.machineId === row.machine_id);
            const windows = activePlan.heat_windows.filter((w) => w.machine_id === row.machine_id);
            const opened = machineRuns.find((run) => run.key === openRun && pos(run.start, run.end));
            const openedCrew = opened
              ? crews?.find((crew) => crew.machine_id === opened.machineId && crew.order_id === opened.orderId)
              : undefined;
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
                        title={`Unsafe heat ${clockLabel(w.start_slot, slotMin, originHour)}–${clockLabel(w.end_slot, slotMin, originHour)}. Peak ${w.peak_wbgt_c}°C vs ${w.limit_c}°C.`}
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
                    const open = openRun === run.key;
                    const startClock = clockLabel(run.start, slotMin, originHour);
                    const endClock = clockLabel(run.end, slotMin, originHour);
                    return (
                      <button
                        key={run.key}
                        type="button"
                        style={{
                          left: style.left,
                          width: `clamp(0px, max(${style.width}, 4.75rem), calc(100% - ${style.left}))`,
                        }}
                        onMouseEnter={() => setHover(run.key)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => setOpenRun(open ? null : run.key)}
                        aria-expanded={open}
                        aria-label={`${run.jobName}, ${startClock} to ${endClock}`}
                        className={`absolute top-1.5 bottom-1.5 z-10 rounded border-0 p-0 text-white text-[11px] font-semibold overflow-hidden shadow-xs cursor-pointer ${KIND_COLOR[kind]} ${
                          baselineBreach ? 'ring-2 ring-red-700' : open ? 'ring-2 ring-[#1B1F24]' : ''
                        }`}
                      >
                        <span className="flex h-full w-full items-center gap-0.5 px-1.5 min-w-0">
                          <span className="min-w-0 flex-1 truncate text-left">{run.jobName}</span>
                          <ChevronDown size={12} className={`shrink-0 opacity-90 ${open ? 'rotate-180' : ''}`} aria-hidden />
                        </span>
                      </button>
                    );
                  })}
                </div>
                {opened && (
                  <RunPanel
                    run={opened}
                    kind={moveBy.get(`${opened.machineId}|${opened.orderId}`)?.kind || 'unchanged'}
                    crew={openedCrew}
                    showCrew={side === 'ours'}
                    loadTag={namedLoad(openedCrew?.load_tag) || slotLoadTag(planSlots, opened.machineId, opened.orderId, opened.start)}
                    heatLine={unsafeHeatLine(windows, opened.start, opened.end, slotMin, originHour)}
                    slotMin={slotMin}
                    originHour={originHour}
                  />
                )}
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
              <strong>{hovered.jobName}</strong> {clockLabel(hovered.start, slotMin, originHour)}–{clockLabel(hovered.end, slotMin, originHour)} · {hovered.kwh.toFixed(0)} kWh · ₹{hovered.cost.toFixed(0)}
              {hoveredMove ? ` · ${hoveredMove.reason}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

function RunPanel({
  run,
  kind,
  crew,
  showCrew,
  loadTag,
  heatLine,
  slotMin,
  originHour,
}: {
  run: WorkRun;
  kind: JobMove['kind'];
  crew: JobCrew | undefined;
  showCrew: boolean;
  loadTag: string | null;
  heatLine: string | null;
  slotMin: number;
  originHour: number;
}) {
  const members = crewMembers(crew);
  const supervisor = typeof crew?.supervisor === 'string' ? crew.supervisor.trim() : '';
  const expected = crew && typeof crew.expected_wbgt_c === 'number' && Number.isFinite(crew.expected_wbgt_c)
    ? crew.expected_wbgt_c
    : null;

  return (
    <div className={`border-t border-[#D9DDE2] border-l-4 ${KIND_EDGE[kind]} bg-white px-3 py-2`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-bold text-[#1B1F24]">{run.jobName}</p>
        <p className="shrink-0 font-mono text-[11px] text-[#1B1F24]">
          {clockLabel(run.start, slotMin, originHour)}–{clockLabel(run.end, slotMin, originHour)}
        </p>
      </div>
      {loadTag && (
        <p className="mt-1">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${loadTagClass(loadTag)}`}>{loadTag}</span>
        </p>
      )}
      {expected !== null && (
        <p className="mt-1 text-[11px] text-[#1B1F24]">About {formatDegrees(expected)}°C WBGT at start</p>
      )}
      {heatLine && <p className="mt-0.5 text-[11px] font-semibold text-[#B42318]">{heatLine}</p>}
      {showCrew && (
        crew ? (
          <div className="mt-1.5">
            <p className="text-[11px] text-[#1B1F24]">
              <span className="font-semibold">{members.length} crew</span>
              {supervisor ? <span> · Supervisor {supervisor}</span> : null}
            </p>
            {members.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {members.map((member, index) => {
                  const tag = namedMemberTag(member.tag);
                  return (
                    <li key={`${member.name}-${index}`} className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-medium text-[#1B1F24]">{member.name}</span>
                      {typeof member.role === 'string' && member.role.trim() ? (
                        <span className="text-[#5B636E]">{member.role}</span>
                      ) : null}
                      {tag && (
                        <span className={`rounded px-1 py-px text-[10px] font-semibold ${memberTagClass(tag)}`}>{tag}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-[#5B636E]">Crew appears after the next solve.</p>
        )
      )}
    </div>
  );
}
