"""
End-to-End Verification of the 90-Second Judge Demo Flow:
1. Seed / upload plant orders and workstation roster
2. Solve 48-Hour Plan (Baseline vs Heat-Safe & Carbon-Aware)
3. Machine Breakdown with 2-Hour Frozen Window lock
4. Weather Thermal Spike (+3.2°C) with Heat Buffer absorption
5. Telugu Worker Check-in rest absorption
6. Emergency SOS Zero-AI Immediate Hardware Halt
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_full_90_second_judge_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Healthcheck
        resp_health = await client.get("/healthz")
        assert resp_health.status_code == 200
        assert resp_health.json()["status"] == "HEALTHY"

        # Step 2: Manager uploads/seeds demo data
        resp_upload = await client.post("/api/v1/manager/upload")
        assert resp_upload.status_code == 200
        data_up = resp_upload.json()
        assert data_up["status"] == "SUCCESS"
        assert data_up["orders_parsed"] > 0

        # Step 3: Solve 48-Hour Plan
        resp_solve = await client.post("/api/v1/manager/solve-48h")
        assert resp_solve.status_code == 200
        plan = resp_solve.json()
        assert plan["kpi"]["heat_breaches_count"] == 0
        assert len(plan["heat_buffers"]) >= 2
        assert "Time-shifting saves rupees, not CO2" in plan["kpi"]["honest_co2_banner"]
        assert len(plan["citations"]) > 0

        # Step 4: Machine Breakdown at Slot 14 (CNC_1)
        resp_breakdown = await client.post(
            "/api/v1/breakdown/trigger",
            json={
                "machine_id": "CNC_1",
                "fault_slot": 14,
                "repair_duration_slots": 16,
                "reason": "Spindle motor overcurrent trip",
            },
        )
        assert resp_breakdown.status_code == 200
        bd_plan = resp_breakdown.json()
        assert bd_plan["trigger_type"] == "MACHINE_BREAKDOWN"
        assert bd_plan["kpi"]["heat_breaches_count"] == 0

        # Step 5: Weather Thermal Spike (+3.2°C)
        resp_spike = await client.post(
            "/api/v1/guardian/simulate-weather-spike",
            json={"slot_index": 28, "temp_spike_c": 3.2},
        )
        assert resp_spike.status_code == 200
        spike_res = resp_spike.json()
        assert spike_res["status"] == "WEATHER_SPIKE_APPLIED"

        # Step 6: Worker Thermal Check-in (Too Hot -> Buffer absorbed)
        resp_checkin = await client.post(
            "/api/v1/guardian/worker-checkin",
            json={"station_id": "FURNACE_BAY", "signal_category": "CHECKIN_TOO_HOT"},
        )
        assert resp_checkin.status_code == 200
        checkin_res = resp_checkin.json()
        assert checkin_res["rest_minutes_assigned"] == 15
        assert checkin_res["absorbed_by_buffer_id"] is not None

        # Step 7: Emergency SOS Zero-AI Hardware Halt
        resp_sos = await client.post(
            "/api/v1/safety/emergency-sos",
            json={"station_id": "FURNACE_BAY", "immediate_action": "IMMEDIATE_STOP"},
        )
        assert resp_sos.status_code == 200
        sos_res = resp_sos.json()
        assert sos_res["is_zero_ai_bypass"] is True
        assert "FURNACE_1" in sos_res["machines_halted"]
        assert sos_res["status"] == "EMERGENCY_HALT_BROADCAST"
