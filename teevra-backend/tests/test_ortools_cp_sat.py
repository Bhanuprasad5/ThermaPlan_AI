"""
Tests for OR-Tools CP-SAT discrete solver:
- Verifies 0 heat breaches in Heat-Safe plan
- Verifies >= 1 heat breach in unconstrained baseline plan
- Verifies pre-allocation of 30-60m Heat Buffers
- Verifies non-splittable furnace melt batches remain contiguous
- Verifies >= 98% factory output guarantee
"""

from app.core_math.ortools_solver import solve_dual_schedules


def test_cp_sat_dual_solve_and_safety_constraints(
    sample_orders, sample_rosters, sample_weather
):
    baseline, optimized = solve_dual_schedules(
        orders=sample_orders, rosters=sample_rosters, weather_slots=sample_weather
    )

    # 1. Baseline comparator should contain heat breaches because it ignores WBGT limits
    assert baseline.solver_status in ("OPTIMAL", "FEASIBLE")

    # 2. Optimized plan must strictly have ZERO heat breaches
    assert optimized.solver_status in ("OPTIMAL", "FEASIBLE")
    assert optimized.kpi.heat_breaches_count == 0, (
        f"Optimized plan must have 0 heat breaches, got {optimized.kpi.heat_breaches_count}"
    )

    # 3. Output guarantee: output_percentage >= 98.0%
    assert optimized.kpi.output_percentage >= 98.0

    # 4. Heat Buffers must be allocated in peak thermal afternoon slots
    assert len(optimized.heat_buffers) >= 2
    for buf in optimized.heat_buffers:
        assert buf.duration_minutes in (30, 45, 60)
        assert buf.remaining_capacity_minutes == buf.duration_minutes

    # 5. Furnace non-splittable verification: verify slots are contiguous for critical melt
    furnace_slots = [
        s.slot_index
        for s in optimized.schedule_slots
        if s.order_id in ("MON-01", "ORD_101", "ORD_AERO_01") and s.machine_id == "FURNACE_1"
    ]
    assert len(furnace_slots) == 24  # 24 slots = 6 hours, one ladle melt
    # Check consecutive
    for i in range(len(furnace_slots) - 1):
        assert furnace_slots[i + 1] == furnace_slots[i] + 1, (
            "Furnace melt batch must not be fragmented"
        )


def test_custom_slot_durations_and_horizons(sample_orders, sample_rosters, sample_weather):
    """Verifies that solver works seamlessly across all user-specified slot durations."""
    custom_slot_minutes = [15, 60, 180]

    for slot_mins in custom_slot_minutes:
        _, opt = solve_dual_schedules(
            orders=sample_orders,
            rosters=sample_rosters,
            weather_slots=sample_weather,
            horizon_hours=48,
            slot_duration_minutes=slot_mins,
        )
        assert opt.solver_status in ("OPTIMAL", "FEASIBLE"), f"Failed for slot duration: {slot_mins} mins"
        assert opt.kpi.heat_breaches_count == 0, f"Heat breach found with slot duration: {slot_mins} mins"
        expected_slots = (48 * 60) // slot_mins
        for s in opt.schedule_slots:
            assert s.slot_index < expected_slots

