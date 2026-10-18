"""End-to-end API smoke test against the FastAPI app in-process.

Run: uv run python scripts/api_smoke.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

DAYS = ["day1_monday", "day2_tuesday", "day3_wednesday", "day4_thursday", "day5_friday"]


def main() -> int:
    ok = True
    with TestClient(app) as c:
        def check(name, cond, extra=""):
            nonlocal ok
            ok &= bool(cond)
            print(f"{'PASS' if cond else 'FAIL'}  {name}  {extra}")

        r = c.post("/api/v1/breakdown/trigger", json={"machine_id": "CNC_1", "fault_slot": 40})
        check("breakdown before any plan -> 409", r.status_code == 409, r.status_code)

        r = c.post("/api/v1/manager/solve-48h", json={"orders_csv": "a,b\n1,2"})
        check("bad CSV -> 400", r.status_code == 400, r.json().get("detail", "")[:60])

        csv = (ROOT / "app/data/Day 2 - Tuesday/Orders/day2_tuesday_orders.csv").read_text(encoding="utf-8")
        r = c.post("/api/v1/manager/solve-48h", json={"orders_csv": csv, "dataset_label": "Tuesday CSV"})
        p = r.json()
        steps = {(m["order_id"], m["machine_id"]): m for m in p.get("job_moves", [])}
        melt, mill = steps.get(("TUE-01", "FURNACE_1")), steps.get(("TUE-01", "CNC_1"))
        check("CSV path keeps routing order", r.status_code == 200 and melt and mill and mill["start_slot"] >= melt["end_slot"])

        for day in DAYS:
            r = c.post("/api/v1/manager/solve-48h", json={"day_id": day})
            p = r.json()
            k, b = p["kpi"], p["baseline_kpi"]
            check(
                f"{day}",
                r.status_code == 200 and k["heat_breaches_count"] == 0 and k["output_percentage"] == 100,
                f"{p['dataset_label']}: Rs {b['total_cost_inr']:,.0f} -> {k['total_cost_inr']:,.0f}  "
                f"rows {len(p['machines'])} heat {len(p['heat_windows'])} bands {len(p['tariff_bands'])}",
            )

        r = c.post("/api/v1/manager/solve-48h", json={"day_id": "day5_friday"})
        h1 = r.json()["plan_hash"]
        check("repeat solve, same hash", h1 == c.post("/api/v1/manager/solve-48h", json={"day_id": "day5_friday"}).json()["plan_hash"])

        moves = r.json()["job_moves"]
        target = next(m for m in moves if m["machine_id"] == "CNC_1")
        r = c.post("/api/v1/breakdown/trigger", json={"machine_id": "CNC_1", "fault_slot": max(0, target["start_slot"] - 2), "repair_duration_slots": 16})
        bp = r.json()
        check("breakdown, rush job cannot recover", r.status_code == 200 and bp["kpi"]["heat_breaches_count"] == 0
              and bp["parent_plan_hash"] == h1 and any(m["kind"] == "dropped" for m in bp["job_moves"]),
              bp.get("summary", bp.get("detail")))

        mon = c.post("/api/v1/manager/solve-48h", json={"day_id": "day1_monday"}).json()
        job = next(m for m in mon["job_moves"] if m["machine_id"] == "CNC_2")
        r = c.post("/api/v1/breakdown/trigger", json={"machine_id": "CNC_2", "fault_slot": job["start_slot"] - 2, "repair_duration_slots": 16})
        bp = r.json()
        moved = next(m for m in bp["job_moves"] if m["machine_id"] == "CNC_2")
        check("breakdown, job moves after repair", r.status_code == 200 and bp["kpi"]["output_percentage"] == 100
              and moved["start_slot"] >= job["start_slot"] - 2 + 16, bp.get("summary"))
        if "--ai" in sys.argv:
            e = c.post("/api/v1/manager/explain").json()
            print("      AI note:", e["text"][:300])
            print("      trace:", e["trace"])

        s = c.get("/api/v1/manager/evals/summary").json()
        check("evals summary counts runs", s["runs"] >= 8, f"runs={s['runs']} avg saving Rs {s['avg_saving_inr']} ({s['avg_saving_pct']}%)")
        check("health", c.get("/health").json()["status"] == "HEALTHY")
    print("\nALL PASS" if ok else "\nSOME FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
