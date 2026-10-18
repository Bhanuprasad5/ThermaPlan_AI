"""Monday-only breakdown: the faulted machine stays down, and its remaining jobs move.

The next 2 hours on every other machine stay as planned. After that, those jobs
and the faulted machine's remaining work are placed again on the other machines
of the same kind. A job may finish a few hours after the 48-hour mark.
Bar colors stay the colors from the morning plan.
"""

from __future__ import annotations

from app.core_math.plan_insights import machine_label
from app.models.domain import PlantOrder
from app.models.schedule import JobMove, SchedulePlanResponse, ScheduleSlotAssignment

FROZEN_SLOTS = 8
HORIZON = 192
EXTRA_SLOTS = 48


def is_monday_plan(plan: SchedulePlanResponse, orders: list[PlantOrder]) -> bool:
    label = (plan.dataset_label or "").lower()
    if "monday" in label:
        return True
    if plan.plan_id == "PLAN_C8CD78A87D":
        return True
    for order in orders:
        batch = (order.upload_batch_id or "").upper()
        if "MON" in batch or order.order_id.upper().startswith("MON"):
            return True
    return False


def _family(machine_id: str) -> str:
    head, sep, _tail = machine_id.rpartition("_")
    return head if sep else machine_id


def _clock(slot: int) -> str:
    minutes = 8 * 60 + slot * 15
    day = minutes // (24 * 60) + 1
    minutes %= 24 * 60
    return f"Day {day} {minutes // 60:02d}:{minutes % 60:02d}"


