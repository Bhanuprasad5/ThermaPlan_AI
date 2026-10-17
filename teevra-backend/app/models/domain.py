"""
Domain entities representing manufacturing orders, workstations, factors, and weather.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class VersionedFactor(BaseModel):
    factor_id: str
    regime: Literal["CEA", "TARIFF", "SAFETY_ISO_7243"]
    parameter_name: str
    numeric_value: float
    unit: str
    work_class: int | None = None
    acclimatised: bool | None = None
    tod_start_hour: int | None = None
    tod_end_hour: int | None = None
    tod_multiplier: float | None = None
    source_document: str
    source_clause: str
    effective_date: str | date = Field(default_factory=lambda: date.today().isoformat())


VALID_SLOT_MINUTES = [15, 30, 60, 90, 120, 150, 180]
SLOT_MINUTE_LABELS = {
    15: "15 minutes",
    30: "30 minutes",
    60: "1 hour",
    90: "1.5 hours",
    120: "2 hours",
    150: "2.5 hours",
    180: "3 hours",
}


class PlanningConfigRequest(BaseModel):
    horizon_hours: int = Field(
        default=48, ge=6, le=168, description="Planning forward horizon in hours (default: 48)"
    )
    slot_duration_minutes: int = Field(
        default=15, description="Slot resolution in minutes: 15, 30, 60, 90, 120, 150, 180"
    )
    enforce_heat_safety: bool = Field(default=True)
    enforce_tariff_optimization: bool = Field(default=True)

    @property
    def total_slots(self) -> int:
        return (self.horizon_hours * 60) // self.slot_duration_minutes

    @property
    def slot_label(self) -> str:
        return SLOT_MINUTE_LABELS.get(
            self.slot_duration_minutes, f"{self.slot_duration_minutes} minutes"
        )


class PlantOrder(BaseModel):
    upload_batch_id: str = "batch_default"
    order_id: str
    job_name: str
    machine_id: str
    station_id: str
    routing_seq: int = 1
    duration_mins: int
    duration_slots: int
    kwh_per_op: float
    restart_kwh: float = 0.0
    load_tag: Literal["fixed", "shiftable", "interruptible"]
    splittable: bool = False
    due_slot: int = 191
    is_critical_melt: bool = False


class WorkstationRoster(BaseModel):
    upload_batch_id: str = "batch_default"
    station_id: str
    station_name: str
    shift_id: str = "Shift_A"
    workers_assigned: int = 1
    work_class: int = Field(ge=0, le=4)
    metabolic_watts: int = 300
    acclimatised: bool = True
    clothing_adj_c: float = 0.0
    simulated_globe_uplift_c: float = 1.5
    has_qualified_relief: bool = False
    relief_operator_id: str | None = None


class WeatherSlot(BaseModel):
    forecast_id: str
    slot_index: int = Field(ge=0, le=191)
    timestamp_ist: str
    hour_of_day: int
    air_temp_c: float
    relative_humidity_pct: float
    natural_wet_bulb_c: float
    ambient_globe_temp_c: float
    is_solar_hour: bool
    is_peak_tariff_hour: bool
    source: Literal["OPEN_METEO_LIVE", "BIGQUERY_CACHED_FALLBACK"] = "OPEN_METEO_LIVE"


class WeatherSpikeRequest(BaseModel):
    slot_index: int = Field(ge=0, le=191, default=28)
    temp_spike_c: float = Field(default=3.2)
