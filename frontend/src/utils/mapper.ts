import { SchedulePlanResponse, ScheduleSlotAssignment } from '../types/backend';
import { RunMetrics, ScheduledJob, Station, HeatLevel } from '../types';

export const MACHINE_TO_STATION_MAP: Record<string, string> = {
  CNC_1: 'st_cnc_1',
  CNC_2: 'st_cnc_2',
  CNC_3: 'st_cnc_3',
  FURNACE_1: 'st_furnace_1',
  FURNACE_2: 'st_furnace_2',
  FURNACE_3: 'st_furnace_3',
  OVEN_1: 'st_oven',
  CHILLER_1: 'st_chiller',
  COMP_1: 'st_compressor',
};

export const STATION_TO_MACHINE_MAP: Record<string, string> = {
  st_cnc_1: 'CNC_1',
  st_cnc_2: 'CNC_2',
  st_cnc_3: 'CNC_3',
  st_furnace_1: 'FURNACE_1',
  st_furnace_2: 'FURNACE_2',
  st_furnace_3: 'FURNACE_3',
  st_charging: 'FURNACE_2',
  st_paint: 'OVEN_1',
  st_oven: 'OVEN_1',
  st_chiller: 'CHILLER_1',
  st_compressor: 'COMP_1',
};

export function mapMachineToStation(machineId: string): string {
  return MACHINE_TO_STATION_MAP[machineId] || `st_${machineId.toLowerCase()}`;
}

export function mapStationToMachine(stationId: string): string {
  return STATION_TO_MACHINE_MAP[stationId] || stationId.replace('st_', '').toUpperCase();
}

export function calculateHeatLevel(wbgtC: number): HeatLevel {
  if (wbgtC >= 31.0) return 4;
  if (wbgtC >= 28.5) return 3;
  if (wbgtC >= 26.0) return 2;
  return 1;
}

export function mapPlanToMetrics(plan: SchedulePlanResponse): RunMetrics {
  const kpi = plan.kpi;
  const base = plan.baseline_kpi;
  return {
    heatBreachesBefore: base?.heat_breaches_count ?? 0,
    heatBreachesAfter: kpi.heat_breaches_count,
    outputPct: kpi.output_percentage,
    outputPctBefore: base?.output_percentage ?? kpi.output_percentage,
    energyKwhBefore: base ? Math.round(base.total_kwh) : Math.round(kpi.total_kwh),
    energyKwhAfter: Math.round(kpi.total_kwh),
    inrCostBefore: base ? Math.round(base.total_cost_inr) : Math.round(kpi.total_cost_inr),
    inrCostAfter: Math.round(kpi.total_cost_inr),
    minMarginC: 0,
    restartsCount: kpi.total_restarts,
    bufferCostPct: 0,
    co2SavedTons: kpi.co2_saved_tco2,
    solverSeed: plan.solver_seed ?? 42,
    planHash: plan.plan_hash || plan.plan_id,
    solverTimestamp: plan.created_at,
  };
}

export function mapSlotsToScheduledJobs(
  slots: ScheduleSlotAssignment[],
  slotMinutes = 15
): ScheduledJob[] {
  const active = slots.filter((s) => s.is_active && !s.is_heat_buffer);
  const groups = new Map<string, ScheduleSlotAssignment[]>();
  for (const s of active) {
    const key = `${s.machine_id}|${s.order_id}`;
    const list = groups.get(key) || [];
    list.push(s);
    groups.set(key, list);
  }

  const result: ScheduledJob[] = [];
  for (const [, group] of groups) {
    group.sort((a, b) => a.slot_index - b.slot_index);
    let run: ScheduleSlotAssignment[] = [];
    const flush = () => {
      if (!run.length) return;
      const first = run[0];
      const last = run[run.length - 1];
      result.push({
        id: `${first.machine_id}_${first.order_id}_s${first.slot_index}`,
        stationId: mapMachineToStation(first.machine_id),
        name: first.job_name,
        startHour: (first.slot_index * slotMinutes) / 60,
        durationHours: ((last.slot_index - first.slot_index + 1) * slotMinutes) / 60,
        heatClass: calculateHeatLevel(Math.max(...run.map((s) => s.station_wbgt_c))),
        status: 'scheduled',
      });
      run = [];
    };
    for (const slot of group) {
      if (run.length && slot.slot_index !== run[run.length - 1].slot_index + 1) flush();
      run.push(slot);
    }
    flush();
  }
  return result;
}

export function updateStationsFromPlan(stations: Station[], slots?: ScheduleSlotAssignment[]): Station[] {
  if (!slots?.length) return stations;
  const wbgtByMachine = new Map<string, number>();
  for (const s of slots) {
    const existing = wbgtByMachine.get(s.machine_id) || 0;
    if (s.station_wbgt_c > existing) wbgtByMachine.set(s.machine_id, s.station_wbgt_c);
  }
  return stations.map((st) => {
    const wbgt = wbgtByMachine.get(mapStationToMachine(st.id));
    if (!wbgt) return st;
    return {
      ...st,
      currentWBGTEstimate: +wbgt.toFixed(1),
      heatLevel: calculateHeatLevel(wbgt),
    };
  });
}

export function maskPhone(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/(\+91\s*\d{2})\d{3}\s*(\d{2})(\d{3})/, '$1*** **$3');
}
