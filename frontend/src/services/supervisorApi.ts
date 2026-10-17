import apiClient from './apiClient';

export interface SupervisorDashboardResponse {
  active_alerts: any[];
  station_statuses: Record<string, any>;
  current_slot: number;
  wbgt_c: number;
  heat_category: string;
  mandatory_rest_minutes_per_hour: number;
  total_workers_active: number;
  unacknowledged_alerts_count: number;
}

export async function getSupervisorDashboard(): Promise<SupervisorDashboardResponse> {
  const { data } = await apiClient.get<SupervisorDashboardResponse>('/supervisor/dashboard');
  return data;
}

export async function acknowledgeAlert(alertId: string, supervisorNote?: string): Promise<any> {
  const { data } = await apiClient.post('/supervisor/action', {
    action: 'ACKNOWLEDGE_ALERT',
    alert_id: alertId,
    note: supervisorNote || 'Acknowledged by shopfloor supervisor',
  });
  return data;
}

export async function approveProposal(proposalId: string): Promise<any> {
  const { data } = await apiClient.post('/supervisor/action', {
    action: 'APPROVE_PROPOSAL',
    proposal_id: proposalId,
  });
  return data;
}
