# TEEVRA Models Package

This package encapsulates the typed domain entities, strict JSON schemas for Gemini tool declarations, OR-Tools schedule matrices, and privacy-preserving safety models.

## Module Contracts

- `domain.py`:
  - `VersionedFactor`: Captures CEA grid factors, TGSPDCL ToD tariffs, and ISO 7243 thermal threshold records stored in BigQuery.
  - `PlantOrder`: Represents routing operations across machines with power draw (kWh/op), load flexibility tag (fixed/shiftable/interruptible), and restart penalties.
  - `WorkstationRoster`: Station metabolic workloads, clothing corrections, and relief assignments.
  - `WeatherSlot`: Hourly/15-minute weather slot parameters including wet bulb and globe temperatures.

- `constraints.py`:
  - `ExtractedPlantConstraints`: Strict Pydantic model and JSON-Schema definition passed to Vertex AI Gemini Function Calling.
  - Guarantees zero unvalidated numbers reach the solver.

- `schedule.py`:
  - `ScheduleSlotAssignment`: 192-slot resolution per machine/station with thermal margin and energy cost.
  - `HeatBuffer`: Dedicated 30-60 minute thermal buffers positioned in afternoon high-heat windows.
  - `KPISummary`: Financial, energy, carbon, and safety KPI comparisons against the unconstrained baseline.

- `safety.py`:
  - `WorkerCheckInRequest` & `WorkerCheckInResponse`: Micro-rest and recovery assignment absorbed by Heat Buffers.
  - `EmergencySOSRequest`: Zero-AI emergency halt bypass path.
  - Privacy guarantee: No worker PII or location tracking; station reports strictly anonymized.
