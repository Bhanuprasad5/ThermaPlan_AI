"""Solve Monday and Tuesday once, then the CNC 2 breakdown, and store the responses.

The running API does the solve. This script only saves what that API returns.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

API = "http://127.0.0.1:8000/api/v1"
OUT = Path(__file__).resolve().parent.parent / "app" / "data" / "demo_cache"
TIMEOUT_SEC = 240


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
        return json.loads(resp.read().decode())


def fault_slot(plan: dict) -> int:
    for move in plan.get("job_moves") or []:
        if (
            move.get("machine_id") == "CNC_2"
            and move.get("start_slot") is not None
            and move.get("kind") != "dropped"
        ):
            return max(0, int(move["start_slot"]) - 2)
    raise SystemExit(f"{plan.get('plan_id')} has no CNC_2 job to break down")


def run_day(day_id: str, label: str, prefix: str) -> None:
    print(f"SOLVE {day_id}", flush=True)
    plan = post(
        "/manager/solve-48h",
        {
            "horizon_hours": 48,
            "slot_duration_minutes": 15,
            "enforce_heat_safety": True,
            "enforce_tariff_optimization": True,
            "day_id": day_id,
            "dataset_label": label,
        },
    )
    (OUT / f"{prefix}_morning.json").write_text(json.dumps(plan), encoding="utf-8")
    slot = fault_slot(plan)
    print(
        f"BREAKDOWN {day_id} fault_slot={slot} plan={plan.get('plan_id')} "
        f"status={plan.get('solver_status')} sec={plan.get('solve_time_sec')}",
        flush=True,
    )
    broken = post(
        "/breakdown/trigger",
        {
            "machine_id": "CNC_2",
            "fault_slot": slot,
            "repair_duration_slots": 16,
            "reason": "CNC_2 spindle trip",
        },
    )
    (OUT / f"{prefix}_breakdown.json").write_text(json.dumps(broken), encoding="utf-8")
    (OUT / f"{prefix}_breakdown_key.json").write_text(
        json.dumps(
            {
                "machine_id": "CNC_2",
                "fault_slot": slot,
                "repair_duration_slots": 16,
                "parent_plan_id": plan["plan_id"],
            }
        ),
        encoding="utf-8",
    )
    print(
        f"SAVED {prefix} breakdown={broken.get('plan_id')} "
        f"status={broken.get('solver_status')} sec={broken.get('solve_time_sec')}",
        flush=True,
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    run_day("day1_monday", "Monday: Castings", "monday")
    run_day("day2_tuesday", "Tuesday: Housings", "tuesday")
    print("DONE", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAILED {exc}", file=sys.stderr, flush=True)
        raise
