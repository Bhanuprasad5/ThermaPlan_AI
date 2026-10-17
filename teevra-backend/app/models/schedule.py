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


class SchedulePlanResponse(BaseModel):
    plan_id: str
    parent_plan_id: str | None = None
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
    citations: list[CitationItem] = Field(default_factory=list)
