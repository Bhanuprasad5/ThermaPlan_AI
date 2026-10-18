"""
Assign the day roster onto a solved plan. This is not part of the CP-SAT model.
Each person is on one shift. Hours are the overlap between that shift and the jobs
they are listed on, per operational day.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

from app.core_math.carbon_tariff_calc import hour_from_slot, operational_day
from app.models.domain import PlantOrder, WeatherSlot
from app.models.schedule import CrewMember, CrewSummary, JobCrew, SchedulePlanResponse

_DATA = Path(__file__).resolve().parent.parent / "data"
_ROSTER_FILES = {
    "MON": "Day 1 - Monday/Worker_Rosters/day1_monday_workers_roster_260.csv",
    "TUE": "Day 2 - Tuesday/Worker_Rosters/day2_tuesday_workers_roster_255.csv",
    "WED": "Day 3 - Wednesday/Worker_Rosters/day3_wednesday_workers_roster_265.csv",
    "THU": "Day 4 - Thursday/Worker_Rosters/day4_thursday_workers_roster_258.csv",
    "FRI": "Day 5 - Friday/Worker_Rosters/day5_friday_workers_roster_270.csv",
}
_PLANT_MACHINES = 16


def _day_token(orders: list[PlantOrder]) -> str:
    blob = " ".join(o.upload_batch_id for o in orders).upper()
    for token in ("FRI", "THU", "WED", "TUE", "MON"):
        if token in blob:
            return token
    return "MON"


def _shift_for_hour(hour: int) -> str:
    if 8 <= hour < 16:
        return "A"
    if hour >= 16:
        return "B"
    return "C"


def _tag(role: str, heat_class: int) -> str:
    role_l = role.strip().lower()
    if "relief" in role_l:
        return "Relief"
    if role_l == "supervisor":
        return "Qualified"
    if heat_class >= 2:
        return "Heavy"
    return "Light"


def _heat_class(label: str) -> int:
    text = label.lower()
    for n in (0, 1, 2, 3, 4):
        if f"class {n}" in text or f"class{n}" in text:
            return n
    return 1


def load_day_roster(orders: list[PlantOrder]) -> list[dict[str, str]]:
    path = _DATA / _ROSTER_FILES[_day_token(orders)]
    if not path.is_file():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _weather_wbgt(weather: list[WeatherSlot], slot_index: int, slot_minutes: int) -> float:
    if not weather:
        return 0.0
    w_idx = min(len(weather) - 1, int(slot_index * slot_minutes / 15))
    by_index = {w.slot_index: w for w in weather}
    w = by_index.get(w_idx) or weather[w_idx]
    return round(0.7 * w.natural_wet_bulb_c + 0.3 * w.ambient_globe_temp_c, 2)


def attach_crew(
    plan: SchedulePlanResponse,
    orders: list[PlantOrder],
    weather: list[WeatherSlot],
    slot_minutes: int = 15,
) -> None:
    """Fill job_crews and crew_summary from the shipped day roster."""
    roster = load_day_roster(orders)
    by_machine_shift: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in roster:
        machine = (row.get("assigned_machine_id") or "").strip()
        shift = (row.get("shift_code") or "").strip().upper()
        if not shift:
            label = (row.get("shift_schedule") or "")
            if "08:00" in label and "16:00" in label:
                shift = "A"
            elif "16:00" in label:
                shift = "B"
            else:
                shift = "C"
        by_machine_shift[(machine, shift)].append(row)

    orders_by_key = {(o.order_id, o.machine_id): o for o in orders}
    slots_by_job: dict[tuple[str, str], list[int]] = defaultdict(list)
    machines_used: set[str] = set()
    for slot in plan.schedule_slots:
        if not slot.is_active or slot.is_heat_buffer:
            continue
        slots_by_job[(slot.order_id, slot.machine_id)].append(slot.slot_index)
        machines_used.add(slot.machine_id)

    hours_by_worker_day: dict[tuple[str, int], float] = defaultdict(float)
    job_crews: list[JobCrew] = []

    for (order_id, machine_id), slots in sorted(slots_by_job.items()):
        groups: dict[tuple[int, str], list[int]] = defaultdict(list)
        for t in slots:
            groups[(operational_day(t, slot_minutes), _shift_for_hour(hour_from_slot(t, slot_minutes)))].append(t)
        day, shift = max(groups, key=lambda k: (len(groups[k]), -k[0], k[1]))
        overlap_h = len(groups[(day, shift)]) * slot_minutes / 60
        crew_rows = by_machine_shift.get((machine_id, shift), [])
        members: list[CrewMember] = []
        supervisor = ""
        for row in crew_rows:
            role = (row.get("role_title") or "Operator").strip()
            heat = _heat_class(row.get("heat_metabolic_class") or "")
            name = (row.get("full_name") or row.get("worker_id") or "").strip()
            members.append(CrewMember(name=name, role=role, heat_class=heat, tag=_tag(role, heat)))
            if role.lower() == "supervisor" and not supervisor:
                supervisor = name
            hours_by_worker_day[(row.get("worker_id") or name, day)] += overlap_h
        if not supervisor and members:
            supervisor = members[0].name
        order = orders_by_key.get((order_id, machine_id))
        start = min(slots)
        job_crews.append(
            JobCrew(
                machine_id=machine_id,
                order_id=order_id,
                job_name=order.job_name if order else order_id,
                load_tag=order.load_tag if order else "shiftable",
                expected_wbgt_c=_weather_wbgt(weather, start, slot_minutes),
                supervisor=supervisor,
                members=members,
            )
        )

    per_day_hours = [h for h in hours_by_worker_day.values() if h > 0]
    assigned_ids = {wid for (wid, _day), h in hours_by_worker_day.items() if h > 0}
    machine_hours = sum(len(s) for s in slots_by_job.values()) * slot_minutes / 60
    roster_machines = { (r.get("assigned_machine_id") or "").strip() for r in roster }
    roster_machines.discard("")
    plan.job_crews = job_crews
    plan.crew_summary = CrewSummary(
        workers_on_roster=len(roster),
        workers_assigned=len(assigned_ids),
        avg_hours=round(sum(per_day_hours) / len(per_day_hours), 2) if per_day_hours else 0.0,
        machines_used=len(machines_used),
        machines_total=len(roster_machines) or _PLANT_MACHINES,
        machine_hours=round(machine_hours, 2),
    )
