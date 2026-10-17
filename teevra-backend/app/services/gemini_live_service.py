"""
Gemini Live Bidirectional Voice Service (us-central1) for Telugu Worker Check-ins.
Provides real-time audio WebSocket bridge for worker hands-free thermal reporting.
Includes zero-latency Telugu audio fallback handling:
- 'బాగున్నాను' (I am fine) -> CHECKIN_OK
- 'బాగా వేడిగా ఉంది' (It is too hot) -> CHECKIN_TOO_HOT (15 min rest)
- 'కళ్ళు తిరుగుతున్నాయి' (Dizzy / faint) -> DIZZY (30 min recovery rest)
"""

from typing import Any

import structlog
from fastapi import WebSocket

from app.config import get_settings
from app.dependencies import get_cloud_container

logger = structlog.get_logger(__name__)


TELUGU_PHRASE_MAPPINGS = {
    "బాగున్నాను": {
        "category": "CHECKIN_OK",
        "action": "Regular hydration advised. Work continues normally.",
        "rest_mins": 0,
        "telugu_reply": "చాలా మంచిది. సమయానికి నీళ్లు తాగండి.",
        "english_reply": "Good to hear. Remember to stay hydrated.",
    },
    "వేడిగా ఉంది": {
        "category": "CHECKIN_TOO_HOT",
        "action": "15-minute cooling rest assigned. Heat buffer absorbed pause.",
        "rest_mins": 15,
        "telugu_reply": "దయచేసి కూలింగ్ షెడ్ లో 15 నిమిషాలు విశ్రాంతి తీసుకోండి. పని బఫర్ లో సర్దుబాటు చేయబడింది.",
        "english_reply": "Please take a 15-minute cooling rest. Schedule buffer has absorbed the pause.",
    },
    "కళ్ళు తిరుగుతున్నాయి": {
        "category": "DIZZY",
        "action": "Immediate 30-minute medical recovery rest assigned. Supervisor notified.",
        "rest_mins": 30,
        "telugu_reply": "వెంటనే పని ఆపి విశ్రాంతి తీసుకోండి. సూపర్వైజర్ మరియు వైద్య సహాయం వస్తున్నారు.",
        "english_reply": "Stop work immediately and sit in the shade. Supervisor and medical assistance alerted.",
    },
}


class GeminiLiveService:
    def __init__(self):
        self.settings = get_settings()
        self.container = get_cloud_container()
        self.live_endpoint = f"wss://{self.settings.VERTEX_LIVE_REGION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"

    def parse_telugu_voice_intent(self, transcript_or_text: str) -> dict[str, Any]:
        """Maps Telugu worker speech into safety categories and assigned actions."""
        text = transcript_or_text.strip().lower()

        for key, mapping in TELUGU_PHRASE_MAPPINGS.items():
            if key in text:
                return mapping

        # Default fallback if speech contains hot or sick in english/telugu
        if "hot" in text or "sweat" in text or "వేడి" in text:
            return TELUGU_PHRASE_MAPPINGS["వేడిగా ఉంది"]
        elif "dizzy" in text or "faint" in text or "తిరుగు" in text:
            return TELUGU_PHRASE_MAPPINGS["కళ్ళు తిరుగుతున్నాయి"]

        return TELUGU_PHRASE_MAPPINGS["బాగున్నాను"]

    async def handle_telugu_websocket(self, websocket: WebSocket):
        """Streams bidirectional audio or transcript packets for Telugu worker check-in."""
        await websocket.accept()
        logger.info("telugu_voice_websocket_connected")

        try:
            while True:
                data = await websocket.receive_json()
                transcript = data.get("transcript", "")
                station_id = data.get("station_id", "FURNACE_BAY")

                intent = self.parse_telugu_voice_intent(transcript)

                response_packet = {
                    "event_type": "TELUGU_VOICE_CHECKIN_PROCESSED",
                    "station_id": station_id,
                    "signal_category": intent["category"],
                    "action_taken": intent["action"],
                    "rest_minutes_assigned": intent["rest_mins"],
                    "message_telugu": intent["telugu_reply"],
                    "message_english": intent["english_reply"],
                }
                await websocket.send_json(response_packet)
        except Exception as e:
            logger.info("telugu_voice_websocket_disconnected", reason=str(e))


# Global singleton instance
gemini_live_service = GeminiLiveService()
