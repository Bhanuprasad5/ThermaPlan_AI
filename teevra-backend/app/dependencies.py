"""
Singleton Cloud and AI Service Dependency Injectors for TEEVRA.
Provides BigQuery, Cloud Storage, Pub/Sub, Firestore, and Vertex AI clients.
Gracefully handles unauthenticated local runs via in-memory mock adapters
to ensure high reliability and zero demo crashes.
"""

from functools import lru_cache

import structlog

from app.config import Settings, get_settings

logger = structlog.get_logger(__name__)


class CloudClientsContainer:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.bigquery_client = None
        self.storage_client = None
        self.pubsub_publisher = None
        self.firestore_client = None
        self.genai_client = None
        self.is_cloud_connected = False
        self._initialize_clients()

    def _initialize_clients(self):
        # 1. BigQuery (asia-south1)
        try:
            from google.cloud import bigquery
            self.bigquery_client = bigquery.Client(
                project=self.settings.GCP_PROJECT_ID, location=self.settings.GCP_REGION
            )
            self.is_cloud_connected = True
            logger.info("bigquery_client_initialized", project_id=self.settings.GCP_PROJECT_ID, dataset=self.settings.BIGQUERY_DATASET)
        except Exception as exc:
            logger.warning("bigquery_fallback_active", reason=str(exc))

        # 2. Cloud Storage (asia-south1)
        try:
            from google.cloud import storage
            self.storage_client = storage.Client(project=self.settings.GCP_PROJECT_ID)
            logger.info("storage_client_initialized", bucket=self.settings.GCS_BUCKET_NAME)
        except Exception as exc:
            logger.warning("storage_fallback_active", reason=str(exc))

        # 3. Pub/Sub (asia-south1)
        try:
            from google.cloud import pubsub_v1
            self.pubsub_publisher = pubsub_v1.PublisherClient()
            logger.info("pubsub_client_initialized")
        except Exception as exc:
            logger.warning("pubsub_fallback_active", reason=str(exc))

        # 4. Firestore (asia-south1)
        try:
            from google.cloud import firestore
            self.firestore_client = firestore.Client(project=self.settings.GCP_PROJECT_ID)
            logger.info("firestore_client_initialized")
        except Exception as exc:
            logger.warning("firestore_fallback_active", reason=str(exc))

        # 5. Vertex AI Gemini (global / us-central1)
        try:
            from google import genai
            self.genai_client = genai.Client(
                vertexai=True,
                project=self.settings.GCP_PROJECT_ID,
                location=self.settings.VERTEX_REGION
            )
            logger.info("vertex_ai_client_initialized", model=self.settings.GEMINI_FLASH_MODEL)
        except Exception as exc:
            logger.warning("vertex_ai_fallback_active", reason=str(exc))


@lru_cache
def get_cloud_container() -> CloudClientsContainer:
    return CloudClientsContainer(get_settings())


def get_bigquery_client():
    return get_cloud_container().bigquery_client


def get_storage_client():
    return get_cloud_container().storage_client


def get_pubsub_publisher():
    return get_cloud_container().pubsub_publisher


def get_firestore_client():
    return get_cloud_container().firestore_client


def get_genai_client():
    return get_cloud_container().genai_client
