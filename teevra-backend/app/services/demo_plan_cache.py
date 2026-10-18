"""Saved Monday and Tuesday plans.

A demo request for those exact order books returns the plan that was already solved.
Any other day, or an edited file, still goes through the solver.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import structlog

from app.models.domain import PlantOrder, PlanningConfigRequest
from app.models.safety import MachineFaultWebhookRequest
from app.models.schedule import SchedulePlanResponse

logger = structlog.get_logger(__name__)

_CACHE = Path(__file__).resolve().parent.parent / "data" / "demo_cache"
_TEMPLATES = {
    "day1_monday": ("monday", "Day 1 - Monday", "day1_monday_orders.csv"),
    "day2_tuesday": ("tuesday", "Day 2 - Tuesday", "day2_tuesday_orders.csv"),
}
_DATA = Path(__file__).resolve().parent.parent / "data"


@dataclass
class _SavedDay:
    day_id: str
    morning: SchedulePlanResponse
    breakdown: SchedulePlanResponse
    fingerprint: tuple
    machine_id: str
    fault_slot: int
    repair_duration_slots: int


_loaded = False
_days: dict[str, _SavedDay] = {}


def _fingerprint(orders: list[PlantOrder]) -> tuple:
    return tuple(
        (
            o.upload_batch_id,
            o.order_id,
            int(o.routing_seq),
            o.machine_id,
            o.station_id,
            o.job_name,
            int(o.duration_mins),
            round(float(o.kwh_per_op), 4),
            round(float(o.restart_kwh), 4),
            o.load_tag,
            bool(o.splittable),
            int(o.due_slot),
            bool(o.is_critical_melt),
        )
        for o in orders
    )


def _ensure() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    from app.routers.manager_router import parse_orders_csv

    for day_id, (prefix, folder, fname) in _TEMPLATES.items():
        morning_path = _CACHE / f"{prefix}_morning.json"
        broken_path = _CACHE / f"{prefix}_breakdown.json"
        key_path = _CACHE / f"{prefix}_breakdown_key.json"
        order_path = _DATA / folder / "Orders" / fname
        if not (morning_path.exists() and broken_path.exists() and key_path.exists() and order_path.exists()):
            continue
        try:
            morning = SchedulePlanResponse.model_validate_json(morning_path.read_text(encoding="utf-8"))
            breakdown = SchedulePlanResponse.model_validate_json(broken_path.read_text(encoding="utf-8"))
            key = json.loads(key_path.read_text(encoding="utf-8"))
            orders = parse_orders_csv(order_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("demo_plan_cache_unreadable", day_id=day_id, error=str(exc))
            continue
        _days[day_id] = _SavedDay(
            day_id=day_id,
            morning=morning,
            breakdown=breakdown,
            fingerprint=_fingerprint(orders),
            machine_id=str(key["machine_id"]),
            fault_slot=int(key["fault_slot"]),
            repair_duration_slots=int(key["repair_duration_slots"]),
        )
        logger.info(
            "demo_plan_cache_ready",
            day_id=day_id,
            morning_plan_id=morning.plan_id,
            breakdown_plan_id=breakdown.plan_id,
        )


def _standard_request(config: PlanningConfigRequest) -> bool:
    return (
        config.horizon_hours == 48
        and config.slot_duration_minutes == 15
        and config.enforce_heat_safety
        and config.enforce_tariff_optimization
    )


def morning_plan(
    orders: list[PlantOrder],
    config: PlanningConfigRequest,
) -> SchedulePlanResponse | None:
    """The saved morning plan when this request is the Monday or Tuesday sample book."""
    if not _standard_request(config):
        return None
    _ensure()
    if not _days:
        return None
    wanted = _fingerprint(orders)
    match = next((day for day in _days.values() if day.fingerprint == wanted), None)
    if match is None and config.day_id in _days and not config.orders_csv:
        match = _days[config.day_id]
    if match is None:
        return None
    logger.info("demo_plan_cache_hit", kind="morning", day_id=match.day_id, plan_id=match.morning.plan_id)
    return match.morning.model_copy(deep=True)


def breakdown_plan(
    active_plan_id: str,
    req: MachineFaultWebhookRequest,
) -> SchedulePlanResponse | None:
    """The saved CNC 2 breakdown when the open plan is the saved Monday or Tuesday plan."""
    _ensure()
    for day in _days.values():
        same_fault = (
            req.machine_id == day.machine_id
            and req.fault_slot == day.fault_slot
            and req.repair_duration_slots == day.repair_duration_slots
        )
        same_plan = active_plan_id in {day.morning.plan_id, day.breakdown.plan_id}
        if same_fault and same_plan:
            logger.info(
                "demo_plan_cache_hit",
                kind="breakdown",
                day_id=day.day_id,
                plan_id=day.breakdown.plan_id,
            )
            return day.breakdown.model_copy(deep=True)
    return None
