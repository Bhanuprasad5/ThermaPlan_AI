"""Sends a selected incident photo to Gemini, then to the configured Telegram chat."""

import json
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import structlog

from app.config import get_settings
from app.dependencies import get_cloud_container

logger = structlog.get_logger(__name__)

INCIDENT_DIR = Path(__file__).resolve().parents[1] / "data" / "incidents"
INCIDENT_PHOTOS = {
    "slip": {"file": "incident-slip.jpg", "mime": "image/jpeg", "label": "Slip and spill"},
    "smoke": {"file": "incident-smoke.jpg", "mime": "image/jpeg", "label": "Oven smoke"},
    "heat": {"file": "incident-heat.jpg", "mime": "image/jpeg", "label": "Heat distress"},
}

ASSESSMENT_PROMPT = """
You are helping a factory manager understand one workplace photo.
Describe only what is visible. Do not invent names, measurements, medical diagnoses, or events outside the frame.
Return JSON with exactly these keys:
{"situation": "two to four plain sentences", "recommended_action": "one or two practical sentences for the supervisor"}
If the image is unclear, say so in situation.
""".strip()


def load_incident_photo(image_id: str) -> tuple[bytes, str, str]:
    spec = INCIDENT_PHOTOS.get(image_id)
    if spec is None:
        raise ValueError("Unknown incident image")
    path = INCIDENT_DIR / spec["file"]
    if not path.is_file():
        raise FileNotFoundError(spec["file"])
    return path.read_bytes(), spec["mime"], spec["label"]


def describe_incident(image_bytes: bytes, mime_type: str) -> dict[str, str]:
    settings = get_settings()
    client = get_cloud_container().genai_client
    if client is None:
        raise RuntimeError("Gemini is not connected")

    from google.genai import types

    models = [settings.GEMINI_FLASH_MODEL]
    last_error = "Gemini did not return an assessment"
    for model in models:
        try:
            response = client.models.generate_content(
                model=model,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    ASSESSMENT_PROMPT,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )
            parsed = json.loads(response.text or "{}")
            situation = str(parsed.get("situation", "")).strip()
            action = str(parsed.get("recommended_action", "")).strip()
            if not situation:
                raise ValueError("Gemini returned an empty situation")
            return {
                "situation": situation,
                "recommended_action": action or "Check the station in person before acting.",
                "model": model,
            }
        except Exception as exc:
            last_error = str(exc)
            logger.warning("incident_gemini_attempt_failed", model=model, error=last_error)
    raise RuntimeError(last_error)


def _multipart(fields: dict[str, str], file_field: str, filename: str, content: bytes, mime: str) -> tuple[bytes, str]:
    boundary = f"----teevra{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
        )
    chunks.append(
        (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {mime}\r\n\r\n"
        ).encode()
        + content
        + b"\r\n"
    )
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), boundary


def send_telegram_photo(image_bytes: bytes, filename: str, mime: str, caption: str) -> int:
    settings = get_settings()
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.CHAT_ID
    if not token or not chat_id:
        raise RuntimeError("Telegram bot settings are missing")

    body, boundary = _multipart(
        {"chat_id": chat_id, "caption": caption[:1024]},
        "photo",
        filename,
        image_bytes,
        mime,
    )
    request = Request(
        f"https://api.telegram.org/bot{token}/sendPhoto",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        exc.read()
        raise RuntimeError(f"Telegram rejected the alert ({exc.code})") from exc
    except URLError as exc:
        raise RuntimeError("Telegram could not be reached") from exc

    if not payload.get("ok"):
        raise RuntimeError("Telegram did not accept the alert")
    return int(payload.get("result", {}).get("message_id", 0))


def build_caption(station_name: str, label: str, assessment: dict[str, str], timestamp: str) -> str:
    return (
        "TEEVRA SOS\n"
        f"Station: {station_name}\n"
        f"Photo: {label}\n"
        f"Time: {timestamp}\n\n"
        "What Gemini sees:\n"
        f"{assessment['situation']}\n\n"
        "Suggested response:\n"
        f"{assessment['recommended_action']}\n\n"
        f"Automated assessment from {assessment['model']}. Confirm on the floor before acting."
    )
