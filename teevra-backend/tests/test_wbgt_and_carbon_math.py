"""
Unit tests for deterministic mathematical formulas:
- Stull psychrometric equation
- ISO 7243 limits and uncertainty degradation
- TGSPDCL ToD tariff windows
- Honest CEA carbon accounting
"""

from app.core_math.carbon_tariff_calc import (
    compute_honest_carbon_and_savings,
    get_tgspdcl_tod_rate,
    get_tod_rate_for_slot,
    grid_intensity_tco2_per_mwh,
    hour_from_slot,
)
from app.core_math.wbgt_calculator import (
    calculate_stull_natural_wet_bulb,
    get_iso_limit,
)


def test_stull_wet_bulb_psychrometrics():
    # Test typical Hyderabad summer conditions: T = 38°C, RH = 35%
    tw = calculate_stull_natural_wet_bulb(air_temp_c=38.0, relative_humidity_pct=35.0)
    assert 24.0 <= tw <= 27.0, f"Expected wet bulb between 24-27°C, got {tw}"

    # Test cool morning conditions: T = 24°C, RH = 65%
    tw_cool = calculate_stull_natural_wet_bulb(
        air_temp_c=24.0, relative_humidity_pct=65.0
    )
    assert 18.0 <= tw_cool <= 21.0, f"Expected wet bulb between 18-21°C, got {tw_cool}"


def test_iso_7243_limits_and_safeguard():
    # Class 3 (Furnace, 415W) Acclimatised limit = 26.0°C
    limit, eff_class, _ = get_iso_limit(work_class=3, acclimatised=True)
    assert limit == 26.0
    assert eff_class == 3

    # Uncertainty Safeguard: API failure increases work class to enforce stricter limit
    limit_degraded, eff_class_degraded, caveat = get_iso_limit(
        work_class=2, acclimatised=True, weather_api_failed=True
    )
    assert eff_class_degraded == 3  # Class 2 -> 3
    assert limit_degraded == 26.0  # Drops from 28.0 to 26.0
    assert "Safeguard active" in caveat


def test_tgspdcl_tod_tariffs():
    # Solar hours (10:00 to 16:00) -> ₹6.00/kWh (-20%)
    solar_rate = get_tgspdcl_tod_rate(hour_of_day=12)
    assert solar_rate["rate_inr"] == 6.00
    assert solar_rate["is_solar"] is True

    # Peak hours (18:00 to 22:00) -> ₹9.00/kWh (+20%)
    peak_rate = get_tgspdcl_tod_rate(hour_of_day=19)
    assert peak_rate["rate_inr"] == 9.00
    assert peak_rate["is_peak"] is True

    # Normal hours (07:00) -> ₹7.50/kWh
    normal_rate = get_tgspdcl_tod_rate(hour_of_day=7)
    assert normal_rate["rate_inr"] == 7.50


def test_slot_clock_starts_at_0800():
    assert hour_from_slot(0, 15) == 8
    assert hour_from_slot(4, 15) == 9
    assert hour_from_slot(8, 15) == 10
    assert get_tod_rate_for_slot(0)["rate_inr"] == 7.50
    assert get_tod_rate_for_slot(8)["is_solar"] is True
    assert get_tod_rate_for_slot(40)["is_peak"] is True
    assert grid_intensity_tco2_per_mwh(12) == 0.42
    assert grid_intensity_tco2_per_mwh(19) == 0.82
    assert grid_intensity_tco2_per_mwh(23) == 0.72
    assert grid_intensity_tco2_per_mwh(8) == 0.68


def test_honest_carbon_rule():
    # When jobs are merely time-shifted without net energy reduction (delta_kwh = 0)
    res = compute_honest_carbon_and_savings(
        baseline_kwh=1000.0,
        optimized_kwh=1000.0,
        baseline_cost_inr=9000.0,
        optimized_cost_inr=6000.0,
    )
    assert res["cost_savings_inr"] == 3000.0
    assert res["co2_saved_tco2"] == 0.0, (
        "Zero kWh reduction must strictly yield 0.0 tCO2 savings without an hourly profile"
    )
    assert "CEA v22" in res["honest_co2_banner"]
    assert "0.675" in res["honest_co2_banner"]
    assert "no CO2 saving" in res["honest_co2_banner"]

    # When net kWh is genuinely reduced
    res_real = compute_honest_carbon_and_savings(
        baseline_kwh=1000.0,
        optimized_kwh=800.0,
        baseline_cost_inr=7500.0,
        optimized_cost_inr=6000.0,
    )
    assert res_real["delta_kwh"] == 200.0
    assert res_real["co2_saved_tco2"] > 0.0
    assert "kWh less" in res_real["honest_co2_banner"]
    assert "CEA v22" in res_real["honest_co2_banner"]
