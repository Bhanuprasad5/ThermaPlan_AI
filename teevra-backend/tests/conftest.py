"""
Pytest configuration and fixtures for TEEVRA.
Provides test datasets for orders, rosters, and weather slots.
"""

import pytest

from app.models.domain import PlantOrder, WeatherSlot, WorkstationRoster
from app.routers.manager_router import DEFAULT_DEMO_ORDERS, DEFAULT_DEMO_ROSTERS
from app.services.weather_integrator import weather_integrator


@pytest.fixture
def sample_orders() -> list[PlantOrder]:
    return list(DEFAULT_DEMO_ORDERS)


@pytest.fixture
def sample_rosters() -> list[WorkstationRoster]:
    return list(DEFAULT_DEMO_ROSTERS)


@pytest.fixture
def sample_weather() -> list[WeatherSlot]:
    return weather_integrator._generate_synthetic_48h_baseline()
