"""
Privacy-Preserving Safety Models, Worker Check-ins, SOS Bypass, and Hazard Enums.
Zero worker PII or GPS coordinates are stored. Station aggregates only returned to UI when COUNT >= 3.
"""

from typing import Literal

from pydantic import BaseModel, Field


class WorkerCheckInRequest(BaseModel):
    station_id: str
    signal_category: Literal["CHECKIN_OK", "CHECKIN_TOO_HOT", "DIZZY"]
    reported_slot: int | None = Field(default=None, ge=0, le=191)
    notes: str | None = None


class WorkerCheckInResponse(BaseModel):
    event_id: str
    station_id: str
    action_taken: str
    rest_minutes_assigned: int
    absorbed_by_buffer_id: str | None = None
    triggered_replan: bool = False
    message_telugu: str
    message_english: str


class EmergencySOSRequest(BaseModel):
    station_id: str
    immediate_action: Literal["IMMEDIATE_STOP", "CALL_MEDIC", "STATION_EVACUATE"] = (
        "IMMEDIATE_STOP"
    )
    reason: str = "Worker severe heat distress or medical emergency"


class EmergencySOSResponse(BaseModel):
    event_id: str
    station_id: str
    is_zero_ai_bypass: bool = True
    status: str = "EMERGENCY_HALT_BROADCAST"
    machines_halted: list[str]
    fcm_multicast_dispatched: bool
    supervisor_alerted: bool
    timestamp_ist: str


class IncidentPhotoAlertRequest(BaseModel):
    image_id: Literal["slip", "smoke", "heat"]
    station_name: str = "Paint & Coating Line (Oven 1)"


class IncidentPhotoAlertResponse(BaseModel):
    image_id: str
    photo_label: str
    situation: str
    recommended_action: str
    gemini_model: str
    telegram_sent: bool
    telegram_message_id: int | None = None


class HazardReportRequest(BaseModel):
    station_id: str
    hazard_code: Literal[
        "HEAT_EXHAUSTION",
        "VENTILATION_FAILURE",
        "COOLING_LINE_LEAK",
        "EQUIPMENT_OVERHEAT",
        "OTHER",
    ]
    hazard_description: str


class SupervisorReliefAssignmentRequest(BaseModel):
    station_id: str
    primary_operator_id: str
    relief_operator_id: str
    relief_duration_minutes: int = 30
    slot_index: int = Field(ge=0, le=191)


class MachineFaultWebhookRequest(BaseModel):
    machine_id: str
    fault_slot: int = Field(ge=0, le=191)
    repair_duration_slots: int = Field(ge=1, le=96, default=16)  # 16 slots = 4 hours
    reason: str = "Spindle drive trip"


class DeltaReplanRequest(BaseModel):
    trigger_type: Literal[
        "MACHINE_BREAKDOWN", "SAFETY_SIGNAL", "HEAT_BUFFER_OVERFLOW", "WEATHER_SPIKE"
    ]
    affected_station_or_machine: str
    current_slot: int = Field(ge=0, le=191)
    extra_details: dict | None = None
