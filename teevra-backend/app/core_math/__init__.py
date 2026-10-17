"""
Deterministic Mathematical Core for TEEVRA.
Contains pure, zero-AI deterministic algorithms for WBGT psychrometrics,
ISO 7243 thermal screening, TGSPDCL ToD tariffs, CEA carbon accounting,
and Google OR-Tools CP-SAT discrete optimization.
"""

from app.core_math.carbon_tariff_calc import (
    BASE_TARIFF_INR_PER_KWH,
    CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH,
    calculate_slot_energy_and_cost,
    compute_honest_carbon_and_savings,
    get_tgspdcl_tod_rate,
    get_tod_rate_for_slot,
)
from app.core_math.ortools_solver import (
    TOTAL_SLOTS,
    TeevraCPSATScheduler,
    solve_dual_schedules,
)
from app.core_math.safety_validator import (
    check_heat_buffer_absorption,
    validate_delta_replan_safety,
    validate_schedule_safety,
)
from app.core_math.wbgt_calculator import (
    ISO_7243_LIMITS,
    calculate_effective_wbgt,
    calculate_stull_natural_wet_bulb,
    evaluate_thermal_margin,
    get_iso_limit,
    get_station_globe_temp,
)

__all__ = [
    "BASE_TARIFF_INR_PER_KWH",
    "CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH",
    "ISO_7243_LIMITS",
    "TOTAL_SLOTS",
    "TeevraCPSATScheduler",
    "calculate_effective_wbgt",
    "calculate_slot_energy_and_cost",
    "calculate_stull_natural_wet_bulb",
    "check_heat_buffer_absorption",
    "compute_honest_carbon_and_savings",
    "evaluate_thermal_margin",
    "get_iso_limit",
    "get_station_globe_temp",
    "get_tgspdcl_tod_rate",
    "get_tod_rate_for_slot",
    "solve_dual_schedules",
    "validate_delta_replan_safety",
    "validate_schedule_safety",
]
