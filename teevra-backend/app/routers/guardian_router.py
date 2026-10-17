"""
Heat Stress Guardian & Heat Buffer Router (Feature 4 & Feature 6):
- Hourly live weather polling & simulated heat spike testing (+3.2°C)
- Live station thermal telemetry (WBGT, ISO limits, thermal margins)
- Worker thermal check-in & automated Heat Buffer absorption (5-15m micro-rests)
- Bidirectional WebSocket for Telugu hands-free voice check-in
"""

import uuid
from typing import Any

from fastapi import APIRouter, WebSocket

from app.core_math.safety_validator import check_heat_buffer_absorption
from app.core_math.wbgt_calculator import (
    calculate_effective_wbgt,
    evaluate_thermal_margin,
    get_station_globe_temp,
)
from app.models.domain import WeatherSpikeRequest
from app.models.safety import WorkerCheckInRequest, WorkerCheckInResponse
from app.services.bigquery_service import bq_service
from app.services.firestore_fcm_service import firestore_fcm_service
from app.services.gemini_live_service import TELUGU_PHRASE_MAPPINGS, gemini_live_service
from app.services.pubsub_service import pubsub_service
from app.services.weather_integrator import weather_integrator

router = APIRouter(prefix="/api/v1/guardian", tags=["Heat Stress Guardian"])


@router.post("/simulate-weather-spike", response_model=dict[str, Any])
async def simulate_weather_spike(req: WeatherSpikeRequest):
    """
    Judge Demo Trigger: Injects an unexpected temperature spike (+3.2°C)
    at the specified slot index (default slot 28 = Day 1, 13:00 IST).
    Evaluates station thermal margins and triggers Heat Buffer absorption or delta replan.
    """
    updated_weather = weather_integrator.simulate_weather_spike(
        req.slot_index, req.temp_spike_c
    )
    bq_service.save_weather_forecast_48h(updated_weather)

    spike_slot = updated_weather[req.slot_index]
    rosters = bq_service.get_workstation_roster()

    station_impacts = []
    breach_stations = []

    for r in rosters:
        globe_t, _ = get_station_globe_temp(
            spike_slot.ambient_globe_temp_c, r.simulated_globe_uplift_c
        )
        wbgt_eff = calculate_effective_wbgt(
            wet_bulb_c=spike_slot.natural_wet_bulb_c,
            globe_temp_c=globe_t,
            air_temp_c=spike_slot.air_temp_c,
            clothing_adj_c=r.clothing_adj_c,
        )
        thm = evaluate_thermal_margin(wbgt_eff, r.work_class, r.acclimatised)
        station_impacts.append(
            {
                "station_id": r.station_id,
                "station_wbgt_c": wbgt_eff,
                "iso_limit_c": thm["iso_limit_c"],
                "thermal_margin_c": thm["thermal_margin_c"],
                "is_breach": thm["is_breach"],
            }
        )
        if thm["is_breach"]:
            breach_stations.append(r.station_id)

    # Publish weather thermal alert to Pub/Sub
    pubsub_service.publish_weather_alert(
        slot_index=req.slot_index,
        temp_spike_c=req.temp_spike_c,
        station_breaches=breach_stations,
    )

    # Check if active plan's Heat Buffers can absorb the spike
    active_plan = bq_service.get_latest_solved_schedule()
    buffer_absorbed = False
    if active_plan:
        for buf in active_plan.heat_buffers:
            if buf.start_slot <= req.slot_index < buf.end_slot:
                buffer_absorbed = True
                firestore_fcm_service.update_station_state(
                    buf.station_id,
                    {
                        "alert": f"Spike of +{req.temp_spike_c}°C absorbed by Heat Buffer {buf.buffer_id}."
                    },
                )

    return {
        "status": "WEATHER_SPIKE_APPLIED",
        "slot_index": req.slot_index,
        "temperature_spike_c": req.temp_spike_c,
        "new_ambient_air_c": spike_slot.air_temp_c,
        "new_wet_bulb_c": spike_slot.natural_wet_bulb_c,
        "heat_buffer_absorbed": buffer_absorbed,
        "breach_stations_count": len(breach_stations),
        "station_thermal_evaluations": station_impacts,
    }


