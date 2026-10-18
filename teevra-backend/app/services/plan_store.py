"""
Last solved plan on disk.

The in-memory run history is wiped when the process restarts. This file is the
copy a page load can read without starting a new solve. Orders, rosters, and
weather (the active context) are optional and are not stored here.
"""

from __future__ import annotations

import json
from pathlib import Path

import structlog

from app.models.schedule import SchedulePlanResponse

logger = structlog.get_logger(__name__)

PLAN_PATH = Path(__file__).resolve().parent.parent / "data" / "last_plan.json"


def save(plan: SchedulePlanResponse, path: Path | None = None) -> None:
    """Write the plan as JSON. IO failures are logged and ignored."""
    target = path or PLAN_PATH
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = plan.model_dump(mode="json")
        target.write_text(json.dumps(payload), encoding="utf-8")
    except Exception as e:
        logger.warning("plan_store_save_failed", error=str(e))


def load(path: Path | None = None) -> SchedulePlanResponse | None:
    """Return the saved plan, or None when the file is missing or unreadable."""
    target = path or PLAN_PATH
    try:
        if not target.is_file():
            return None
        raw = json.loads(target.read_text(encoding="utf-8"))
        return SchedulePlanResponse.model_validate(raw)
    except Exception as e:
        logger.warning("plan_store_load_failed", error=str(e))
        return None
