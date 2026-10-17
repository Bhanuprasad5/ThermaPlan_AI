"""
Configuration settings for TEEVRA Backend.
Reads environment variables with strong typing and production defaults.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # GCP Project & Regions
    GCP_PROJECT_ID: str = "thermaplan-ai"
    GCP_REGION: str = "asia-south1"
    VERTEX_REGION: str = "us-central1"
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

    # Vertex AI Model Names
    GEMINI_FLASH_MODEL: str = "gemini-2.5-flash"
    GEMINI_LIVE_MODEL: str = "gemini-2.5-flash"


@lru_cache
def get_settings() -> Settings:
    return Settings()
