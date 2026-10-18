import { SchedulePlanResponse, KPISummary, ScheduleSlotAssignment } from '../types/backend';
import { RunMetrics, ScheduledJob, Station, HeatLevel } from '../types';
import { INITIAL_METRICS, INITIAL_SCHEDULED_JOBS, INITIAL_STATIONS } from '../constants/demoData';

export const MACHINE_TO_STATION_MAP: Record<string, string> = {
  'CNC_1': 'st_cnc_1',
  'CNC_2': 'st_cnc_2',
  'FURNACE_1': 'st_furnace_1',
  'FURNACE_2': 'st_charging',
  'CHARGING_1': 'st_charging',
  'FURNACE_BAY': 'st_furnace_1',
  'PAINT_1': 'st_paint',
  'PAINT_BOOTH': 'st_paint',
  'OVEN_1': 'st_oven',
  'ASSEMBLY_1': 'st_charging',
  'st_cnc_1': 'st_cnc_1',
  'st_cnc_2': 'st_cnc_2',
  'st_furnace_1': 'st_furnace_1',
  'st_charging': 'st_charging',
  'st_paint': 'st_paint',
  'st_oven': 'st_oven',
};

export const STATION_TO_MACHINE_MAP: Record<string, string> = {
  'st_cnc_1': 'CNC_1',
  'st_cnc_2': 'CNC_2',
  'st_furnace_1': 'FURNACE_1',
  'st_charging': 'CHARGING_1',
  'st_paint': 'PAINT_1',
  'st_oven': 'OVEN_1',
};

export function mapMachineToStation(machineId: string): string {
  return MACHINE_TO_STATION_MAP[machineId] || `st_${machineId.toLowerCase()}`;
}

export function mapStationToMachine(stationId: string): string {
  return STATION_TO_MACHINE_MAP[stationId] || stationId.replace('st_', '').toUpperCase();
}

/**
 * Calculates HeatLevel based on WBGT in degrees Celsius
 */
export function calculateHeatLevel(wbgtC: number): HeatLevel {
  if (wbgtC >= 31.0) return 4; // Stop
  if (wbgtC >= 28.5) return 3; // Hot
  if (wbgtC >= 26.0) return 2; // Watch
  return 1; // Normal
}

/**
 * Maps backend SchedulePlanResponse KPIs to frontend RunMetrics
 */
export function mapPlanToMetrics(plan: SchedulePlanResponse, previousMetrics?: RunMetrics): RunMetrics {
  const kpi = plan.kpi || (plan as any).kpi_summary || {} as KPISummary;
  const baseKpi = plan.baseline_kpi || (plan as any).baseline_kpi_summary;
  const prev = previousMetrics || INITIAL_METRICS;

  const costBefore = baseKpi?.total_cost_inr !== undefined ? Math.round(baseKpi.total_cost_inr) : prev.inrCostBefore;
  const costAfter = kpi.total_cost_inr !== undefined ? Math.round(kpi.total_cost_inr) : prev.inrCostAfter;
  const kwhBefore = baseKpi?.total_kwh !== undefined ? Math.round(baseKpi.total_kwh) : prev.energyKwhBefore;
  const kwhAfter = kpi.total_kwh !== undefined ? Math.round(kpi.total_kwh) : prev.energyKwhAfter;
  const co2Saved = kpi.co2_saved_tco2 !== undefined ? +(kpi.co2_saved_tco2).toFixed(2) : (prev.co2SavedTons ?? 0.0);

  return {
    heatBreachesBefore: baseKpi?.heat_breaches_count ?? prev.heatBreachesBefore ?? 20,
    heatBreachesAfter: kpi.heat_breaches_count ?? 0,
    outputPct: kpi.output_percentage !== undefined ? +(kpi.output_percentage).toFixed(1) : 100.0,
    outputPctBefore: baseKpi?.output_percentage !== undefined ? +(baseKpi.output_percentage).toFixed(1) : 100.0,
    energyKwhBefore: kwhBefore,
    energyKwhAfter: kwhAfter,
    inrCostBefore: costBefore,
    inrCostAfter: costAfter,
    minMarginC: 2.1,
    restartsCount: kpi.total_restarts ?? prev.restartsCount ?? 4,
    bufferCostPct: 1.6,
    co2SavedTons: co2Saved,
    solverSeed: 42,
    planHash: plan.plan_id ? plan.plan_id.replace('PLAN_', '').substring(0, 6) : '7f9a2b',
    solverTimestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
  };
}

/**
 * Converts backend slot assignments into contiguous ScheduledJob items for the Gantt timeline
 */
