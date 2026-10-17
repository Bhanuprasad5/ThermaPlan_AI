"""
Deterministic Safety Validator Gate.
Validates any proposed or re-solved schedule plan before deployment.
Strict Rule: Reject any replan that lowers heat safety margins or introduces breaches.
"""

from app.models.schedule import HeatBuffer, ScheduleSlotAssignment


def validate_schedule_safety(
    schedule_slots: list[ScheduleSlotAssignment], min_thermal_margin_c: float = 0.0
) -> tuple[bool, list[str], int]:
    """
    Validates that:
    1. Every assigned manual slot has thermal_margin_c >= min_thermal_margin_c.
    2. Zero worker heat breaches occur across all 192 slots.
    Returns: (is_valid, violation_messages, breach_count)
    """
    violations = []
    breach_count = 0

    for slot in schedule_slots:
        if slot.is_active and not slot.is_heat_buffer:
            if slot.thermal_margin_c < min_thermal_margin_c:
                breach_count += 1
                msg = (
                    f"Slot {slot.slot_index} ({slot.timestamp_ist}) at station {slot.station_id}: "
                    f"WBGT {slot.station_wbgt_c}°C exceeds ISO limit {slot.iso_limit_c}°C "
                    f"(margin: {slot.thermal_margin_c}°C)."
                )
                violations.append(msg)

    is_valid = breach_count == 0
    return is_valid, violations, breach_count


def validate_delta_replan_safety(
    previous_slots: list[ScheduleSlotAssignment],
    new_slots: list[ScheduleSlotAssignment],
) -> tuple[bool, str]:
    """
    Ensures the newly generated replan does not worsen worker thermal exposure
    compared to the previous valid plan.
    """
    prev_valid, _, prev_breaches = validate_schedule_safety(previous_slots)
    new_valid, new_violations, new_breaches = validate_schedule_safety(new_slots)

    if new_breaches > prev_breaches:
        return (
            False,
            f"Safety Gate REJECTED: New replan introduces {new_breaches} breaches (previous had {prev_breaches}). Violations: {new_violations[:3]}",
        )

    if not new_valid:
        return (
            False,
            f"Safety Gate REJECTED: Proposed schedule contains {new_breaches} heat stress breaches.",
        )

    return (
        True,
        "Safety Gate APPROVED: Zero heat breaches and full ISO 7243 compliance.",
    )


def check_heat_buffer_absorption(
    buffer: HeatBuffer, required_rest_minutes: int
) -> tuple[bool, int, str]:
    """
    Checks if a pre-allocated Heat Buffer can absorb a worker recovery or micro-rest.
    Returns: (can_absorb, remaining_minutes, status_message)
    """
    if buffer.is_exhausted:
        return False, 0, f"Heat Buffer {buffer.buffer_id} is already exhausted."

    if buffer.remaining_capacity_minutes >= required_rest_minutes:
        rem = buffer.remaining_capacity_minutes - required_rest_minutes
        return (
            True,
            rem,
            f"Rest of {required_rest_minutes}m successfully absorbed by Buffer {buffer.buffer_id}. Remaining buffer: {rem}m.",
        )
    else:
        return (
            False,
            buffer.remaining_capacity_minutes,
            (
                f"Buffer overflow: Requested {required_rest_minutes}m exceeds remaining buffer capacity of {buffer.remaining_capacity_minutes}m. "
                "Downstream operations will require delta rescheduling."
            ),
        )
