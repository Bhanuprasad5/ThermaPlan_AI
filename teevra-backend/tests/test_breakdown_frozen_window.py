"""
Tests for Automatic Breakdown Rescheduler with 2-Hour Frozen Window:
- Verifies 8-slot (120 minute) lock on healthy machines
- Verifies faulted machine is locked out during repair window
- Verifies zero heat breaches in re-solved plan
"""

from app.core_math.ortools_solver import solve_dual_schedules
from app.core_math.safety_validator import validate_delta_replan_safety


def test_2_hour_frozen_window_during_cnc_breakdown(
    sample_orders, sample_rosters, sample_weather
):
    # 1. Initial morning solve
    _, initial_plan = solve_dual_schedules(
        sample_orders, sample_rosters, sample_weather
    )

    # 2. Simulate CNC_1 fault at slot 14 (10:30 IST) with repair duration = 16 slots (4 hours)
    fault_slot = 14
    repair_slots = 16
    frozen_start = fault_slot
    frozen_end = fault_slot + 7  # 8 slots = 120 minutes

    # Extract initial active assignments
    prev_assignments = {}
    for slot in initial_plan.schedule_slots:
        j_id = f"{slot.order_id}_1"
        prev_assignments[(j_id, slot.slot_index)] = 1 if slot.is_active else 0

    # 3. Re-solve under breakdown
    _, re_plan = solve_dual_schedules(
        orders=sample_orders,
        rosters=sample_rosters,
        weather_slots=sample_weather,
        frozen_window=(frozen_start, frozen_end),
        previous_assignments=prev_assignments,
        faulted_machine_id="CNC_1",
        fault_slot=fault_slot,
        repair_duration_slots=repair_slots,
    )

    # Verify frozen window: all healthy machines must match initial plan in [14, 21]
    for s_re in re_plan.schedule_slots:
        if frozen_start <= s_re.slot_index <= frozen_end and s_re.machine_id != "CNC_1":
            # Check corresponding slot in initial plan
            s_init = next(
                (
                    s
                    for s in initial_plan.schedule_slots
                    if s.slot_index == s_re.slot_index and s.order_id == s_re.order_id
                ),
                None,
            )
            if s_init:
                assert s_re.is_active == s_init.is_active, (
                    f"Healthy line assignment changed during frozen window at slot {s_re.slot_index}"
                )

    # Faulted machine CNC_1 must be inactive in [14, 14 + 16)
    for s in re_plan.schedule_slots:
        if s.machine_id == "CNC_1":
            assert not (fault_slot <= s.slot_index < fault_slot + repair_slots), (
                f"CNC_1 scheduled during repair at slot {s.slot_index}"
            )

    # Safety Gate verification
    is_safe, _ = validate_delta_replan_safety(
        initial_plan.schedule_slots, re_plan.schedule_slots
    )
    assert is_safe is True
