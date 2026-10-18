"""
Explains a solved plan in terms a planner can check on the Gantt:
machine rows, heat windows, tariff bands and why each job moved.
Every value here is read from the solver output; nothing is estimated.
"""
from typing import TYPE_CHECKING

from app.core_math.wbgt_calculator import get_iso_limit
from app.models.schedule import (
    HeatWindow,
    JobMove,
    MachineRow,
    SchedulePlanResponse,
    ScheduleSlotAssignment,
    TariffBand,
)

if TYPE_CHECKING:
    from app.core_math.ortools_solver import TeevraCPSATScheduler

MACHINE_LABELS = {
    "FURNACE_1": "Furnace 1",
    "FURNACE_2": "Furnace 2",
    "FURNACE_3": "Furnace 3",
    "CNC_1": "CNC 1",
    "CNC_2": "CNC 2",
    "CNC_3": "CNC 3",
    "CNC_4": "CNC 4",
    "CNC_5": "CNC 5",
    "OVEN_1": "Paint oven",
    "OVEN_2": "Powder oven",
    "CHILLER_1": "Chiller",
    "COMP_1": "Compressor",
}
MACHINE_ORDER = list(MACHINE_LABELS)


def machine_label(machine_id: str) -> str:
    return MACHINE_LABELS.get(machine_id, machine_id.replace("_", " ").title())


def slot_clock(t: int, slot_minutes: int) -> str:
    mins = t * slot_minutes
    return f"Day {mins // 1440 + 1} {(mins // 60) % 24:02d}:{mins % 60:02d}"


