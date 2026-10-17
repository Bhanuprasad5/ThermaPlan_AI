# TEEVRA GCP Infrastructure Bootstrap Script (PowerShell for Windows)
# Provisions:
# 1. Google Cloud Storage Bucket: gs://thermaplan-ai-teevra-uploads
# 2. BigQuery Dataset: teevra_manufacturing_asia_south1 & 6 strict tables
# 3. Google Cloud Pub/Sub Topics: machine faults, weather alerts, safety signals
# 4. Firestore Database
$ErrorActionPreference = "Stop"

$env:Path = "C:\Users\chouk\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin;" + $env:Path

$PROJECT_ID = "thermaplan-ai"
$REGION = "asia-south1"
$DATASET_ID = "teevra_manufacturing_asia_south1"
$BUCKET_NAME = "thermaplan-ai-teevra-uploads"

Write-Host "======================================================================"
Write-Host "Starting TEEVRA Cloud Provisioning for: $PROJECT_ID ($REGION)"
Write-Host "======================================================================"

# 1. GCS Bucket
Write-Host "`n--- Step 1: Provisioning GCS Bucket: gs://$BUCKET_NAME ---"
try {
    gsutil ls -b "gs://$BUCKET_NAME" 2>$null
    Write-Host "Bucket gs://$BUCKET_NAME already exists."
} catch {
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION "gs://$BUCKET_NAME"
    gsutil uniformbucketlevelaccess set on "gs://$BUCKET_NAME"
    Write-Host "Created GCS Bucket gs://$BUCKET_NAME"
}

# 2. BigQuery Dataset
Write-Host "`n--- Step 2: Provisioning BigQuery Dataset: $DATASET_ID ---"
$dsCheck = bq --location=$REGION show "$PROJECT_ID`:$DATASET_ID" 2>&1
if ($LASTEXITCODE -ne 0) {
    bq --location=$REGION mk --dataset --description="TEEVRA Production Scheduler Relational Store" "$PROJECT_ID`:$DATASET_ID"
    Write-Host "Created BigQuery Dataset $DATASET_ID"
} else {
    Write-Host "BigQuery Dataset $DATASET_ID already exists."
}

# 3. BigQuery Tables
Write-Host "`n--- Creating 6 BigQuery Tables ---"

# Table 1: versioned_factor_table
bq query --use_legacy_sql=false "
CREATE TABLE IF NOT EXISTS \`$PROJECT_ID.$DATASET_ID.versioned_factor_table\` (
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
CREATE TABLE IF NOT EXISTS \`$PROJECT_ID.$DATASET_ID.plant_orders_and_loads\` (
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
CREATE TABLE IF NOT EXISTS \`$PROJECT_ID.$DATASET_ID.workstation_roster\` (
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
CREATE TABLE IF NOT EXISTS \`$PROJECT_ID.$DATASET_ID.weather_forecast_48h\` (
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
CREATE TABLE IF NOT EXISTS \`$PROJECT_ID.$DATASET_ID.solved_schedules\` (
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
CREATE TABLE IF NOT EXISTS \`$PROJECT_ID.$DATASET_ID.safety_signals_audit_log\` (
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

# 4. Pub/Sub Topics
Write-Host "`n--- Step 3: Provisioning Pub/Sub Topics ---"
foreach ($TOPIC in @("teevra-machine-faults", "teevra-weather-alerts", "teevra-safety-signals")) {
    $tCheck = gcloud pubsub topics describe $TOPIC 2>&1
    if ($LASTEXITCODE -ne 0) {
        gcloud pubsub topics create $TOPIC
        Write-Host "Created topic: $TOPIC"
    } else {
        Write-Host "Topic $TOPIC already exists."
    }
}

Write-Host "`n======================================================================"
Write-Host "Cloud Infrastructure Provisioning Complete in $REGION!"
Write-Host "======================================================================"
