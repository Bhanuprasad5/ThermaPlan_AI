"""
Last solved plan (for breakdown replans) and a log of every solve (for the Evals page).
Kept in memory; each run is also mirrored to Firestore on a best-effort basis so a restart
of the service does not reset the run count.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

import structlog

from app.models.domain import PlantOrder, WeatherSlot, WorkstationRoster
from app.models.schedule import SchedulePlanResponse

logger = structlog.get_logger(__name__)
IST = ZoneInfo("Asia/Kolkata")
_COLLECTION = "teevra_solve_runs"
_MAX_RUNS = 500


@dataclass
class ActiveContext:
    plan: SchedulePlanResponse
    orders: list[PlantOrder]
    rosters: list[WorkstationRoster]
    weather: list[WeatherSlot]


@dataclass
class RunHistory:
    runs: list[dict] = field(default_factory=list)
    active: ActiveContext | None = None
    _loaded: bool = False
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def set_active(self, ctx: ActiveContext) -> None:
        self.active = ctx

    def record(self, plan: SchedulePlanResponse) -> dict:
        b, k = plan.baseline_kpi, plan.kpi
        run = {
            "plan_id": plan.plan_id,
            "plan_hash": plan.plan_hash,
            "trigger": plan.trigger_type,
            "dataset": plan.dataset_label or "Custom upload",
            "at_ist": datetime.now(IST).strftime("%Y-%m-%d %H:%M"),
            "solve_sec": plan.solve_time_sec,
            "baseline": _kpi_row(b) if b else None,
            "optimized": _kpi_row(k),
        }
        with self._lock:
            self.runs.append(run)
            del self.runs[:-_MAX_RUNS]
        threading.Thread(target=_mirror, args=(run,), daemon=True).start()
        return run

    def load_once(self) -> None:
        """Pull earlier runs from Firestore the first time the summary is asked for."""
        if self._loaded:
            return
        self._loaded = True
        try:
            from app.dependencies import get_cloud_container

            db = get_cloud_container().firestore_client
            if db is None:
                return
            docs = db.collection(_COLLECTION).order_by("at_ist").limit(_MAX_RUNS).stream()
            stored = [d.to_dict() for d in docs]
            with self._lock:
                seen = {(r["plan_id"], r["at_ist"]) for r in self.runs}
                earlier = [r for r in stored if (r.get("plan_id"), r.get("at_ist")) not in seen]
                self.runs[:0] = earlier
        except Exception as e:  # history is optional
            logger.warning("run_history_load_failed", error=str(e))

    def summary(self) -> dict:
        self.load_once()
        with self._lock:
            runs = [r for r in self.runs if r.get("baseline") and r["trigger"] == "MORNING_PLAN"]
        n = len(runs)

        def avg(side: str, key: str) -> float:
            return round(sum(r[side][key] for r in runs) / n, 2) if n else 0.0

        keys = ["cost_inr", "kwh", "heat_breach_slots", "restarts", "output_pct"]
        baseline = {k: avg("baseline", k) for k in keys}
        optimized = {k: avg("optimized", k) for k in keys}
        saved = round(baseline["cost_inr"] - optimized["cost_inr"], 2)
        per_dataset: dict[str, dict] = {}
        for r in runs:
            d = per_dataset.setdefault(r["dataset"], {"dataset": r["dataset"], "runs": 0, "hashes": set(),
                                                      "baseline_cost": 0.0, "optimized_cost": 0.0})
            d["runs"] += 1
            d["hashes"].add(r["plan_hash"])
            d["baseline_cost"] += r["baseline"]["cost_inr"]
            d["optimized_cost"] += r["optimized"]["cost_inr"]
        datasets = [
            {
                "dataset": d["dataset"],
                "runs": d["runs"],
                "same_plan_every_run": len(d["hashes"]) == 1,
                "baseline_cost_inr": round(d["baseline_cost"] / d["runs"], 2),
                "optimized_cost_inr": round(d["optimized_cost"] / d["runs"], 2),
            }
            for d in per_dataset.values()
        ]
        return {
            "runs": n,
            "baseline": baseline,
            "optimized": optimized,
            "avg_saving_inr": saved,
            "avg_saving_pct": round(saved / baseline["cost_inr"] * 100, 1) if baseline["cost_inr"] else 0.0,
            "total_saving_inr": round(sum(r["baseline"]["cost_inr"] - r["optimized"]["cost_inr"] for r in runs), 2),
            "datasets": sorted(datasets, key=lambda d: d["dataset"]),
            "recent": list(reversed(runs[-8:])),
        }


def _kpi_row(k) -> dict:
    return {
        "cost_inr": round(k.total_cost_inr, 2),
        "kwh": round(k.total_kwh, 1),
        "heat_breach_slots": k.heat_breaches_count,
        "restarts": k.total_restarts,
        "output_pct": k.output_percentage,
    }


def _mirror(run: dict) -> None:
    try:
        from app.dependencies import get_cloud_container

        db = get_cloud_container().firestore_client
        if db is not None:
            db.collection(_COLLECTION).add(run)
    except Exception as e:
        logger.warning("run_history_mirror_failed", error=str(e))


run_history = RunHistory()