def _ranges(slots: set[int]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for t in sorted(slots):
        if out and out[-1][1] == t:
            out[-1] = (out[-1][0], t + 1)
        else:
            out.append((t, t + 1))
    return out


def _job_spans(slots: list[ScheduleSlotAssignment]) -> dict[str, dict]:
    spans: dict[str, dict] = {}
    for s in slots:
        if not s.is_active or s.is_heat_buffer:
            continue
        span = spans.setdefault(
            f"{s.order_id}|{s.machine_id}",
            {"name": s.job_name, "machine": s.machine_id, "slots": [], "cost": 0.0},
        )
        span["slots"].append(s.slot_index)
        span["cost"] += s.cost_inr
    return spans


def build_plan_views(
    scheduler: "TeevraCPSATScheduler",
    baseline: SchedulePlanResponse,
    optimized: SchedulePlanResponse,
) -> None:
    """Fills machines, heat_windows, tariff_bands, job_moves and baseline_schedule_slots on `optimized`."""
    slot_minutes = scheduler.slot_duration_minutes

    machine_station: dict[str, str] = {}
    for job in scheduler.orders:
        machine_station.setdefault(job.machine_id, job.station_id)
    machine_ids = sorted(
        machine_station,
        key=lambda m: (MACHINE_ORDER.index(m) if m in MACHINE_ORDER else len(MACHINE_ORDER), m),
    )

    machines: list[MachineRow] = []
    heat_windows: list[HeatWindow] = []
    blocked_by_machine: dict[str, set[int]] = {}
    for m in machine_ids:
        station = machine_station[m]
        roster = scheduler.rosters.get(station)
        work_class = roster.work_class if roster else 1
        limit_c = get_iso_limit(work_class, roster.acclimatised if roster else True)[0]
        machines.append(
            MachineRow(machine_id=m, station_id=station, label=machine_label(m), work_class=work_class, limit_c=limit_c)
        )
        blocked = scheduler.blocked_slots(station)
        blocked_by_machine[m] = blocked
        for start, end in _ranges(blocked):
            peak = max(
                scheduler.thermal_matrix.get((station, t), {}).get("station_wbgt_c", 0.0)
                for t in range(start, end)
            )
            heat_windows.append(
                HeatWindow(
                    machine_id=m,
                    station_id=station,
                    start_slot=start,
                    end_slot=end,
                    peak_wbgt_c=round(peak, 1),
                    limit_c=limit_c,
                )
            )

    tariff_bands: list[TariffBand] = []
    for t, rate in enumerate(scheduler.slot_rates):
        label = "Solar" if rate < 7.5 else ("Peak" if rate > 7.5 else "Normal")
        if tariff_bands and tariff_bands[-1].rate_inr == rate and tariff_bands[-1].end_slot == t:
            tariff_bands[-1].end_slot = t + 1
        else:
            tariff_bands.append(TariffBand(start_slot=t, end_slot=t + 1, rate_inr=rate, label=label))

    base_spans = _job_spans(baseline.schedule_slots)
    opt_spans = _job_spans(optimized.schedule_slots)
    moves: list[JobMove] = []
    for job in scheduler.orders:
        key = f"{job.order_id}|{job.machine_id}"
        b = base_spans.get(key)
        o = opt_spans.get(key)
        blocked = blocked_by_machine.get(job.machine_id, set())
        move = JobMove(order_id=job.order_id, job_name=job.job_name, machine_id=job.machine_id)
        if b:
            move.baseline_start_slot = min(b["slots"])
            move.baseline_end_slot = max(b["slots"]) + 1
            move.baseline_cost_inr = round(b["cost"], 2)
            move.baseline_heat_slots = sum(1 for t in b["slots"] if t in blocked)
        if o:
            move.start_slot = min(o["slots"])
            move.end_slot = max(o["slots"]) + 1
            move.cost_inr = round(o["cost"], 2)
            move.heat_slots = sum(1 for t in o["slots"] if t in blocked)

        if not o:
            move.kind = "dropped"
            move.reason = "Could not be placed without breaking a heat, machine or due-time rule."
        elif not b or sorted(b["slots"]) == sorted(o["slots"]):
            move.kind = "unchanged"
            move.reason = "Kept at its earliest safe time."
        elif move.baseline_heat_slots > 0 and move.heat_slots == 0:
            hours = move.baseline_heat_slots * slot_minutes / 60
            move.kind = "heat"
            move.reason = (
                f"Moved out of {hours:g} h of unsafe heat. "
                f"Crew limit {machines[machine_ids.index(job.machine_id)].limit_c:g}°C."
            )
        elif move.cost_inr < move.baseline_cost_inr - 0.005:
            move.kind = "tariff"
            move.reason = f"Moved to cheaper power. Saves ₹{move.baseline_cost_inr - move.cost_inr:,.0f}."
        else:
            move.kind = "machine"
            move.reason = f"Shifted to make room on {machine_label(job.machine_id)}."
        moves.append(move)

    optimized.slot_minutes = slot_minutes
    optimized.horizon_hours = scheduler.horizon_hours
    optimized.machines = machines
    optimized.heat_windows = heat_windows
    optimized.tariff_bands = tariff_bands
    optimized.job_moves = moves
    optimized.baseline_schedule_slots = [s for s in baseline.schedule_slots if s.is_active]


def build_summary(plan: SchedulePlanResponse) -> str:
    """One plain sentence built only from the plan's own numbers."""
    k, b = plan.kpi, plan.baseline_kpi
    moved_heat = sum(1 for m in plan.job_moves if m.kind == "heat")
    moved_tariff = sum(1 for m in plan.job_moves if m.kind == "tariff")
    hours = lambda n: f"{n * (plan.slot_minutes or 15) / 60:g} h"  # noqa: E731
    parts = []
    if b:
        saved = b.total_cost_inr - k.total_cost_inr
        pct = saved / b.total_cost_inr * 100 if b.total_cost_inr else 0.0
        parts.append(f"Saves ₹{saved:,.0f} ({pct:.1f}%)")
        parts.append(f"unsafe-heat work {hours(b.heat_breaches_count)} → {hours(k.heat_breaches_count)}")
    if moved_heat:
        parts.append(f"{moved_heat} job{'s' if moved_heat > 1 else ''} moved out of the heat")
    if moved_tariff:
        parts.append(f"{moved_tariff} moved to cheaper power")
    if k.energy_delta_kwh > 0.01:
        parts.append(f"uses {k.energy_delta_kwh:,.0f} kWh more")
    elif k.energy_delta_kwh < -0.01:
        parts.append(f"uses {-k.energy_delta_kwh:,.0f} kWh less")
    else:
        parts.append("same energy")
    parts.append(f"output {k.output_percentage:g}%")
    return "; ".join(parts) + "."
