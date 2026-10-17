import apiClient from './apiClient';
import { SchedulePlanResponse } from '../types/backend';

export interface BreakdownTriggerRequest {
  machine_id: string;
  fault_slot?: number;
  repair_duration_slots?: number;
  reason?: string;
  trigger_source?: string;
}

export interface WeatherSpikeRequest {
  slot_index?: number;
  temp_spike_c?: number;
}

export interface SimulationResponse {
  success: boolean;
  message?: string;
  plan?: SchedulePlanResponse;
  disruption?: any;
  proposal?: any;
  reschedule_plan?: SchedulePlanResponse;
}

/**
 * Trigger machine breakdown disruption in backend
 */
export async function triggerBreakdown(req: BreakdownTriggerRequest): Promise<any> {
  const { data } = await apiClient.post('/breakdown/trigger', {
    machine_id: req.machine_id || 'CNC_1',
    fault_slot: req.fault_slot ?? 14,
    repair_duration_slots: req.repair_duration_slots ?? 16,
    reason: req.reason || 'Spindle bearing failure / overheating',
    trigger_source: req.trigger_source || 'SIMULATION_MANUAL',
  });
  return data;
}

/**
 * Simulate sudden WBGT temperature spike
 */
export async function simulateWeatherSpike(req: WeatherSpikeRequest): Promise<any> {
  const { data } = await apiClient.post('/guardian/simulate-weather-spike', {
    slot_index: req.slot_index ?? 28,
    temp_spike_c: req.temp_spike_c ?? 3.5,
  });
  return data;
}

/**
 * Fetch guardian realtime state (heat alerts, worker checkins)
 */
export async function getGuardianState(): Promise<any> {
  const { data } = await apiClient.get('/guardian/state');
  return data;
}
