"""Solve every demo day twice and independently re-check the optimized allocation.

Run: uv run python scripts/verify_days.py
"""
from __future__ import annotations

import glob
import sys
import time
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core_math.ortools_solver import TeevraCPSATScheduler, solve_dual_schedules  # noqa: E402
from app.core_math.plan_insights import slot_clock  # noqa: E402
from app.models.domain import PlantOrder  # noqa: E402
from app.routers.manager_router import DEFAULT_DEMO_ROSTERS  # noqa: E402
from app.services.weather_integrator import weather_integrator  # noqa: E402


def check_plan(orders, plan, weather) -> list[str]:
    problems: list[str] = []
    scheduler = TeevraCPSATScheduler(orders, DEFAULT_DEMO_ROSTERS, weather)
    by_job: dict[tuple[str, str], list[int]] = defaultdict(list)
    by_machine: dict[str, list[int]] = defaultdict(list)
    for s in plan.schedule_slots:
        if s.is_active:
            by_job[(s.order_id, s.machine_id)].append(s.slot_index)
            by_machine[s.machine_id].append(s.slot_index)

    for machine, slots in by_machine.items():
        if len(slots) != len(set(slots)):
            problems.append(f"{machine}: two jobs share a slot")

    for job in orders:
        slots = sorted(by_job.get((job.order_id, job.machine_id), []))
        if len(slots) != job.duration_slots:
            problems.append(f"{job.order_id}/{job.machine_id}: {len(slots)} slots, needs {job.duration_slots}")
            continue
        if not job.splittable and slots != list(range(slots[0], slots[0] + len(slots))):
            problems.append(f"{job.order_id}: non-interruptible job was split")
        unsafe = set(scheduler.blocked_slots(job.machine_id)) & set(slots)
        if unsafe:
            problems.append(f"{job.order_id}: runs in {len(unsafe)} unsafe-heat slots")
        if slots[-1] > job.due_slot:
            problems.append(f"{job.order_id}: finishes after its due time")

    seqs: dict[str, list[PlantOrder]] = defaultdict(list)
    for job in orders:
        seqs[job.order_id].append(job)
    for oid, steps in seqs.items():
        steps.sort(key=lambda o: o.routing_seq)
        for a, b in zip(steps, steps[1:]):
            a_end = max(by_job[(oid, a.machine_id)])
            b_start = min(by_job[(oid, b.machine_id)])
            if b_start <= a_end:
                problems.append(f"{oid}: step {b.routing_seq} starts before step {a.routing_seq} ends")
    return problems


def main() -> int:
    weather = weather_integrator._generate_synthetic_48h_baseline()
    failures = 0
    for path in sorted(glob.glob(str(ROOT / "app/data/Day */Orders/*.csv"))):
        orders = [PlantOrder(**r.to_dict()) for _, r in pd.read_csv(path).iterrows()]
        t0 = time.perf_counter()
        base, opt = solve_dual_schedules(orders, DEFAULT_DEMO_ROSTERS, weather)
        dt = time.perf_counter() - t0
        _, opt2 = solve_dual_schedules(orders, DEFAULT_DEMO_ROSTERS, weather)
        problems = check_plan(orders, opt, weather)
        if opt.plan_hash != opt2.plan_hash:
            problems.append("plan hash changed between identical runs")
        if opt.kpi.output_percentage < 100:
            problems.append(f"output {opt.kpi.output_percentage}%")
        if opt.kpi.total_cost_inr > base.kpi.total_cost_inr:
            problems.append("optimized plan costs more than baseline")
        failures += bool(problems)

        b, k = base.kpi, opt.kpi
        print(f"\n== {Path(path).name}  {opt.solver_status}  {dt:.1f}s  {opt.plan_id}  {'PASS' if not problems else 'FAIL'}")
        print(f"   baseline  Rs {b.total_cost_inr:>9,.0f}  {b.total_kwh:>6.0f} kWh  heat {b.heat_breaches_count}  restarts {b.total_restarts}")
        print(f"   optimized Rs {k.total_cost_inr:>9,.0f}  {k.total_kwh:>6.0f} kWh  heat {k.heat_breaches_count}  restarts {k.total_restarts}")
        print(f"   {opt.summary}")
        for m in opt.job_moves:
            bs = slot_clock(m.baseline_start_slot, 15) if m.baseline_start_slot is not None else "-"
            os_ = slot_clock(m.start_slot, 15) if m.start_slot is not None else "-"
            print(f"     {m.order_id:7} {m.machine_id:10} {bs:>12} -> {os_:>12}  {m.kind:9} {m.reason}")
        for p in problems:
            print(f"   !! {p}")
    print(f"\n{'ALL DAYS PASS' if not failures else f'{failures} day(s) FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
