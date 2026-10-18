"""Monday CNC breakdown: the machine stays down, siblings keep the next 2 hours, then the work moves."""

from app.core_math.monday_breakdown import reassign_monday_breakdown
from app.models.schedule import SchedulePlanResponse

MORNING = "app/data/demo_cache/monday_morning.json"


def _morning() -> SchedulePlanResponse:
    return SchedulePlanResponse.model_validate_json(open(MORNING, encoding="utf-8").read())


def test_cnc2_stays_down_and_work_moves_without_recoloring():
    plan = _morning()
    out = reassign_monday_breakdown(plan, "CNC_2", 30)

    cnc2 = [s for s in out.schedule_slots if s.machine_id == "CNC_2" and s.is_active and s.slot_index >= 30]
    assert cnc2 == []

    moved = {m.order_id: m for m in out.job_moves if m.order_id in {"MON-012", "MON-013", "MON-014"}}
    assert set(moved) == {"MON-012", "MON-013", "MON-014"}
    assert all(m.machine_id != "CNC_2" for m in moved.values())
    assert all(m.start_slot >= 38 for m in moved.values())
    assert {m.kind for m in moved.values()} <= {"heat", "tariff"}

    setups = [
        m for m in out.job_moves
        if m.job_name == "castings setup" and m.machine_id in {"CNC_1", "CNC_3", "CNC_4", "CNC_5"}
    ]
    assert any(m.start_slot == 32 for m in setups)

    assert out.kpi.output_percentage == 100
    assert out.kpi.heat_breaches_count == 0
    assert "stays down" in out.summary
    assert "2 hours" in out.summary
    assert "a little" in out.summary
    assert out.baseline_kpi.total_cost_inr == plan.baseline_kpi.total_cost_inr
    assert out.baseline_kpi.total_cost_inr > out.kpi.total_cost_inr