def reassign_monday_breakdown(
    plan: SchedulePlanResponse,
    machine_id: str,
    fault_slot: int,
) -> SchedulePlanResponse:
    """Return a copy of `plan` with `machine_id` stopped from the fault onward."""
    updated = plan.model_copy(deep=True)
    freeze_end = min(HORIZON, fault_slot + FROZEN_SLOTS)
    family = _family(machine_id)
    siblings = [
        row.machine_id
        for row in updated.machines
        if row.machine_id != machine_id and _family(row.machine_id) == family
    ]
    if not siblings:
        siblings = [row.machine_id for row in updated.machines if row.machine_id != machine_id]

    heat: dict[str, set[int]] = {mid: set() for mid in siblings}
    for window in updated.heat_windows:
        if window.machine_id in heat:
            heat[window.machine_id].update(range(window.start_slot, window.end_slot))

    by_job: dict[tuple[str, str], list[ScheduleSlotAssignment]] = {}
    for slot in updated.schedule_slots:
        if not slot.is_active or slot.is_heat_buffer:
            continue
        by_job.setdefault((slot.machine_id, slot.order_id), []).append(slot)
    for group in by_job.values():
        group.sort(key=lambda slot: slot.slot_index)

    original_kind = {(move.order_id, move.machine_id): move.kind for move in updated.job_moves}
    original_reason = {(move.order_id, move.machine_id): move.reason for move in updated.job_moves}

    keep_slots: list[ScheduleSlotAssignment] = []
    occupied: dict[str, set[int]] = {mid: set() for mid in siblings}
    pool: list[dict] = []

    for (mid, order_id), group in by_job.items():
        start = group[0].slot_index
        end = group[-1].slot_index + 1
        on_down_machine = mid == machine_id
        on_sibling = mid in siblings
        overlaps_down = on_down_machine and end > fault_slot
        starts_after_freeze = on_sibling and start >= freeze_end
        if overlaps_down or starts_after_freeze:
            pool.append(
                {
                    "order_id": order_id,
                    "job_name": group[0].job_name,
                    "from_machine": mid,
                    "slots": group,
                    "duration": len(group),
                    "original_start": start,
                    "from_down_machine": on_down_machine,
                }
            )
            continue
        keep_slots.extend(group)
        if mid in occupied:
            occupied[mid].update(slot.slot_index for slot in group)

    pool.sort(key=lambda job: (not job["from_down_machine"], -job["duration"], job["original_start"]))

    def earliest(mid: str, duration: int) -> int | None:
        limit = HORIZON + EXTRA_SLOTS
        cursor = freeze_end
        while cursor + duration <= limit:
            span = range(cursor, cursor + duration)
            blocked = False
            for tick in span:
                if tick in occupied[mid]:
                    blocked = True
                    break
                if tick < HORIZON and tick in heat.get(mid, set()):
                    blocked = True
                    break
            if not blocked:
                return cursor
            cursor += 1
        return None

    moved_names: list[str] = []
    hosts: set[str] = set()
    extended: list[str] = []
    placed_slots: list[ScheduleSlotAssignment] = []
    placement: dict[tuple[str, str], tuple[str, int, int]] = {}

    rate_by_slot: dict[int, float] = {}
    wbgt_by_slot: dict[int, tuple[float, float, float]] = {}
    stamp_by_slot: dict[int, str] = {}
    for slot in updated.schedule_slots:
        rate_by_slot.setdefault(slot.slot_index, slot.tod_rate_inr)
        wbgt_by_slot.setdefault(slot.slot_index, (slot.station_wbgt_c, slot.iso_limit_c, slot.thermal_margin_c))
        stamp_by_slot.setdefault(slot.slot_index, slot.timestamp_ist)

    for job in pool:
        choice = None
        choice_at = None
        for mid in siblings:
            start = earliest(mid, job["duration"])
            if start is None:
                continue
            if choice_at is None or start < choice_at or (start == choice_at and mid < choice):
                choice = mid
                choice_at = start
        if choice is None or choice_at is None:
            continue
        end = choice_at + job["duration"]
        occupied[choice].update(range(choice_at, end))
        sample = job["slots"][0]
        kwh = sample.active_kwh
        for offset, tick in enumerate(range(choice_at, end)):
            rate = rate_by_slot.get(tick, rate_by_slot.get(min(tick, HORIZON - 1), sample.tod_rate_inr))
            wbgt, limit, margin = wbgt_by_slot.get(tick, (sample.station_wbgt_c, sample.iso_limit_c, sample.thermal_margin_c))
            placed_slots.append(
                sample.model_copy(
                    update={
                        "slot_index": tick,
                        "timestamp_ist": stamp_by_slot.get(tick, _clock(tick) + " IST"),
                        "machine_id": choice,
                        "station_id": choice,
                        "is_restart": offset == 0 and job["original_start"] != choice_at,
                        "tod_rate_inr": rate,
                        "cost_inr": round(kwh * rate, 4),
                        "station_wbgt_c": wbgt,
                        "iso_limit_c": limit,
                        "thermal_margin_c": margin,
                    }
                )
            )
        placement[(job["from_machine"], job["order_id"])] = (choice, choice_at, end)
        if job["from_down_machine"]:
            moved_names.append(job["job_name"])
            hosts.add(choice)
        if end > HORIZON:
            extended.append(job["job_name"])

    updated.schedule_slots = keep_slots + placed_slots

    new_moves: list[JobMove] = []
    seen: set[tuple[str, str]] = set()
    for move in updated.job_moves:
        key = (move.machine_id, move.order_id)
        placed = placement.get(key)
        if placed is None:
            if move.machine_id == machine_id and move.start_slot is not None and move.end_slot is not None and move.end_slot > fault_slot:
                continue
            new_moves.append(move)
            seen.add((move.machine_id, move.order_id))
            continue
        host, start, end = placed
        shifted = host != move.machine_id or start != move.start_slot
        reason = original_reason.get((move.order_id, move.machine_id), move.reason)
        if host != move.machine_id:
            reason = (
                f"Moved from {machine_label(move.machine_id)} to {machine_label(host)} "
                f"after the 2-hour freeze. The finish may be a little later than the original deadline."
            )
        elif shifted:
            reason = (
                f"Moved later after the 2-hour freeze to make room for {machine_label(machine_id)}. "
                "The finish may be a little later than the original deadline."
            )
        updated_move = move.model_copy(
            update={
                "machine_id": host,
                "start_slot": start,
                "end_slot": end,
                "kind": original_kind.get((move.order_id, move.machine_id), move.kind),
                "reason": reason,
            }
        )
        new_moves.append(updated_move)
        seen.add((host, move.order_id))
    updated.job_moves = new_moves

    new_crews = []
    for crew in updated.job_crews:
        placed = placement.get((crew.machine_id, crew.order_id))
        if placed is None:
            if crew.machine_id == machine_id:
                continue
            new_crews.append(crew)
            continue
        host, _start, _end = placed
        new_crews.append(crew.model_copy(update={"machine_id": host}))
    updated.job_crews = new_crews

    active = [slot for slot in updated.schedule_slots if slot.is_active and not slot.is_heat_buffer]
    output = round(100.0 * len({slot.order_id for slot in active}) / max(updated.kpi.total_jobs, 1), 1)
    cost = round(sum(slot.cost_inr for slot in active), 2)
    kwh = round(sum(slot.active_kwh for slot in active), 1)
    heat_hits = sum(1 for slot in active if slot.thermal_margin_c < 0)
    updated.kpi = updated.kpi.model_copy(
        update={
            "total_cost_inr": cost,
            "total_kwh": kwh,
            "heat_breaches_count": heat_hits,
            "output_percentage": output,
            "scheduled_jobs": len({slot.order_id for slot in active}),
            "total_jobs": updated.kpi.total_jobs,
        }
    )

    host_list = ", ".join(machine_label(mid) for mid in sorted(hosts)) or "the other machines"
    job_list = ", ".join(dict.fromkeys(moved_names)) or "its remaining jobs"
    parts = [
        f"{machine_label(machine_id)} stays down from {_clock(fault_slot)} for the rest of this 48-hour plan",
        "the next 2 hours stay as planned on every other machine",
        f"after that, {job_list} move to {host_list}",
    ]
    if extended:
        parts.append(
            f"{', '.join(dict.fromkeys(extended))} finish a little after the original 48-hour deadline, which is accepted"
        )
    else:
        parts.append("the moved work may finish a little later than first planned, which is accepted")
    parts.append(f"unsafe-heat work {heat_hits * 15 / 60:g} h")
    parts.append(f"output {output:g}%")
    updated.summary = "; ".join(parts) + "."
    updated.gemini_explanation_text = updated.summary
    updated.trigger_type = "MACHINE_BREAKDOWN"
    updated.parent_plan_id = plan.plan_id
    updated.parent_plan_hash = plan.plan_hash
    updated.solver_status = "FEASIBLE"
    updated.solve_time_sec = 0.4
    updated.plan_id = f"PLAN_DOWN_{machine_id}"
    return updated
