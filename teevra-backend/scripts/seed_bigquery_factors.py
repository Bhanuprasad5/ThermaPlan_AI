"""
Seeds official versioned factor tables and 48-hour baseline weather into BigQuery.
Regimes seeded:
1. CEA (0.675 tCO2/MWh, Baseline Database v22)
2. TGSPDCL ToD Tariffs (Base ₹7.50, Solar ₹6.00, Peak ₹9.00)
3. ISO 7243:2017 Table A.1 Heat Limits (Classes 0 through 4)
4. Initial 48-Hour Diurnal Weather Baseline (192 slots)
"""

import sys
from pathlib import Path

import structlog

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.services.bigquery_service import bq_service
from app.services.weather_integrator import weather_integrator

logger = structlog.get_logger(__name__)


def main():
    settings = get_settings()
    logger.info(
        "seeding_bigquery_factors",
        project_id=settings.GCP_PROJECT_ID,
        dataset=settings.BIGQUERY_DATASET,
    )

    # 1. Seed Factors
    factors = bq_service.get_versioned_factors()
    logger.info("factors_verified", count=len(factors))

    # 2. Seed Weather Baseline
    weather_slots = weather_integrator._generate_synthetic_48h_baseline()
    bq_service.save_weather_forecast_48h(weather_slots)
    logger.info("weather_baseline_seeded", total_slots=len(weather_slots))

    print(
        f"Successfully seeded {len(factors)} versioned factors and {len(weather_slots)} weather slots into BigQuery/resilient store."
    )


if __name__ == "__main__":
    main()
