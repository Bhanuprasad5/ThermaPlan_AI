/**
 * TypeScript mirror of teevra-backend Pydantic schedule models.
 * Numbers on the Gantt and Evals page come from these fields; nothing is invented here.
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
  energy_delta_kwh: number;
  co2_delta_tco2: number;
  scheduled_jobs: number;
  total_jobs: number;
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

export interface HeatWindow {
  machine_id: string;
  station_id: string;
  start_slot: number;
  end_slot: number;
  peak_wbgt_c: number;
  limit_c: number;
}

export interface TariffBand {
  start_slot: number;
  end_slot: number;
  rate_inr: number;
  label: 'Solar' | 'Peak' | 'Normal';
}

export interface MachineRow {
  machine_id: string;
  station_id: string;
  label: string;
  work_class: number;
  limit_c: number;
}

export interface JobMove {
  order_id: string;
  job_name: string;
  machine_id: string;
  baseline_start_slot: number | null;
  baseline_end_slot: number | null;
  start_slot: number | null;
  end_slot: number | null;
  baseline_cost_inr: number;
  cost_inr: number;
  baseline_heat_slots: number;
  heat_slots: number;
  kind: 'heat' | 'tariff' | 'machine' | 'due' | 'unchanged' | 'dropped';
  reason: string;
}

export interface ExplanationTrace {
  source: 'gemini' | 'template';
  model?: string | null;
  model_version?: string | null;
  region?: string | null;
  latency_ms?: number | null;
  prompt_tokens?: number | null;
  output_tokens?: number | null;
  error?: string | null;
}

export interface SchedulePlanResponse {
  plan_id: string;
  plan_hash: string;
  baseline_plan_hash?: string | null;
  solver_seed?: number | null;
  restart_cap?: number | null;
  restart_cap_relaxed?: boolean;
  cea_factor_tco2_per_mwh?: number | null;
  parent_plan_id: string | null;
  parent_plan_hash?: string | null;
  summary: string;
  created_at: string;
  trigger_type: string;
  solver_status: string;
  solve_time_sec: number;
  kpi: KPISummary;
  baseline_kpi: KPISummary | null;
  schedule_slots: ScheduleSlotAssignment[];
  heat_buffers: HeatBuffer[];
  gemini_explanation_text: string;
  explanation_trace?: ExplanationTrace | null;
  citations: CitationItem[];
  slot_minutes: number;
  horizon_hours: number;
  dataset_label: string;
  weather_source: string;
  baseline_schedule_slots: ScheduleSlotAssignment[];
  machines: MachineRow[];
  heat_windows: HeatWindow[];
  tariff_bands: TariffBand[];
  job_moves: JobMove[];
}

export interface EvalsKpiRow {
  cost_inr: number;
  kwh: number;
  heat_breach_slots: number;
  restarts: number;
  output_pct: number;
}

export interface EvalsSummary {
  runs: number;
  baseline: EvalsKpiRow;
  optimized: EvalsKpiRow;
  avg_saving_inr: number;
  avg_saving_pct: number;
  total_saving_inr: number;
  datasets: Array<{
    dataset: string;
    runs: number;
    same_plan_every_run: boolean;
    baseline_cost_inr: number;
    optimized_cost_inr: number;
  }>;
  recent: Array<{
    plan_id: string;
    plan_hash: string;
    trigger: string;
    dataset: string;
    at_ist: string;
    solve_sec: number;
    baseline: EvalsKpiRow;
    optimized: EvalsKpiRow;
  }>;
}

export interface ExtractedConstraintJSON {
  constraints: Array<Record<string, unknown>>;
  tariff_periods: Array<Record<string, unknown>>;
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
  station_states: Record<string, unknown>;
  active_heat_buffers: HeatBuffer[];
  plan_kpis: KPISummary | null;
}
