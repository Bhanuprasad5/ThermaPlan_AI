"""
Google Cloud Pub/Sub Service for TEEVRA (asia-south1).
Publishes asynchronous event bus notifications:
- Machine Faults (teevra-machine-faults)
- Weather Alerts & Heat Spikes (teevra-weather-alerts)
- Safety & Emergency SOS Signals (teevra-safety-signals)
"""

import json
from typing import Any

import structlog

from app.config import get_settings
from app.dependencies import get_cloud_container

logger = structlog.get_logger(__name__)


class PubSubService:
    def __init__(self):
        self.settings = get_settings()
        self.container = get_cloud_container()

    def publish_event(self, topic_name: str, payload: dict[str, Any]) -> str:
        """Publishes JSON event to specified Pub/Sub topic."""
        message_data = json.dumps(payload).encode("utf-8")

        if self.container.is_cloud_connected and self.container.pubsub_publisher:
            try:
                topic_path = self.container.pubsub_publisher.topic_path(
                    self.settings.GCP_PROJECT_ID, topic_name
                )
                future = self.container.pubsub_publisher.publish(
                    topic_path, message_data
                )
                message_id = future.result(timeout=5.0)
                logger.info("pubsub_published", topic=topic_name, message_id=message_id)
                return str(message_id)
            except Exception as e:
                logger.warning(
                    "pubsub_publish_failed_using_simulated",
                    error=str(e),
                    topic=topic_name,
                )

        return f"SIMULATED_MSG_{topic_name}_{payload.get('event_id', 'none')}"

    def publish_machine_fault(
        self, machine_id: str, fault_slot: int, repair_duration_slots: int, reason: str
    ) -> str:
        payload = {
            "event_type": "MACHINE_FAULT",
            "machine_id": machine_id,
            "fault_slot": fault_slot,
            "repair_duration_slots": repair_duration_slots,
            "reason": reason,
        }
        return self.publish_event(self.settings.PUBSUB_TOPIC_MACHINE_FAULTS, payload)

    def publish_weather_alert(
        self, slot_index: int, temp_spike_c: float, station_breaches: list
    ) -> str:
        payload = {
            "event_type": "WEATHER_THERMAL_ALERT",
            "slot_index": slot_index,
            "temp_spike_c": temp_spike_c,
            "station_breaches": station_breaches,
        }
        return self.publish_event(self.settings.PUBSUB_TOPIC_WEATHER_ALERTS, payload)

    def publish_safety_signal(
        self, event_id: str, station_id: str, signal_category: str, action: str
    ) -> str:
        payload = {
            "event_type": "SAFETY_SIGNAL",
            "event_id": event_id,
            "station_id": station_id,
            "signal_category": signal_category,
            "action": action,
        }
        return self.publish_event(self.settings.PUBSUB_TOPIC_SAFETY_SIGNALS, payload)


# Global singleton instance
pubsub_service = PubSubService()
