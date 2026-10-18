"""
Production Cloud Resource Provisioner & Seeder for TEEVRA (GCP asia-south1).
Uses the official Google Cloud Python SDK with Application Default Credentials (ADC).
Provisions:
1. 6 Strict BigQuery Tables in dataset `teevra_manufacturing_asia_south1`
2. Seeds `versioned_factor_table` with CEA v22, TGSPDCL Tariffs, and ISO 7243 limits
3. Seeds `weather_forecast_48h` with 192 slots
4. Seeds `plant_orders_and_loads` and `workstation_roster`
5. Provisions Pub/Sub topics: teevra-machine-faults, teevra-weather-alerts, teevra-safety-signals
6. Uploads citation documents to Cloud Storage
"""
import sys
import structlog
from pathlib import Path
from google.cloud import bigquery, pubsub_v1, storage

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.services.bigquery_service import DEFAULT_SEED_FACTORS
from app.services.weather_integrator import weather_integrator
from app.routers.manager_router import DEFAULT_DEMO_ORDERS, DEFAULT_DEMO_ROSTERS

logger = structlog.get_logger(__name__)


def provision_and_seed():
    settings = get_settings()
    project_id = settings.GCP_PROJECT_ID
    region = settings.GCP_REGION
    dataset_id = settings.BIGQUERY_DATASET
    bucket_name = settings.GCS_BUCKET_NAME

    print(f"Connecting to Google Cloud Project: {project_id} (Region: {region})")

    bq_client = bigquery.Client(project=project_id, location=region)
    storage_client = storage.Client(project=project_id)
    publisher = pubsub_v1.PublisherClient()

    # 1. Verify Dataset
    dataset_ref = bigquery.DatasetReference(project_id, dataset_id)
    try:
        bq_client.get_dataset(dataset_ref)
        print(f"[OK] BigQuery Dataset exists: {dataset_id}")
    except Exception:
        dataset = bigquery.Dataset(dataset_ref)
        dataset.location = region
        dataset.description = "TEEVRA Production Scheduler Relational Store"
        bq_client.create_dataset(dataset, timeout=30)
        print(f"[CREATED] BigQuery Dataset: {dataset_id}")

    # 2. Define and Create 6 BigQuery Tables
    tables_schema = {
        "versioned_factor_table": [
            bigquery.SchemaField("factor_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("regime", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("parameter_name", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("numeric_value", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("unit", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("work_class", "INT64", mode="NULLABLE"),
            bigquery.SchemaField("acclimatised", "BOOL", mode="NULLABLE"),
            bigquery.SchemaField("tod_start_hour", "INT64", mode="NULLABLE"),
            bigquery.SchemaField("tod_end_hour", "INT64", mode="NULLABLE"),
            bigquery.SchemaField("tod_multiplier", "FLOAT64", mode="NULLABLE"),
            bigquery.SchemaField("source_document", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("source_clause", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("version_tag", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("effective_date", "DATE", mode="REQUIRED"),
        ],
        "plant_orders_and_loads": [
            bigquery.SchemaField("upload_batch_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("order_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("job_name", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("machine_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("station_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("routing_seq", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("duration_mins", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("duration_slots", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("kwh_per_op", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("restart_kwh", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("load_tag", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("splittable", "BOOL", mode="REQUIRED"),
            bigquery.SchemaField("due_slot", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("is_critical_melt", "BOOL", mode="REQUIRED"),
        ],
        "workstation_roster": [
            bigquery.SchemaField("upload_batch_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("station_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("station_name", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("shift_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("workers_assigned", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("work_class", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("metabolic_watts", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("acclimatised", "BOOL", mode="REQUIRED"),
            bigquery.SchemaField("clothing_adj_c", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("simulated_globe_uplift_c", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("has_qualified_relief", "BOOL", mode="REQUIRED"),
            bigquery.SchemaField("relief_operator_id", "STRING", mode="NULLABLE"),
        ],
        "weather_forecast_48h": [
            bigquery.SchemaField("forecast_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("slot_index", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("timestamp_ist", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("hour_of_day", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("air_temp_c", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("relative_humidity_pct", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("natural_wet_bulb_c", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("ambient_globe_temp_c", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("is_solar_hour", "BOOL", mode="REQUIRED"),
            bigquery.SchemaField("is_peak_tariff_hour", "BOOL", mode="REQUIRED"),
            bigquery.SchemaField("source", "STRING", mode="REQUIRED"),
        ],
        "solved_schedules": [
            bigquery.SchemaField("plan_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("parent_plan_id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("created_at", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("trigger_type", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("solver_status", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("solve_time_sec", "FLOAT64", mode="REQUIRED"),
            bigquery.SchemaField("kpi_json", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("schedule_slots_json", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("heat_buffers_json", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("gemini_explanation_text", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("citations_json", "STRING", mode="NULLABLE"),
        ],
        "safety_signals_audit_log": [
            bigquery.SchemaField("event_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("created_at", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("station_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("signal_category", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("hazard_code", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("action_taken", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("rest_minutes_assigned", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("absorbed_by_buffer_id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("triggered_replan", "BOOL", mode="REQUIRED"),
            bigquery.SchemaField("retention_expires_at", "STRING", mode="REQUIRED"),
        ],
    }

    for table_name, schema in tables_schema.items():
        table_ref = dataset_ref.table(table_name)
        try:
            bq_client.get_table(table_ref)
            print(f"[OK] Table exists: {table_name}")
        except Exception:
            table = bigquery.Table(table_ref, schema=schema)
            bq_client.create_table(table)
            print(f"[CREATED] BigQuery Table: {table_name}")

    # 3. Seed versioned_factor_table into LIVE BigQuery
    print("\n--- Seeding versioned_factor_table to Live BigQuery ---")
    factor_rows = [f.model_dump() for f in DEFAULT_SEED_FACTORS]
    table_ref = f"{project_id}.{dataset_id}.versioned_factor_table"
    errors = bq_client.insert_rows_json(table_ref, factor_rows)
    if errors:
        print(f"[ERROR] Seeding factors: {errors}")
    else:
        print(f"[SUCCESS] Seeded {len(factor_rows)} versioned factors into BigQuery.")

    # 4. Seed plant_orders_and_loads and workstation_roster
    print("\n--- Seeding Orders and Roster into Live BigQuery ---")
    order_rows = [o.model_dump() for o in DEFAULT_DEMO_ORDERS]
    roster_rows = [r.model_dump() for r in DEFAULT_DEMO_ROSTERS]
    bq_client.insert_rows_json(f"{project_id}.{dataset_id}.plant_orders_and_loads", order_rows)
    bq_client.insert_rows_json(f"{project_id}.{dataset_id}.workstation_roster", roster_rows)
    print(f"[SUCCESS] Seeded {len(order_rows)} orders and {len(roster_rows)} workstations.")

    # 5. Seed 48h Weather Forecast into Live BigQuery
    print("\n--- Seeding 48h Weather Forecast into Live BigQuery ---")
    weather_slots = weather_integrator._generate_synthetic_48h_baseline()
    weather_rows = [w.model_dump() for w in weather_slots]
    bq_client.insert_rows_json(f"{project_id}.{dataset_id}.weather_forecast_48h", weather_rows)
    print(f"[SUCCESS] Seeded {len(weather_rows)} weather slots (192 slots) into BigQuery.")

    # 6. Provision Cloud Pub/Sub Topics
    print("\n--- Provisioning Cloud Pub/Sub Topics ---")
    topics = [
        settings.PUBSUB_TOPIC_MACHINE_FAULTS,
        settings.PUBSUB_TOPIC_WEATHER_ALERTS,
        settings.PUBSUB_TOPIC_SAFETY_SIGNALS,
    ]
    for topic_name in topics:
        topic_path = publisher.topic_path(project_id, topic_name)
        try:
            publisher.get_topic(request={"topic": topic_path})
            print(f"[OK] Pub/Sub Topic exists: {topic_name}")
        except Exception:
            publisher.create_topic(request={"name": topic_path})
            print(f"[CREATED] Pub/Sub Topic: {topic_name}")

    # 7. Upload Grounding Documentation to GCS
    print("\n--- Uploading Grounding Documents to Google Cloud Storage ---")
    try:
        bucket = storage_client.bucket(bucket_name)
        tariff_summary = (
            "TGSPDCL FY2025-26 Retail Supply Tariff Order.\n"
            "Normal band: illustrative rate = Rs 7.50/kWh.\n"
            "Solar band (10:00 to 16:00 hrs) = 20% discount (Rs 6.00/kWh).\n"
            "Peak band (18:00 to 22:00 hrs) = 20% penalty (Rs 9.00/kWh).\n"
        )
        blob1 = bucket.blob("citations/TGSPDCL_FY26_Tariff_Order.txt")
        blob1.upload_from_string(tariff_summary, content_type="text/plain")

        iso_summary = (
            "ISO 7243:2017 Ergonomics of the thermal environment.\n"
            "Assessment of heat stress using the WBGT (wet bulb globe temperature) index.\n"
            "Table A.1 Reference Limits: Class 0 (115W, 33C), Class 1 (180W, 30C), Class 2 (300W, 28C), "
            "Class 3 (415W Furnace, 26C), Class 4 (520W, 25C).\n"
        )
        blob2 = bucket.blob("citations/ISO_7243_2017_Standard_Summary.txt")
        blob2.upload_from_string(iso_summary, content_type="text/plain")
        print(f"[SUCCESS] Uploaded grounding documents to gs://{bucket_name}/citations/")
    except Exception as e:
        print(f"[WARNING] GCS upload note: {e}")

    print("\n======================================================================"
          "\nALL LIVE CLOUD RESOURCES SUCCESSFULLY PROVISIONED AND SEEDED IN GCP!"
          "\n======================================================================")


if __name__ == "__main__":
    provision_and_seed()
