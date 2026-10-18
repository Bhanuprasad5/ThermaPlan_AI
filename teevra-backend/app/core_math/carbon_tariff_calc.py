"""
Deterministic TGSPDCL ToD tariff and hourly CEA carbon accounting.
Grid intensity varies by hour and is centered on CEA v22 0.675 tCO2/MWh.
A saving is real when kWh moves into cleaner hours, or when kWh actually falls.
"""

from typing import Any

# CEA Grid Emission Factor v22.0 (Dec 2025 weighted avg): 0.675 tCO2 / MWh = 0.000675 tCO2 / kWh
CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH = 0.000675
CEA_V22_TCO2_PER_MWH = 0.675

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
            "clause": "Illustrative tariff, simulated (-20% solar window)",
            "is_solar": True,
            "is_peak": False,
        }
    elif 18 <= h < 22:
        return {
            "rate_inr": 9.00,
            "multiplier": 1.20,
            "category": "EVENING_PEAK",
            "clause": "Illustrative tariff, simulated (+20% evening peak)",
            "is_solar": False,
            "is_peak": True,
        }
    else:
        return {
            "rate_inr": 7.50,
            "multiplier": 1.00,
            "category": "NORMAL_HOURS",
            "clause": "Illustrative tariff, simulated (base HT-I rate)",
            "is_solar": False,
            "is_peak": False,
        }


def hour_from_slot(slot_index: int, slot_minutes: int = 15) -> int:
    """Clock hour for a slot. Slot 0 is 08:00, not midnight.

    hour = (8 + slot_index // (60 / slot_minutes)) % 24.
    At the default 15-minute slot that is (8 + slot_index // 4) % 24.
    """
    slots_per_hour = 60 / slot_minutes
    return (8 + int(slot_index // slots_per_hour)) % 24


def operational_day(slot_index: int, slot_minutes: int = 15) -> int:
    """Day 1 is slots covering 08:00 today through 08:00 tomorrow."""
    slots_per_day = max(1, (24 * 60) // slot_minutes)
    return slot_index // slots_per_day + 1


def grid_intensity_tco2_per_mwh(hour_of_day: int) -> float:
    """Hourly grid intensity centered on CEA v22 0.675 tCO2/MWh."""
    h = hour_of_day % 24
    if 10 <= h < 16:
        return 0.42
    if 18 <= h < 22:
        return 0.82
    if h >= 22 or h < 6:
        return 0.72
    return 0.68


def get_tod_rate_for_slot(slot_index: int, slot_minutes: int = 15) -> dict[str, Any]:
    """Tariff for one slot. Slot 0 is 08:00."""
    return get_tgspdcl_tod_rate(hour_from_slot(slot_index, slot_minutes))


def co2_tco2_for_slots(
    slot_kwh: list[tuple[int, float]],
    slot_minutes: int = 15,
) -> float:
    """Sum of kWh/1000 * that hour's grid intensity."""
    total = 0.0
    for slot_index, kwh in slot_kwh:
        factor = grid_intensity_tco2_per_mwh(hour_from_slot(slot_index, slot_minutes))
        total += (kwh / 1000.0) * factor
    return total


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
    baseline_slot_kwh: list[tuple[int, float]] | None = None,
    optimized_slot_kwh: list[tuple[int, float]] | None = None,
    slot_minutes: int = 15,
) -> dict[str, Any]:
    """
    CO2 of a plan is the sum over active slots of kWh/1000 * that hour's factor.
    co2_saved is never negative. A drop in kWh is stated only when kWh actually fell.
    Without slot profiles, the flat CEA average is used and time-shifting is carbon-neutral.
    """
    cost_savings = round(baseline_cost_inr - optimized_cost_inr, 2)
    energy_delta = round(optimized_kwh - baseline_kwh, 2)
    delta_kwh = round(-energy_delta, 3)
    intensity = "Hourly grid intensity is centered on CEA v22 0.675 tCO2/MWh."

    if baseline_slot_kwh is not None and optimized_slot_kwh is not None:
        baseline_co2 = co2_tco2_for_slots(baseline_slot_kwh, slot_minutes)
        optimized_co2 = co2_tco2_for_slots(optimized_slot_kwh, slot_minutes)
        co2_delta = round(optimized_co2 - baseline_co2, 4)
        co2_saved = round(max(0.0, baseline_co2 - optimized_co2), 4)
        if co2_saved > 0.00005:
            honest_banner = (
                f"{intensity} The saving comes from moving kWh into cleaner hours"
            )
            if energy_delta < -0.01:
                honest_banner += f" and from using {-energy_delta:,.1f} kWh less"
            honest_banner += "."
        elif energy_delta > 0.01:
            honest_banner = (
                f"{intensity} Uses {energy_delta:,.1f} kWh more than the baseline. "
                "No CO2 saving is claimed."
            )
        else:
            honest_banner = (
                f"{intensity} No CO2 saving is claimed. "
                "kWh did not fall, and the plan did not move energy into cleaner hours."
            )
    else:
        co2_delta = round(energy_delta * CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH, 4)
        if energy_delta < -0.01:
            co2_saved = round(-co2_delta, 4)
            honest_banner = (
                f"{intensity} Uses {-energy_delta:,.1f} kWh less than the baseline "
                f"({co2_saved:.3f} tCO2 avoided at the CEA v22 average)."
            )
        elif energy_delta > 0.01:
            co2_saved = 0.0
            honest_banner = (
                f"{intensity} Uses {energy_delta:,.1f} kWh more than the baseline. "
                "No CO2 saving is claimed."
            )
        else:
            co2_saved = 0.0
            honest_banner = (
                f"{intensity} Same energy as the baseline, so no CO2 saving is claimed."
            )

    return {
        "baseline_kwh": round(baseline_kwh, 2),
        "optimized_kwh": round(optimized_kwh, 2),
        "delta_kwh": delta_kwh,
        "energy_delta_kwh": energy_delta,
        "co2_delta_tco2": co2_delta,
        "baseline_cost_inr": round(baseline_cost_inr, 2),
        "optimized_cost_inr": round(optimized_cost_inr, 2),
        "cost_savings_inr": cost_savings,
        "co2_saved_tco2": co2_saved,
        "honest_co2_banner": honest_banner,
        "cea_factor_used": CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH,
    }