@router.post("/worker-checkin", response_model=WorkerCheckInResponse)
async def process_worker_checkin(req: WorkerCheckInRequest):
    """
    Worker Thermal Check-In:
    - Zero worker PII stored.
    - If worker reports CHECKIN_TOO_HOT or DIZZY, assigns rest and absorbs into Heat Buffer.
    - If buffer overflows, flags delta replan requirement.
    """
    event_id = f"EVT_{uuid.uuid4().hex[:8].upper()}"
    active_plan = bq_service.get_latest_solved_schedule()

    rest_mins = (
        15
        if req.signal_category == "CHECKIN_TOO_HOT"
        else (30 if req.signal_category == "DIZZY" else 0)
    )
    action_taken = "Hydration check. Continue work."
    absorbed_buffer_id = None
    triggered_replan = False
    tel_msg = TELUGU_PHRASE_MAPPINGS["బాగున్నాను"]["telugu_reply"]
    eng_msg = TELUGU_PHRASE_MAPPINGS["బాగున్నాను"]["english_reply"]

    if rest_mins > 0:
        matching_buf = None
        if active_plan:
            for buf in active_plan.heat_buffers:
                if buf.station_id == req.station_id and not buf.is_exhausted:
                    matching_buf = buf
                    break

        if matching_buf:
            can_absorb, remaining, msg = check_heat_buffer_absorption(
                matching_buf, rest_mins
            )
            if can_absorb:
                matching_buf.remaining_capacity_minutes = remaining
                matching_buf.absorbed_incident_ids.append(event_id)
                absorbed_buffer_id = matching_buf.buffer_id
                action_taken = f"{rest_mins}m rest absorbed by Heat Buffer {matching_buf.buffer_id}."
                tel_msg = f"{rest_mins} నిమిషాలు విశ్రాంతి తీసుకోండి. హీట్ బఫర్ పనిని రక్షించింది."
                eng_msg = f"Take a {rest_mins}m cooling rest. Pre-allocated Heat Buffer absorbed the pause."
            else:
                matching_buf.is_exhausted = True
                triggered_replan = True
                action_taken = "Buffer overflow. Line rescheduled to protect workers."
                tel_msg = "వెంటనే విశ్రాంతి తీసుకోండి. పని సమయం మార్చబడుతోంది."
                eng_msg = "Please rest immediately. Work is being rescheduled."
        else:
            action_taken = f"{rest_mins}m rest assigned. Supervisor notified."
            tel_msg = "విశ్రాంతి తీసుకోండి. సూపర్వైజర్ సహాయం చేస్తున్నారు."
            eng_msg = "Rest assigned. Supervisor notified."

    # Audit log (privacy-preserving)
    bq_service.log_safety_signal(
        event_id=event_id,
        station_id=req.station_id,
        signal_category=req.signal_category,
        action_taken=action_taken,
        rest_minutes=rest_mins,
        absorbed_by_buffer_id=absorbed_buffer_id,
        triggered_replan=triggered_replan,
    )

    firestore_fcm_service.update_station_state(
        req.station_id,
        {"last_signal": req.signal_category, "rest_active_mins": rest_mins},
    )

    return WorkerCheckInResponse(
        event_id=event_id,
        station_id=req.station_id,
        action_taken=action_taken,
        rest_minutes_assigned=rest_mins,
        absorbed_by_buffer_id=absorbed_buffer_id,
        triggered_replan=triggered_replan,
        message_telugu=tel_msg,
        message_english=eng_msg,
    )


@router.get("/station-telemetry")
async def get_station_telemetry():
    """Returns live thermal conditions and buffer status for all workstations."""
    return firestore_fcm_service.get_all_station_states()


@router.websocket("/ws/telugu-voice")
async def websocket_telugu_voice(websocket: WebSocket):
    """Bidirectional WebSocket for hands-free Telugu voice check-in."""
    await gemini_live_service.handle_telugu_websocket(websocket)
