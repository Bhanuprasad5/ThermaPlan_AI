"""
Strict JSON Schemas and Pydantic models for Gemini Function Calling extraction.
Neuro-symbolic bridge: AI extracts only structured parameters; all numbers are strictly evaluated deterministically.
"""

from typing import Literal

from pydantic import BaseModel, Field


class ShiftConstraintRule(BaseModel):
    shift_name: str
    start_hour: int = Field(ge=0, le=23)
    end_hour: int = Field(ge=0, le=23)
    max_consecutive_hours: int = 8
    mandatory_rest_minutes: int = 45


class MachineLockoutRule(BaseModel):
    machine_id: str
    lockout_start_slot: int = Field(ge=0, le=191)
    lockout_end_slot: int = Field(ge=0, le=191)
    reason: str


class OrderPriorityRule(BaseModel):
    order_id: str
    priority_level: Literal["HIGH", "MEDIUM", "LOW", "EMERGENCY"]
    hard_deadline_slot: int | None = Field(default=None, ge=0, le=191)


class WorkerReliefRule(BaseModel):
    station_id: str
    relief_operator_id: str
    max_continuous_minutes: int = 60
    relief_duration_minutes: int = 30


class ExtractedPlantConstraints(BaseModel):
    """Function Calling target schema for Gemini parsing natural language factory memos."""

    plant_name: str = "Telangana Heavy Metal Works"
    effective_date: str
    shift_rules: list[ShiftConstraintRule] = Field(default_factory=list)
    machine_lockouts: list[MachineLockoutRule] = Field(default_factory=list)
    order_priorities: list[OrderPriorityRule] = Field(default_factory=list)
    relief_assignments: list[WorkerReliefRule] = Field(default_factory=list)
    solar_peak_load_shifting_enabled: bool = True
    minimum_output_percentage: float = Field(default=98.0, ge=90.0, le=100.0)
    notes_or_caveats: str = ""


# Gemini Tool Declaration Schema in JSON-Schema format
EXTRACT_CONSTRAINTS_TOOL_SCHEMA = {
    "name": "extract_plant_constraints",
    "description": "Extract structured operational constraints, machine lockouts, order priorities, and relief rules from manager documents or notes.",
    "parameters": ExtractedPlantConstraints.model_json_schema(),
}
