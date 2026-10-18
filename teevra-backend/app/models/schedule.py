"""
Models for Solved 192-Slot Schedules, Heat Buffers, and KPI Comparative Summaries.
"""

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field


class ScheduleSlotAssignment(BaseModel):
    slot_index: int = Field(ge=0)
    timestamp_ist: str
    order_id: str
    job_name: str
    machine_id: str
    station_id: str
    is_active: bool = True
    is_restart: bool = False
    active_kwh: float
    tod_rate_inr: float
    cost_inr: float
    station_wbgt_c: float
    iso_limit_c: float
    thermal_margin_c: float  # iso_limit - station_wbgt; must be >= 0 for safety
    is_heat_buffer: bool = False


class HeatBuffer(BaseModel):
    buffer_id: str
    station_id: str
    day: int = Field(ge=1)
    start_slot: int = Field(ge=0)
    end_slot: int = Field(ge=0)
    duration_minutes: int  # 30 to 60 mins (2 to 4 slots)
    buffer_type: Literal["30_MIN", "45_MIN", "60_MIN"]
    peak_ambient_wbgt_c: float
    is_exhausted: bool = False
    remaining_capacity_minutes: int
    absorbed_incident_ids: list[str] = Field(default_factory=list)


class KPISummary(BaseModel):
    total_cost_inr: float
    total_kwh: float
    total_restart_kwh: float
    total_restarts: int
    heat_breaches_count: int
    output_percentage: float
    co2_saved_tco2: float
    cost_savings_inr: float = 0.0
    # Signed: optimized minus baseline. Positive means the plan uses more energy.
    energy_delta_kwh: float = 0.0
    co2_delta_tco2: float = 0.0
    scheduled_jobs: int = 0
    total_jobs: int = 0
    honest_co2_banner: str = (
        "Time-shifting saves rupees, not CO2, at an annual average grid factor."
    )
    is_simulated_estimate: bool = True
    ui_label: str = "ISO 7243 screening check: exceedance triggers further action"


class CitationItem(BaseModel):
    source_title: str
    clause: str
    uri: str | None = None
    snippet: str


class HeatWindow(BaseModel):
    """Slots a machine's crew may not work: screening WBGT above the ISO 7243 value, or the rest buffer."""
    machine_id: str
    station_id: str
    start_slot: int
    end_slot: int  # exclusive
    peak_wbgt_c: float
    limit_c: float


class TariffBand(BaseModel):
    start_slot: int
    end_slot: int  # exclusive
    rate_inr: float
    label: Literal["Solar", "Peak", "Normal"]


class MachineRow(BaseModel):
    machine_id: str
    station_id: str
    label: str
    work_class: int
    limit_c: float


class JobMove(BaseModel):
    order_id: str
    job_name: str
    machine_id: str
    baseline_start_slot: int | None = None
    baseline_end_slot: int | None = None
    start_slot: int | None = None
    end_slot: int | None = None
    baseline_cost_inr: float = 0.0
    cost_inr: float = 0.0
    baseline_heat_slots: int = 0
    heat_slots: int = 0
    kind: Literal["heat", "tariff", "machine", "due", "unchanged", "dropped"] = "unchanged"
    reason: str = ""


class ExplanationTrace(BaseModel):
    """How the plain-English summary was produced. Numbers come from the solver either way."""
    source: Literal["gemini", "template"]
    model: str | None = None
    model_version: str | None = None
    region: str | None = None
    latency_ms: int | None = None
    prompt_tokens: int | None = None
    output_tokens: int | None = None
    error: str | None = None


class SchedulePlanResponse(BaseModel):
    plan_id: str
    plan_hash: str = ""
    baseline_plan_hash: str | None = None
    solver_seed: int | None = None
    restart_cap: int | None = None
    restart_cap_relaxed: bool = False
    cea_factor_tco2_per_mwh: float | None = None
    parent_plan_id: str | None = None
    parent_plan_hash: str | None = None
    summary: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    trigger_type: Literal[
        "MORNING_PLAN", "MACHINE_BREAKDOWN", "SAFETY_SIGNAL", "HEAT_BUFFER_OVERFLOW"
    ]
    solver_status: str
    solve_time_sec: float
    kpi: KPISummary
    baseline_kpi: KPISummary | None = None
    schedule_slots: list[ScheduleSlotAssignment] = Field(default_factory=list)
    heat_buffers: list[HeatBuffer] = Field(default_factory=list)
    gemini_explanation_text: str = ""
    explanation_trace: ExplanationTrace | None = None
    citations: list[CitationItem] = Field(default_factory=list)
    slot_minutes: int = 15
    horizon_hours: int = 48
    dataset_label: str = ""
    weather_source: str = ""
    baseline_schedule_slots: list[ScheduleSlotAssignment] = Field(default_factory=list)
    machines: list[MachineRow] = Field(default_factory=list)
    heat_windows: list[HeatWindow] = Field(default_factory=list)
    tariff_bands: list[TariffBand] = Field(default_factory=list)
    job_moves: list[JobMove] = Field(default_factory=list)
