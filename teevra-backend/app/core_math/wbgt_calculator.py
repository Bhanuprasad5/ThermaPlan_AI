"""
Deterministic WBGT and ISO 7243:2017 Heat Stress Calculator.
Pure mathematical module: Zero AI hallucinations.
Implements Stull (2011) psychrometric equation, globe uplift, clothing adjustments,
and strict conservative safety degradation upon sensor/API failure.
"""

import math

# ISO 7243:2017 Table A.1 Reference Limits in °C (Acclimatised vs Unacclimatised)
ISO_7243_LIMITS: dict[int, dict[str, float]] = {
    0: {"acclimatised": 33.0, "unacclimatised": 32.0, "watts": 115, "name": "Resting"},
    1: {"acclimatised": 30.0, "unacclimatised": 29.0, "watts": 180, "name": "Low"},
    2: {"acclimatised": 28.0, "unacclimatised": 26.0, "watts": 300, "name": "Moderate"},
    3: {
        "acclimatised": 26.0,
        "unacclimatised": 23.0,
        "watts": 415,
        "name": "High (Furnace)",
    },
    4: {
        "acclimatised": 25.0,
        "unacclimatised": 20.0,
        "watts": 520,
        "name": "Very High",
    },
}


def calculate_stull_natural_wet_bulb(
    air_temp_c: float, relative_humidity_pct: float
) -> float:
    """
    Computes natural wet-bulb temperature Tw (°C) via Stull's empirical psychrometric equation.
    T = air_temp_c, RH = relative_humidity_pct (0 to 100).
    """
    t = float(air_temp_c)
    rh = float(relative_humidity_pct)

    # Stull (2011) formula
    term1 = t * math.atan(0.151977 * math.sqrt(rh + 8.313659))
    term2 = math.atan(t + rh)
    term3 = math.atan(rh - 1.676331)
    term4 = 0.00391838 * (rh**1.5) * math.atan(0.023101 * rh)
    term5 = -4.686035

    tw = term1 + term2 - term3 + term4 + term5
    return round(tw, 2)


def get_station_globe_temp(
    ambient_globe_c: float,
    simulated_uplift_c: float = 1.5,
    sensor_globe_temp_c: float | None = None,
) -> tuple[float, bool]:
    """
    Returns station globe temperature and a boolean flag indicating if simulated estimate.
    """
    if sensor_globe_temp_c is not None:
        return round(sensor_globe_temp_c, 2), False
    globe = ambient_globe_c + simulated_uplift_c
    return round(globe, 2), True


def calculate_effective_wbgt(
    wet_bulb_c: float,
    globe_temp_c: float,
    air_temp_c: float,
    clothing_adj_c: float = 0.0,
    is_outdoors_in_sun: bool = False,
) -> float:
    """
    Calculates effective WBGT according to ISO 7243:
    Indoors / without direct solar radiation:
        WBGT_eff = 0.7 * Tw + 0.3 * Tg + clothing_adj
    Outdoors with direct solar radiation:
        WBGT_eff = 0.7 * Tw + 0.2 * Tg + 0.1 * Ta + clothing_adj
    """
    if is_outdoors_in_sun:
        wbgt = (
            (0.7 * wet_bulb_c)
            + (0.2 * globe_temp_c)
            + (0.1 * air_temp_c)
            + clothing_adj_c
        )
    else:
        wbgt = (0.7 * wet_bulb_c) + (0.3 * globe_temp_c) + clothing_adj_c
    return round(wbgt, 2)


def get_iso_limit(
    work_class: int,
    acclimatised: bool = True,
    weather_api_failed: bool = False,
    is_uncertain_class: bool = False,
) -> tuple[float, int, str]:
    """
    Returns the strict ISO 7243 heat threshold limit (°C), effective work class, and caveat note.
    Uncertainty & API Failure Safeguard:
    If work_class is unclear or weather_api_failed == True, automatically increment
    effective_work_class = min(4, work_class + 1) to enforce the stricter heat ceiling.
    """
    eff_class = work_class
    caveat = "Standard ISO 7243:2017 limit applied."

    if weather_api_failed or is_uncertain_class:
        eff_class = min(4, work_class + 1)
        caveat = f"Safeguard active: Work class increased from {work_class} to {eff_class} due to sensor/API uncertainty."

    row = ISO_7243_LIMITS.get(eff_class, ISO_7243_LIMITS[2])
    limit = row["acclimatised"] if acclimatised else row["unacclimatised"]
    return limit, eff_class, caveat


def evaluate_thermal_margin(
    station_wbgt_eff: float,
    work_class: int,
    acclimatised: bool = True,
    weather_api_failed: bool = False,
) -> dict[str, any]:
    """
    Calculates thermal margin = limit - WBGT_eff.
    Positive margin means compliant. Negative margin means heat breach.
    """
    limit, eff_class, caveat = get_iso_limit(
        work_class=work_class,
        acclimatised=acclimatised,
        weather_api_failed=weather_api_failed,
    )
    margin = round(limit - station_wbgt_eff, 2)
    is_breach = margin < 0.0

    return {
        "station_wbgt_eff": station_wbgt_eff,
        "iso_limit_c": limit,
        "effective_work_class": eff_class,
        "thermal_margin_c": margin,
        "is_breach": is_breach,
        "is_near_ceiling": 0.0 <= margin <= 2.0,
        "caveat": caveat,
        "is_simulated_estimate": True,
        "ui_label": "ISO 7243 screening check: exceedance triggers further action",
    }
