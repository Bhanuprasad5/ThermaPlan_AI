import apiClient from './apiClient';
import { EmergencySOSResponse, WorkerCheckInResponse } from '../types/backend';

export async function sendEmergencySos(
  stationId: string,
  immediateAction: 'IMMEDIATE_STOP' | 'CALL_MEDIC' | 'STATION_EVACUATE' = 'IMMEDIATE_STOP',
  reason: string = 'Worker severe heat distress or medical emergency'
): Promise<EmergencySOSResponse> {
  const { data } = await apiClient.post<EmergencySOSResponse>('/safety/emergency-sos', {
    station_id: stationId,
    immediate_action: immediateAction,
    reason,
  });
  return data;
}

export async function sendWorkerCheckIn(
  stationId: string,
  signalCategory: 'CHECKIN_OK' | 'CHECKIN_TOO_HOT' | 'DIZZY',
  reportedSlot?: number,
  notes?: string
): Promise<WorkerCheckInResponse> {
  const { data } = await apiClient.post<WorkerCheckInResponse>('/guardian/worker-checkin', {
    station_id: stationId,
    signal_category: signalCategory,
    reported_slot: reportedSlot,
    notes,
  });
  return data;
}

export async function reportHazard(
  stationId: string,
  hazardCode: 'HEAT_EXHAUSTION' | 'VENTILATION_FAILURE' | 'COOLING_LINE_LEAK' | 'EQUIPMENT_OVERHEAT' | 'OTHER',
  hazardDescription: string
) {
  const { data } = await apiClient.post('/safety/report-hazard', {
    station_id: stationId,
    hazard_code: hazardCode,
    hazard_description: hazardDescription,
  });
  return data;
}
