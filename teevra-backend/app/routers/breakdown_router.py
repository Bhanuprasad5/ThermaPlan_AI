"""
Breakdown Rescheduler Router (Feature 3):
- Replans the plan currently in use when a machine faults
- Healthy machines keep their work for the next 2 hours (frozen window)
- The faulted machine is locked for the repair time
- The replan is rejected if it adds heat breaches (deterministic safety gate)
"""

import asyncio

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.core_math.ortools_solver import _job_key, solve_dual_schedules
from app.core_math.plan_insights import machine_label, slot_clock
from app.core_math.safety_validator import validate_delta_replan_safety
from app.models.safety import MachineFaultWebhookRequest
from app.models.schedule import SchedulePlanResponse
from app.services.bigquery_service import bq_service
from app.services.firestore_fcm_service import firestore_fcm_service
from app.services.gemini_flash_service import OFFICIAL_CITATIONS
from app.services.pubsub_service import pubsub_service
from app.services.run_history import ActiveContext, run_history

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/v1/breakdown", tags=["Breakdown Rescheduler"])

FROZEN_SLOTS = 8  # 2 hours at 15-minute slots


@router.post("/trigger", response_model=SchedulePlanResponse)
async def trigger_machine_breakdown(req: MachineFaultWebhookRequest, background_tasks: BackgroundTasks):
    ctx = run_history.active
    if ctx is None:
        raise HTTPException(status_code=409, detail="No plan is active yet. Run the morning plan first.")
    if req.machine_id not in {o.machine_id for o in ctx.orders}:
        raise HTTPException(status_code=400, detail=f"{req.machine_id} has no work in the active plan.")

    prev_plan = ctx.plan
    seq_by_job = {(o.order_id, o.machine_id): _job_key(o) for o in ctx.orders}
    prev_assignments: dict[tuple[str, int], int] = {}
    for slot in prev_plan.schedule_slots:
        if slot.is_active and not slot.is_heat_buffer:
            jid = seq_by_job.get((slot.order_id, slot.machine_id))
            if jid:
                prev_assignments[(jid, slot.slot_index)] = 1

    frozen = (req.fault_slot, min(191, req.fault_slot + FROZEN_SLOTS - 1))
    _, new_plan = await asyncio.to_thread(
        solve_dual_schedules,
        orders=ctx.orders,
        rosters=ctx.rosters,
        weather_slots=ctx.weather,
        frozen_window=frozen,
        previous_assignments=prev_assignments,
        faulted_machine_id=req.machine_id,
        fault_slot=req.fault_slot,
        repair_duration_slots=req.repair_duration_slots,
    )

    is_safe, safety_msg = validate_delta_replan_safety(
        previous_slots=prev_plan.schedule_slots, new_slots=new_plan.schedule_slots
    )
    if not is_safe:
        raise HTTPException(status_code=422, detail=safety_msg)

    new_plan.trigger_type = "MACHINE_BREAKDOWN"
    new_plan.parent_plan_id = prev_plan.plan_id
    new_plan.parent_plan_hash = prev_plan.plan_hash
    new_plan.dataset_label = prev_plan.dataset_label
    # Compare the replan with the plan it replaces, not with the naive baseline.
    new_plan.baseline_kpi = prev_plan.kpi

    new_plan.baseline_schedule_slots = [s for s in prev_plan.schedule_slots if s.is_active]

    prev_moves = {(m.order_id, m.machine_id): m for m in prev_plan.job_moves}
    moved, dropped = [], []
    for m in new_plan.job_moves:
        p = prev_moves.get((m.order_id, m.machine_id))
        if p:
            m.baseline_start_slot, m.baseline_end_slot = p.start_slot, p.end_slot
            m.baseline_cost_inr, m.baseline_heat_slots = p.cost_inr, p.heat_slots
        if m.kind == "dropped":
            m.reason = "Cannot finish by its due time on this machine during the repair. Needs another machine or overtime."
            dropped.append(m)
            continue
        if p and p.start_slot == m.start_slot:
            m.kind, m.reason = "unchanged", "Kept as planned."
        else:
            m.kind = "machine"
            m.reason = f"Replanned around the {machine_label(req.machine_id)} breakdown."
            moved.append(m)
    repair_h = req.repair_duration_slots * 15 / 60
    parts = [
        f"{machine_label(req.machine_id)} down {repair_h:g} h from {slot_clock(req.fault_slot, 15)}",
        f"{len(moved)} job{'s' if len(moved) != 1 else ''} replanned",
        "other machines keep their next 2 h",
        f"unsafe-heat work {new_plan.kpi.heat_breaches_count * 15 / 60:g} h",
    ]
    if dropped:
        parts.append(f"{', '.join(m.job_name for m in dropped)} cannot meet its due time and needs a decision")
    else:
        delta = new_plan.kpi.total_cost_inr - prev_plan.kpi.total_cost_inr
        parts.append(f"bill {'+' if delta >= 0 else '−'}₹{abs(delta):,.0f} vs previous plan")
    parts.append(f"output {new_plan.kpi.output_percentage:g}%")
    new_plan.summary = "; ".join(parts) + "."

    new_plan.gemini_explanation_text = new_plan.summary
    new_plan.citations = OFFICIAL_CITATIONS

    run_history.set_active(ActiveContext(new_plan, ctx.orders, ctx.rosters, ctx.weather))
    run_history.record(new_plan)
    background_tasks.add_task(_publish, req, new_plan)
    return new_plan


def _publish(req: MachineFaultWebhookRequest, plan: SchedulePlanResponse) -> None:
    try:
        pubsub_service.publish_machine_fault(
            machine_id=req.machine_id,
            fault_slot=req.fault_slot,
            repair_duration_slots=req.repair_duration_slots,
            reason=req.reason,
        )
        firestore_fcm_service.update_station_state(
            req.machine_id,
            {"status": "MACHINE_FAULT", "fault_slot": req.fault_slot, "repair_slots": req.repair_duration_slots},
        )
        bq_service.save_solved_schedule(plan)
    except Exception as e:
        logger.warning("breakdown_publish_failed", error=str(e))
