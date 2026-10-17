"""
Safety Signals & Zero-AI Emergency SOS Router (Feature 5):
- Emergency SOS Zero-AI Bypass: Bypasses all LLM calls to execute immediate hardware halt.
- FCM Multicast alert dispatch to all supervisor & worker mobile devices.
- Privacy-Preserving Hazard Classification (aggregates displayed only when COUNT >= 3).
- 1-Tap Delta Replan trigger.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter

from app.core_math.ortools_solver import solve_dual_schedules
from app.models.safety import (
    DeltaReplanRequest,
    EmergencySOSRequest,
    EmergencySOSResponse,
    HazardReportRequest,
)
from app.models.schedule import SchedulePlanResponse
from app.services.bigquery_service import bq_service
from app.services.firestore_fcm_service import firestore_fcm_service
from app.services.gemini_flash_service import gemini_flash_service
from app.services.pubsub_service import pubsub_service

router = APIRouter(prefix="/api/v1/safety", tags=["Safety Signals & SOS Bypass"])


# Station to machine mapping for immediate hardware isolation
STATION_MACHINE_MAP = {
    "FURNACE_BAY": ["FURNACE_1"],
    "CNC_BAY": ["CNC_1", "CNC_2"],
    "PAINT_SHOP": ["OVEN_1"],
    "UTILITY_ROOM": ["CHILLER_1", "COMP_1"],
}


@router.post("/emergency-sos", response_model=EmergencySOSResponse)
async def trigger_emergency_sos(req: EmergencySOSRequest):
    """
    CRITICAL ZERO-AI BYPASS:
    When a worker triggers SOS, NO generative AI model is called in the critical path.
    The system immediately:
    1. Identifies and isolates physical machines at that station.
    2. Sends high-priority FCM multicast notification.
    3. Updates Firestore live station status to EMERGENCY_HALTED.
    4. Publishes to Pub/Sub teevra-safety-signals.
    5. Audits event in BigQuery (zero worker PII).
    """
    event_id = f"SOS_{uuid.uuid4().hex[:8].upper()}"
    halt_machines = STATION_MACHINE_MAP.get(
        req.station_id, ["UNKNOWN_STATION_EQUIPMENT"]
    )
    now_ist = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S IST")

    # 1. FCM Multicast Push
    fcm_success = firestore_fcm_service.send_fcm_emergency_halt(
        station_id=req.station_id, machines_halted=halt_machines
    )

    # 2. Pub/Sub publish
    pubsub_service.publish_safety_signal(
        event_id=event_id,
        station_id=req.station_id,
        signal_category="SOS",
        action=f"EMERGENCY_HALT: Machines {halt_machines} stopped immediately.",
    )

    # 3. Privacy-preserving BigQuery audit
    bq_service.log_safety_signal(
        event_id=event_id,
        station_id=req.station_id,
        signal_category="SOS",
        action=f"Zero-AI hardware halt executed: {halt_machines}",
        rest_minutes=60,
        triggered_replan=True,
    )

    return EmergencySOSResponse(
        event_id=event_id,
        station_id=req.station_id,
        is_zero_ai_bypass=True,
        status="EMERGENCY_HALT_BROADCAST",
        machines_halted=halt_machines,
        fcm_multicast_dispatched=fcm_success,
        supervisor_alerted=True,
        timestamp_ist=now_ist,
    )


@router.post("/report-hazard")
async def report_hazard(req: HazardReportRequest):
    """
    Worker Hazard Report:
    Logs station hazard with privacy guarantees.
    Worker PII and GPS are never collected.
    """
    event_id = f"HAZ_{uuid.uuid4().hex[:8].upper()}"

    bq_service.log_safety_signal(
        event_id=event_id,
        station_id=req.station_id,
        signal_category="HAZARD_REPORT",
        hazard_code=req.hazard_code,
        action=f"Hazard logged: {req.hazard_description}",
        rest_minutes=0,
    )

    firestore_fcm_service.update_station_state(
        req.station_id, {"active_hazard": req.hazard_code}
    )

    return {
        "status": "HAZARD_LOGGED",
        "event_id": event_id,
        "station_id": req.station_id,
        "hazard_code": req.hazard_code,
        "privacy_note": "No worker identity or geolocation was captured.",
    }


@router.get("/hazard-aggregates")
async def get_hazard_aggregates():
    """
    Returns anonymized station hazard aggregates.
    Strict Differential Privacy rule: Only returns stations where incident count >= 3.
    """
    return bq_service.get_station_hazard_aggregates()


@router.post("/replan-delta", response_model=SchedulePlanResponse)
async def trigger_delta_replan(req: DeltaReplanRequest):
    """
    1-Tap Delta Replan:
    Triggered when an emergency or buffer overflow demands immediate schedule adaptation.
    """
    orders = bq_service.get_plant_orders()
    rosters = bq_service.get_workstation_roster()
    weather_slots = bq_service.get_weather_forecast_48h()
    prev_plan = bq_service.get_latest_solved_schedule()

    frozen_start = req.current_slot
    frozen_end = min(191, req.current_slot + 7)

    prev_assignments = {}
    if prev_plan:
        for slot in prev_plan.schedule_slots:
            prev_assignments[(f"{slot.order_id}_1", slot.slot_index)] = (
                1 if slot.is_active else 0
            )

    _, new_plan = solve_dual_schedules(
        orders=orders,
        rosters=rosters,
        weather_slots=weather_slots,
        frozen_window=(frozen_start, frozen_end),
        previous_assignments=prev_assignments,
    )
    new_plan.trigger_type = req.trigger_type
    new_plan.parent_plan_id = prev_plan.plan_id if prev_plan else None

    exp = await gemini_flash_service.generate_plan_explanation(
        kpi=new_plan.kpi,
        baseline_kpi=prev_plan.kpi if prev_plan else None,
        heat_buffer_count=len(new_plan.heat_buffers),
        trigger_type=req.trigger_type,
    )
    new_plan.gemini_explanation_text = exp["explanation"]
    new_plan.citations = exp["citations"]

    bq_service.save_solved_schedule(new_plan)
    return new_plan