export function mapSlotsToScheduledJobs(slots: ScheduleSlotAssignment[]): ScheduledJob[] {
  if (!slots || slots.length === 0) {
    return INITIAL_SCHEDULED_JOBS;
  }

  // Filter only active jobs or heat buffers
  const activeSlots = slots.filter(s => s.is_active || s.is_heat_buffer);
  if (activeSlots.length === 0) {
    return INITIAL_SCHEDULED_JOBS;
  }

  // Group slots by machine_id
  const machineGroups = new Map<string, ScheduleSlotAssignment[]>();
  for (const s of activeSlots) {
    const mId = s.machine_id || s.station_id || 'CNC_1';
    if (!machineGroups.has(mId)) {
      machineGroups.set(mId, []);
    }
    machineGroups.get(mId)!.push(s);
  }

  const result: ScheduledJob[] = [];

  for (const [machineId, machineSlots] of machineGroups.entries()) {
    // Sort slots by slot_index
    machineSlots.sort((a, b) => a.slot_index - b.slot_index);
    const stationId = mapMachineToStation(machineId);

    let currentJob: {
      jobId: string;
      jobName: string;
      startSlot: number;
      slotCount: number;
      maxWbgt: number;
      isBuffer: boolean;
      orderId: string;
    } | null = null;

    for (const slot of machineSlots) {
      const isBuffer = slot.is_heat_buffer;
      const jobId = isBuffer ? 'BUFFER' : (slot.order_id || slot.job_name || 'JOB');
      const jobName = isBuffer ? 'Heat Safety Buffer' : (slot.job_name || slot.order_id);
      const wbgt = slot.station_wbgt_c || 26.0;

      if (!currentJob) {
        currentJob = {
          jobId,
          jobName,
          startSlot: slot.slot_index,
          slotCount: 1,
          maxWbgt: wbgt,
          isBuffer,
          orderId: slot.order_id || '',
        };
      } else if (currentJob.jobId === jobId && currentJob.isBuffer === isBuffer) {
        currentJob.slotCount++;
        currentJob.maxWbgt = Math.max(currentJob.maxWbgt, wbgt);
      } else {
        // Push finished job
        result.push(buildScheduledJob(currentJob, stationId));
        currentJob = {
          jobId,
          jobName,
          startSlot: slot.slot_index,
          slotCount: 1,
          maxWbgt: wbgt,
          isBuffer,
          orderId: slot.order_id || '',
        };
      }
    }

    if (currentJob) {
      result.push(buildScheduledJob(currentJob, stationId));
    }
  }

  return result.length > 0 ? result : INITIAL_SCHEDULED_JOBS;
}

function buildScheduledJob(
  item: { jobId: string; jobName: string; startSlot: number; slotCount: number; maxWbgt: number; isBuffer: boolean; orderId: string },
  stationId: string
): ScheduledJob {
  // 15-minute slot = 0.25 hours, starting from 00:00 Day 1 to 48:00 Day 2
  const startHour = +( (item.startSlot * 0.25).toFixed(2) );
  const durationHours = Math.max(0.25, +( (item.slotCount * 0.25).toFixed(2) ));
  const heatClass = calculateHeatLevel(item.maxWbgt);

  return {
    id: `${stationId}_${item.jobId}_s${item.startSlot}`,
    stationId,
    name: item.jobName,
    startHour,
    durationHours,
    heatClass,
    isBuffer: item.isBuffer,
    status: 'scheduled',
    citations: ['ISO 7243:2017 Table C.1', 'Factories Act §11'],
  };
}

/**
 * Updates station telemetry based on backend slots
 */
export function updateStationsFromPlan(stations: Station[], slots?: ScheduleSlotAssignment[]): Station[] {
  if (!slots || slots.length === 0) return stations;

  // Find slot around index 20 (morning) or maximum WBGT
  const wbgtByMachine = new Map<string, number>();

  for (const s of slots) {
    const mId = s.machine_id;
    if (s.station_wbgt_c) {
      const existing = wbgtByMachine.get(mId) || 0;
      if (s.station_wbgt_c > existing) {
        wbgtByMachine.set(mId, s.station_wbgt_c);
      }
    }
  }

  return stations.map(st => {
    const machineId = mapStationToMachine(st.id);
    const wbgt = wbgtByMachine.get(machineId);
    if (!wbgt) return st;

    const roundedWbgt = +(wbgt.toFixed(1));
    return {
      ...st,
      currentWBGTEstimate: roundedWbgt,
      heatLevel: calculateHeatLevel(roundedWbgt),
    };
  });
}

/**
 * Masks worker phone numbers for privacy compliance (+91 98*** **000)
 */
export function maskPhone(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/(\+91\s*\d{2})\d{3}\s*(\d{2})(\d{3})/, '$1*** **$3');
}

