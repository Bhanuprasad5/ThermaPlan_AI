"""
Tests for Heat Buffer absorption, worker micro-rests, SOS zero-AI bypass, and relief assignment.
"""

from app.core_math.safety_validator import check_heat_buffer_absorption
from app.models.schedule import HeatBuffer
from app.routers.safety_signals_router import STATION_MACHINE_MAP


def test_heat_buffer_absorption_and_overflow():
    # 60-minute pre-allocated buffer
    buffer = HeatBuffer(
        buffer_id="BUF_TEST_60",
        station_id="FURNACE_BAY",
        day=1,
        start_slot=28,
        end_slot=32,
        duration_minutes=60,
        buffer_type="60_MIN",
        peak_ambient_wbgt_c=29.2,
        remaining_capacity_minutes=60,
    )

    # Worker takes 15-minute micro-rest -> buffer absorbs without delay
    can_absorb, rem, msg = check_heat_buffer_absorption(buffer, 15)
    assert can_absorb is True
    assert rem == 45
    buffer.remaining_capacity_minutes = rem

    # Worker takes second 30-minute rest -> buffer absorbs
    can_absorb_2, rem_2, msg_2 = check_heat_buffer_absorption(buffer, 30)
    assert can_absorb_2 is True
    assert rem_2 == 15
    buffer.remaining_capacity_minutes = rem_2

    # Worker requests 30-minute rest when only 15m left -> buffer overflows, triggers delta replan
    can_absorb_3, rem_3, msg_3 = check_heat_buffer_absorption(buffer, 30)
    assert can_absorb_3 is False
    assert "Buffer overflow" in msg_3


def test_sos_zero_ai_hardware_isolation():
    # Verify station machine mapping for zero-AI isolation
    assert "FURNACE_1" in STATION_MACHINE_MAP["FURNACE_BAY"]
    assert "CNC_1" in STATION_MACHINE_MAP["CNC_BAY"]
    assert "OVEN_1" in STATION_MACHINE_MAP["PAINT_SHOP"]
