"""Confirm Monday and Tuesday sample solves return from the saved plans."""

import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def post(path: str, body: dict) -> tuple[float, dict]:
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/v1" + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=30) as resp:
        plan = json.loads(resp.read().decode())
    return time.perf_counter() - started, plan


def check(prefix: str, csv_path: Path) -> None:
    csv = csv_path.read_text(encoding="utf-8")
    sec, plan = post(
        "/manager/solve-48h",
        {
            "horizon_hours": 48,
            "slot_duration_minutes": 15,
            "enforce_heat_safety": True,
            "enforce_tariff_optimization": True,
            "orders_csv": csv,
            "dataset_label": "Custom upload",
        },
    )
    print(
        f"{prefix}_CSV {sec:.2f}s {plan['plan_id']} {plan['solver_status']} "
        f"jobs={plan['kpi']['scheduled_jobs']}",
        flush=True,
    )
    sec2, broken = post(
        "/breakdown/trigger",
        {
            "machine_id": "CNC_2",
            "fault_slot": 30,
            "repair_duration_slots": 16,
            "reason": "CNC_2 spindle trip",
        },
    )
    print(
        f"{prefix}_BREAK {sec2:.2f}s {broken['plan_id']} {broken['trigger_type']} "
        f"parent={broken.get('parent_plan_id')}",
        flush=True,
    )


if __name__ == "__main__":
    check("MONDAY", ROOT / "app/data/Day 1 - Monday/Orders/day1_monday_orders.csv")
    check("TUESDAY", ROOT / "app/data/Day 2 - Tuesday/Orders/day2_tuesday_orders.csv")
