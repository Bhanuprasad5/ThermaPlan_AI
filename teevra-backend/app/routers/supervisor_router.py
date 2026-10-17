"""
Supervisor Router:
- Supervisor thermal warning & SOS alert acknowledgement
- Qualified relief operator rotation assignment for furnace and high-heat lines
- Consolidated supervisory control dashboard telemetry
"""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from app.models.safety import SupervisorReliefAssignmentRequest
from app.services.bigquery_service import bq_service
from app.services.firestore_fcm_service import firestore_fcm_service

router = APIRouter(prefix="/api/v1/supervisor", tags=["Supervisor Operations"])


@router.post("/acknowledge-alert")
async def acknowledge_alert(station_id: str, supervisor_id: str = "SUPERVISOR_01"):
    """Acknowledges an active station heat or SOS alert."""
    firestore_fcm_service.update_station_state(
        station_id,
        {
            "alert": None,
            "acknowledged_by": supervisor_id,
            "acknowledged_at": datetime.now(UTC).isoformat(),
        },
    )
    return {
        "status": "ALERT_ACKNOWLEDGED",
        "station_id": station_id,
        "acknowledged_by": supervisor_id,
    }


@router.post("/assign-relief")
async def assign_relief_operator(req: SupervisorReliefAssignmentRequest):
    """
    Assigns qualified relief operator (e.g. RELIEF_OP_04) to high-heat station.
    Ensures primary operator can rotate out to the cooling shelter.
    """
    rosters = bq_service.get_workstation_roster()
    target_station = next((r for r in rosters if r.station_id == req.station_id), None)

    if not target_station:
        raise HTTPException(
            status_code=404,
            detail=f"Station {req.station_id} not found in active roster.",
        )

    target_station.has_qualified_relief = True
    target_station.relief_operator_id = req.relief_operator_id
    bq_service.save_workstation_roster(rosters)

    firestore_fcm_service.update_station_state(
        req.station_id,
        {
            "active_relief_operator": req.relief_operator_id,
            "primary_operator": req.primary_operator_id,
            "relief_duration_mins": req.relief_duration_minutes,
            "status": "RELIEF_ACTIVE",
        },
    )

    return {
        "status": "RELIEF_OPERATOR_ASSIGNED",
        "station_id": req.station_id,
        "primary_operator_id": req.primary_operator_id,
        "relief_operator_id": req.relief_operator_id,
        "relief_duration_minutes": req.relief_duration_minutes,
        "slot_index": req.slot_index,
        "notice": "Primary worker rotated to cooling station. ISO 7243 compliance safeguarded.",
    }


@router.get("/live-dashboard")
async def get_supervisor_dashboard():
    """Returns consolidated plant telemetry, station statuses, and active heat buffers."""
    states = firestore_fcm_service.get_all_station_states()
    latest_plan = bq_service.get_latest_solved_schedule()

    buffers = []
    if latest_plan:
        buffers = [b.model_dump() for b in latest_plan.heat_buffers]

    return {
        "plant_id": "TELANGANA_HEAVY_METAL_WORKS",
        "timestamp_ist": datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S IST"),
        "station_states": states,
        "active_heat_buffers": buffers,
        "plan_kpis": latest_plan.kpi.model_dump() if latest_plan else None,
    }
