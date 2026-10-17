# External Cloud Services Adapters (`app/services`)

## Cloud Infrastructure Integrations (GCP asia-south1 / us-central1)

This module provides production-grade adapters to Google Cloud Platform services with seamless local fallback capability for zero demo downtime.

### 1. `bigquery_service.py` (asia-south1, Mumbai)
- Connects to `teevra_manufacturing_asia_south1`.
- Reads and writes:
  - `versioned_factor_table`: Official CEA, TGSPDCL tariffs, and ISO 7243 limits.
  - `plant_orders_and_loads`: Manager batch uploads.
  - `workstation_roster`: Station shift assignments, metabolic wattage, and clothing adjustments.
  - `weather_forecast_48h`: 192-slot diurnal thermal forecast cache.
  - `solved_schedules`: 192-slot schedules, KPIs, heat buffers, and grounded citations.
  - `safety_signals_audit_log`: Privacy-preserving log (zero worker PII, $k \ge 3$ aggregation).

### 2. `storage_service.py` (asia-south1)
- Streams manager CSV/XLSX/PDF uploads directly to `gs://<PROJECT_ID>-teevra-uploads`.
- Never stores customer manufacturing data permanently on local disk.

### 3. `firestore_fcm_service.py` (asia-south1)
- Synchronizes real-time station thermal status with web dashboards (`/supervisor`) and mobile PWAs (`/worker-mobile`).
- Emits high-priority FCM multicast pushes during Emergency SOS events.

### 4. `pubsub_service.py` (asia-south1)
- Event bus publishing to:
  - `teevra-machine-faults`
  - `teevra-weather-alerts`
  - `teevra-safety-signals`

### 5. `weather_integrator.py`
- Polls Open-Meteo for Hyderabad/Telangana coordinates (`lat=17.3850, lon=78.4867`).
- Implements conservative safety degradation if Open-Meteo API fails.
- Supports interactive heat spike simulation (`+3.2°C`) for judge demonstrations.

### 6. `gemini_flash_service.py` (global endpoint)
- Implements Gemini Function Calling with strict Pydantic JSON schemas.
- Generates natural language schedule summaries strictly constrained to deterministic figures.
- Grounded with citations to TGSPDCL Tariff Order and ISO 7243:2017 standard.

### 7. `gemini_live_service.py` (us-central1 endpoint)
- Real-time bidirectional WebSocket bridge for Telugu voice check-ins.
- Hands-free worker safety interaction.
