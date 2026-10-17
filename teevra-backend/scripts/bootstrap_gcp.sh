#!/usr/bin/env bash
# ==============================================================================
# TEEVRA GCP Infrastructure Bootstrap Script (asia-south1, Mumbai)
# Provisions:
# 1. Google Cloud Storage Bucket: gs://${GCP_PROJECT_ID}-teevra-uploads
# 2. BigQuery Dataset: teevra_manufacturing_asia_south1 & 6 strict tables
# 3. Google Cloud Pub/Sub Topics: machine faults, weather alerts, safety signals
# 4. Firestore Database in Datastore / Native mode
# ==============================================================================
set -euo pipefail

export GCP_PROJECT_ID="${GCP_PROJECT_ID:-thermaplan-ai}"
export REGION="asia-south1"
export DATASET_ID="teevra_manufacturing_asia_south1"
export BUCKET_NAME="${GCP_PROJECT_ID}-teevra-uploads"

echo "======================================================================"
echo "Starting TEEVRA Infrastructure Bootstrap for Project: ${GCP_PROJECT_ID}"
echo "Region: ${REGION}"
echo "======================================================================"

gcloud config set project "${GCP_PROJECT_ID}"

# 1. Create Google Cloud Storage Bucket
echo "--- Step 1: Provisioning GCS Bucket: gs://${BUCKET_NAME} ---"
if gsutil ls -b "gs://${BUCKET_NAME}" >/dev/null 2>&1; then
  echo "Bucket gs://${BUCKET_NAME} already exists."
else
  gsutil mb -p "${GCP_PROJECT_ID}" -c STANDARD -l "${REGION}" "gs://${BUCKET_NAME}"
  gsutil uniformbucketlevelaccess set on "gs://${BUCKET_NAME}"
fi

# 2. Create BigQuery Dataset in asia-south1
echo "--- Step 2: Provisioning BigQuery Dataset: ${DATASET_ID} ---"
if bq --location="${REGION}" show "${GCP_PROJECT_ID}:${DATASET_ID}" >/dev/null 2>&1; then
  echo "Dataset ${DATASET_ID} already exists."
else
  bq --location="${REGION}" mk --dataset --description="TEEVRA Production Scheduler Relational Store" "${GCP_PROJECT_ID}:${DATASET_ID}"
fi

# Create 6 BigQuery Tables
echo "--- Creating BigQuery Tables ---"

# Table 1: versioned_factor_table
bq query --use_legacy_sql=false "
CREATE TABLE IF NOT EXISTS \`${GCP_PROJECT_ID}.${DATASET_ID}.versioned_factor_table\` (
  factor_id STRING,
  regime STRING,
  parameter_name STRING,
  numeric_value FLOAT64,
  unit STRING,
  work_class INT64,
  acclimatised BOOL,
  tod_start_hour INT64,
  tod_end_hour INT64,
  tod_multiplier FLOAT64,
  source_document STRING,
  source_clause STRING,
  version_tag STRING,
  effective_date DATE
);"

# Table 2: plant_orders_and_loads
bq query --use_legacy_sql=false "
CREATE TABLE IF NOT EXISTS \`${GCP_PROJECT_ID}.${DATASET_ID}.plant_orders_and_loads\` (
  upload_batch_id STRING,
  order_id STRING,
  job_name STRING,
  machine_id STRING,
  station_id STRING,
  routing_seq INT64,
  duration_mins INT64,
  duration_slots INT64,
  kwh_per_op FLOAT64,
  restart_kwh FLOAT64,
  load_tag STRING,
  splittable BOOL,
  due_slot INT64,
  is_critical_melt BOOL
);"

# Table 3: workstation_roster
bq query --use_legacy_sql=false "
CREATE TABLE IF NOT EXISTS \`${GCP_PROJECT_ID}.${DATASET_ID}.workstation_roster\` (
  upload_batch_id STRING,
  station_id STRING,
  station_name STRING,
  shift_id STRING,
  workers_assigned INT64,
  work_class INT64,
  metabolic_watts INT64,
  acclimatised BOOL,
  clothing_adj_c FLOAT64,
  simulated_globe_uplift_c FLOAT64,
  has_qualified_relief BOOL,
  relief_operator_id STRING
);"

# Table 4: weather_forecast_48h
bq query --use_legacy_sql=false "
CREATE TABLE IF NOT EXISTS \`${GCP_PROJECT_ID}.${DATASET_ID}.weather_forecast_48h\` (
  forecast_id STRING,
  slot_index INT64,
  timestamp_ist TIMESTAMP,
  hour_of_day INT64,
  air_temp_c FLOAT64,
  relative_humidity_pct FLOAT64,
  natural_wet_bulb_c FLOAT64,
  ambient_globe_temp_c FLOAT64,
  is_solar_hour BOOL,
  is_peak_tariff_hour BOOL,
  source STRING
);"

# Table 5: solved_schedules
bq query --use_legacy_sql=false "
CREATE TABLE IF NOT EXISTS \`${GCP_PROJECT_ID}.${DATASET_ID}.solved_schedules\` (
  plan_id STRING,
  parent_plan_id STRING,
  created_at TIMESTAMP,
  trigger_type STRING,
  solver_status STRING,
  solve_time_sec FLOAT64,
  kpi_json JSON,
  schedule_slots_json JSON,
  heat_buffers_json JSON,
  gemini_explanation_text STRING,
  citations_json JSON
);"

# Table 6: safety_signals_audit_log
bq query --use_legacy_sql=false "
CREATE TABLE IF NOT EXISTS \`${GCP_PROJECT_ID}.${DATASET_ID}.safety_signals_audit_log\` (
  event_id STRING,
  created_at TIMESTAMP,
  station_id STRING,
  signal_category STRING,
  hazard_code STRING,
  action_taken STRING,
  rest_minutes_assigned INT64,
  absorbed_by_buffer_id STRING,
  triggered_replan BOOL,
  retention_expires_at TIMESTAMP
);"

# 3. Create Pub/Sub Topics in asia-south1
echo "--- Step 3: Provisioning Pub/Sub Topics ---"
for TOPIC in "teevra-machine-faults" "teevra-weather-alerts" "teevra-safety-signals"; do
  if gcloud pubsub topics describe "${TOPIC}" >/dev/null 2>&1; then
    echo "Topic ${TOPIC} already exists."
  else
    gcloud pubsub topics create "${TOPIC}"
  fi
done

echo "======================================================================"
echo "TEEVRA GCP Infrastructure Provisioning Completed Successfully!"
echo "======================================================================"
