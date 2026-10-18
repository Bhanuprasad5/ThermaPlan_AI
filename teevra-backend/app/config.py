"""
Configuration settings for TEEVRA Backend.
Reads environment variables with strong typing and production defaults.
"""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # GCP Project & Regions
    GCP_PROJECT_ID: str = "thermaplan-ai"
    GCP_REGION: str = "asia-south1"
    VERTEX_REGION: str = "global"
    VERTEX_LIVE_REGION: str = "us-central1"

    # BigQuery
    BIGQUERY_DATASET: str = "teevra_manufacturing_asia_south1"

    # Cloud Storage
    GCS_BUCKET_NAME: str = "thermaplan-ai-teevra-uploads"

    # Pub/Sub Topics
    PUBSUB_TOPIC_MACHINE_FAULTS: str = "teevra-machine-faults"
    PUBSUB_TOPIC_WEATHER_ALERTS: str = "teevra-weather-alerts"
    PUBSUB_TOPIC_SAFETY_SIGNALS: str = "teevra-safety-signals"

    # Firestore
    FIRESTORE_DATABASE: str = "(default)"

    # Coordinates: Hyderabad / Telangana industrial corridor
    PLANT_LATITUDE: float = 17.3850
    PLANT_LONGITUDE: float = 78.4867

    # Runtime Settings
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"
    USE_MOCK_FALLBACK_IF_CLOUD_UNAVAILABLE: bool = True

    # Vertex AI Model Names (Updated to gemini-3.8-flash)
    GEMINI_FLASH_MODEL: str = "gemini-3.8-flash"
    GEMINI_LIVE_MODEL: str = "gemini-3.8-flash"

    # Telegram alerts. Values stay in the local environment and are never sent to the browser.
    TELEGRAM_BOT_TOKEN: str = ""
    CHAT_ID: str = ""

    @field_validator("TELEGRAM_BOT_TOKEN", "CHAT_ID", mode="before")
    @classmethod
    def strip_secret_quotes(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().strip('"').strip("'")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
