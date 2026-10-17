/**
 * TypeScript mirror of teevra-backend Pydantic domain & schedule models
 */

export interface ScheduleSlotAssignment {
  slot_index: number;
  timestamp_ist: string;
  order_id: string;
  job_name: string;
  machine_id: string;
  station_id: string;
  is_active: boolean;
  is_restart: boolean;
  active_kwh: number;
  tod_rate_inr: number;
  cost_inr: number;
  station_wbgt_c: number;
  iso_limit_c: number;
  thermal_margin_c: number;
  is_heat_buffer: boolean;
}

export interface HeatBuffer {
  buffer_id: string;
  station_id: string;
  day: number;
  start_slot: number;
  end_slot: number;
  duration_minutes: number;
  buffer_type: string;
  peak_ambient_wbgt_c: number;
  is_exhausted: boolean;
  remaining_capacity_minutes: number;
  absorbed_incident_ids: string[];
}

export interface KPISummary {
  total_cost_inr: number;
  total_kwh: number;
  total_restart_kwh: number;
  total_restarts: number;
  heat_breaches_count: number;
  output_percentage: number;
  co2_saved_tco2: number;
  cost_savings_inr: number;
  honest_co2_banner: string;
  is_simulated_estimate: boolean;
  ui_label: string;
}

export interface CitationItem {
  source_title: string;
  clause: string;
  uri?: string;
  snippet: string;
}

export interface SchedulePlanResponse {
  plan_id: string;
  parent_plan_id: string | null;
  created_at: string;
  trigger_type: string;
  solver_status: string;
  solve_time_sec: number;
  kpi: KPISummary;
  baseline_kpi: KPISummary | null;
  schedule_slots: ScheduleSlotAssignment[];
  heat_buffers: HeatBuffer[];
  gemini_explanation_text: string;
  citations: CitationItem[];
}

export interface ExtractedConstraint {
  constraint_id: string;
  station: string;
  work_class: number;
  acclimatised: boolean;
  wbgt_limit_c: number;
  frozen_window_hours: number;
  confidence: number;
  source: string;
}

export interface TariffPeriod {
  name: string;
  start_hour: number;
  end_hour: number;
  rate_inr_per_kwh: number;
  description: string;
}

export interface ExtractedConstraintJSON {
  constraints: ExtractedConstraint[];
  tariff_periods: TariffPeriod[];
  frozen_window_hours: number;
  gemini_model: string;
  extraction_timestamp: string;
}

export interface EmergencySOSResponse {
  event_id: string;
  station_id: string;
  is_zero_ai_bypass: boolean;
  status: string;
  machines_halted: string[];
  fcm_multicast_dispatched: boolean;
  supervisor_alerted: boolean;
  timestamp_ist: string;
}

export interface WorkerCheckInResponse {
  event_id: string;
  station_id: string;
  action_taken: string;
  rest_minutes_assigned: number;
  absorbed_by_buffer_id?: string | null;
  triggered_replan?: boolean;
  message_telugu: string;
  message_english: string;
}

export interface SupervisorDashboardResponse {
  plant_id: string;
  timestamp_ist: string;
  station_states: Record<string, any>;
  active_heat_buffers: HeatBuffer[];
  plan_kpis: KPISummary | null;
}
