"""
Breakdown Rescheduler Router (Feature 3):
- Handles machine faults (e.g. CNC_1 spindle drive failure)
- Enforces 2-Hour Frozen Window (8 slots = 120 minutes) on healthy machines
- Re-routes interrupted jobs to compatible backup machines
- Validates schedule via Deterministic Safety Gate
"""

from fastapi import APIRouter, HTTPException

from app.core_math.ortools_solver import solve_dual_schedules
from app.core_math.safety_validator import validate_delta_replan_safety
from app.models.safety import MachineFaultWebhookRequest
from app.models.schedule import SchedulePlanResponse
from app.services.bigquery_service import bq_service
from app.services.firestore_fcm_service import firestore_fcm_service
from app.services.gemini_flash_service import gemini_flash_service
from app.services.pubsub_service import pubsub_service

router = APIRouter(prefix="/api/v1/breakdown", tags=["Breakdown Rescheduler"])


@router.post("/trigger", response_model=SchedulePlanResponse)
async def trigger_machine_breakdown(req: MachineFaultWebhookRequest):
    """
    Simulates or receives Pub/Sub machine fault webhook.
    Enforces:
    1. 2-Hour Frozen Window lock [fault_slot, fault_slot + 7] for all healthy lines.
    2. Faulted machine lockout for repair_duration_slots.
    3. Re-solving with zero heat breaches and preserved heat buffers.
    4. Deterministic Safety Gate validation.
    """
    # 1. Publish fault event to Pub/Sub
    pubsub_service.publish_machine_fault(
        machine_id=req.machine_id,
        fault_slot=req.fault_slot,
        repair_duration_slots=req.repair_duration_slots,
        reason=req.reason,
    )

    # 2. Update Firestore live machine state
    firestore_fcm_service.update_station_state(
        "CNC_BAY",
        {
            "status": "MACHINE_FAULT",
            "faulted_machine": req.machine_id,
            "fault_slot": req.fault_slot,
            "repair_slots": req.repair_duration_slots,
            "alert": f"CNC_1 FAULT: {req.reason}. 2-hour frozen window locked.",
        },
    )

    # 3. Retrieve active plan
    prev_plan = bq_service.get_latest_solved_schedule()
    orders = bq_service.get_plant_orders()
    rosters = bq_service.get_workstation_roster()
    weather_slots = bq_service.get_weather_forecast_48h()

    # Build previous assignment map for healthy frozen window lock
    prev_assignments: dict[tuple, int] = {}
    if prev_plan:
        for slot in prev_plan.schedule_slots:
            j_id = f"{slot.order_id}_1"
            prev_assignments[(j_id, slot.slot_index)] = 1 if slot.is_active else 0

    frozen_start = req.fault_slot
    frozen_end = min(191, req.fault_slot + 7)  # 8 slots = 120 minutes

    # Re-solve with frozen window constraints and faulted machine lockout
    baseline, new_plan = solve_dual_schedules(
        orders=orders,
        rosters=rosters,
        weather_slots=weather_slots,
        frozen_window=(frozen_start, frozen_end),
        previous_assignments=prev_assignments,
        faulted_machine_id=req.machine_id,
        fault_slot=req.fault_slot,
        repair_duration_slots=req.repair_duration_slots,
    )

    new_plan.trigger_type = "MACHINE_BREAKDOWN"
    new_plan.parent_plan_id = prev_plan.plan_id if prev_plan else None

    # 4. Deterministic Safety Gate validation
    if prev_plan:
        is_safe, safety_msg = validate_delta_replan_safety(
            previous_slots=prev_plan.schedule_slots, new_slots=new_plan.schedule_slots
        )
        if not is_safe:
            raise HTTPException(status_code=400, detail=safety_msg)

    # 5. Grounded Gemini explanation
    explanation_res = await gemini_flash_service.generate_plan_explanation(
        kpi=new_plan.kpi,
        baseline_kpi=prev_plan.kpi if prev_plan else None,
        heat_buffer_count=len(new_plan.heat_buffers),
        trigger_type=f"MACHINE_BREAKDOWN ({req.machine_id})",
    )
    new_plan.gemini_explanation_text = explanation_res["explanation"]
    new_plan.citations = explanation_res["citations"]

    bq_service.save_solved_schedule(new_plan)
    return new_plan
