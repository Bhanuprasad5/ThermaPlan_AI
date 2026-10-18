# TEEVRA Scripts Package

This directory provides scripts to provision and seed Google Cloud infrastructure:

## 1. `bootstrap_gcp.sh`
Creates:
- Google Cloud Storage Bucket `gs://<PROJECT_ID>-teevra-uploads` in `asia-south1`.
- BigQuery Dataset `teevra_manufacturing_asia_south1` with all 6 required tables.
- Google Cloud Pub/Sub topics:
  - `teevra-machine-faults`
  - `teevra-weather-alerts`
  - `teevra-safety-signals`

## 2. `seed_bigquery_factors.py`
Populates official rulebooks:
- CEA Grid Factor v22 (0.675 tCO2/MWh).
- TGSPDCL Time-of-Day Tariffs (Base ₹7.50, Solar ₹6.00, Peak ₹9.00).
- ISO 7243:2017 Table A.1 Heat Limits (Classes 0 to 4).
- 48-Hour (192-slot) diurnal weather baseline.

## 3. `generate_demo_uploads.py`
Generates realistic Telangana manufacturing orders and workstation rosters for manager upload testing.
