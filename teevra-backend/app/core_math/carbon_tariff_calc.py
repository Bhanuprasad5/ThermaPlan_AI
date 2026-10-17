"""
Deterministic TGSPDCL ToD Electricity Tariff and Honest CEA Carbon Accounting Calculator.
Strict Rule: No hallucinated emissions savings.
Time-shifting alone without kWh reduction produces exactly 0.0 tCO2 savings.
"""

from typing import Any

# CEA Grid Emission Factor v20.0 (Dec 2024): 0.716 tCO2 / MWh = 0.000716 tCO2 / kWh
CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH = 0.000716

# Base HT-I Industrial Rate in Telangana (TGSPDCL)
BASE_TARIFF_INR_PER_KWH = 7.50


# TGSPDCL ToD Windows (Hour 0 to 23)
# 06:00 to 10:00: Normal (1.0x) -> 7.50
# 10:00 to 16:00: Solar (-20%) -> 6.00
# 16:00 to 18:00: Normal (1.0x) -> 7.50
# 18:00 to 22:00: Peak (+20%) -> 9.00
# 22:00 to 06:00: Night Normal (1.0x) -> 7.50
def get_tgspdcl_tod_rate(hour_of_day: int) -> dict[str, Any]:
    """
    Returns the exact TGSPDCL tariff rate (₹/kWh) and category for an hour of day (0-23).
    """
    h = hour_of_day % 24
    if 10 <= h < 16:
        return {
            "rate_inr": 6.00,
            "multiplier": 0.80,
            "category": "SOLAR_DISCOUNT",
            "clause": "TGSPDCL Tariff Order Clause 4.2b (-20% solar incentive)",
            "is_solar": True,
            "is_peak": False,
        }
    elif 18 <= h < 22:
        return {
            "rate_inr": 9.00,
            "multiplier": 1.20,
            "category": "EVENING_PEAK",
            "clause": "TGSPDCL Tariff Order Clause 4.2c (+20% peak penalty)",
            "is_solar": False,
            "is_peak": True,
        }
    else:
        return {
            "rate_inr": 7.50,
            "multiplier": 1.00,
            "category": "NORMAL_HOURS",
            "clause": "TGSPDCL Tariff Order Clause 4.2a (Base HT-I rate)",
            "is_solar": False,
            "is_peak": False,
        }


def get_tod_rate_for_slot(slot_index: int) -> dict[str, Any]:
    """
    Given a slot_index (0 to 191 in 15-minute increments), computes the hour of day.
    Each hour contains 4 slots. Slot 0 starts at 00:00.
    """
    hour_of_day = (slot_index // 4) % 24
    return get_tgspdcl_tod_rate(hour_of_day)


def calculate_slot_energy_and_cost(
    kwh_per_op: float,
    duration_slots: int,
    is_active: bool,
    is_restart: bool,
    restart_kwh: float,
    slot_index: int,
) -> dict[str, float]:
    """
    Computes exact kWh consumed and INR cost incurred during a single 15-minute slot.
    """
    if not is_active:
        return {
            "slot_kwh": 0.0,
            "restart_kwh": 0.0,
            "total_kwh": 0.0,
            "tod_rate_inr": get_tod_rate_for_slot(slot_index)["rate_inr"],
            "cost_inr": 0.0,
        }

    op_kwh = (kwh_per_op / max(1, duration_slots)) if duration_slots > 0 else 0.0
    rst_kwh = restart_kwh if is_restart else 0.0
    total_kwh = op_kwh + rst_kwh
    tod_info = get_tod_rate_for_slot(slot_index)
    rate = tod_info["rate_inr"]
    cost = total_kwh * rate

    return {
        "slot_kwh": round(op_kwh, 3),
        "restart_kwh": round(rst_kwh, 3),
        "total_kwh": round(total_kwh, 3),
        "tod_rate_inr": rate,
        "cost_inr": round(cost, 2),
    }


def compute_honest_carbon_and_savings(
    baseline_kwh: float,
    optimized_kwh: float,
    baseline_cost_inr: float,
    optimized_cost_inr: float,
) -> dict[str, Any]:
    """
    Honest CO2 Accounting:
    Delta kWh = baseline_kwh - optimized_kwh.
    Delta tCO2 = Delta kWh * 0.000716.
    Hard Rule: If delta_kwh <= 0 (time-shifting only), co2_saved_tco2 is strictly 0.0.
    """
    cost_savings = round(baseline_cost_inr - optimized_cost_inr, 2)
    delta_kwh = round(baseline_kwh - optimized_kwh, 3)

    if delta_kwh <= 0.001:
        co2_saved = 0.0
        honest_banner = (
            "Time-shifting saves rupees, not CO2, at an annual average grid factor."
        )
    else:
        co2_saved = round(delta_kwh * CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH, 4)
        honest_banner = f"Real energy reduction: {delta_kwh:.1f} kWh avoided ({co2_saved:.3f} tCO2 saved via CEA v20 grid factor)."

    return {
        "baseline_kwh": round(baseline_kwh, 2),
        "optimized_kwh": round(optimized_kwh, 2),
        "delta_kwh": delta_kwh,
        "baseline_cost_inr": round(baseline_cost_inr, 2),
        "optimized_cost_inr": round(optimized_cost_inr, 2),
        "cost_savings_inr": cost_savings,
        "co2_saved_tco2": co2_saved,
        "honest_co2_banner": honest_banner,
        "cea_factor_used": CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH,
    }
