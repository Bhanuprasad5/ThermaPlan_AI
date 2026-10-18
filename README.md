# TEEVRA: Heat-Safe, Carbon-Aware Industrial Production Scheduler

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.12](https://img.shields.io/badge/Python-3.12-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React: 19](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Google OR-Tools](https://img.shields.io/badge/Google_OR--Tools-CP--SAT_v9.11-4285F4.svg?logo=google&logoColor=white)](https://developers.google.com/optimization)
[![Google Cloud Run](https://img.shields.io/badge/Google_Cloud_Run-Production-4285F4.svg?logo=google-cloud&logoColor=white)](https://cloud.google.com/run)
[![Firebase Hosting](https://img.shields.io/badge/Firebase_Hosting-Production-FFCA28.svg?logo=firebase&logoColor=black)](https://firebase.google.com/)

TEEVRA is an automated, industrial-grade 48-hour continuous production scheduler designed for heavy thermal and metallurgical manufacturing facilities in South Asia. Operating across 192 discrete 15-minute planning slots and 16 heterogeneous workstations, TEEVRA simultaneously solves for statutory thermal safety thresholds under **ISO 7243:2017** and the **Occupational Safety, Health and Working Conditions (OSH) Code 2020**, while optimizing against industrial **Time-of-Day (ToD)** electricity tariffs and **Central Electricity Authority (CEA)** grid emission factors.

---

## 🏛️ System Architecture

```
                          ┌──────────────────────────────────────────────┐
                          │         Cloud Client Presentation Layer       │
                          │        React 19 + TypeScript + Vite HMI      │
                          │             (Firebase Global CDN)            │
                          └──────┬───────────────────────────────▲───────┘
                                 │ HTTP / JSON API               │ WebSocket / SSE
                                 ▼                               │ Real-time Telemetry
                          ┌──────────────────────────────────────┴───────┐
                          │           FastAPI High-Concurrence Engine     │
                          │          (Google Cloud Run Managed VPC)      │
                          └──────┬───────────────┬───────────────┬───────┘
                                 │               │               │
                 ┌───────────────▼──────┐ ┌──────▼───────┐ ┌─────▼────────────────┐
                 │ Google OR-Tools      │ │ Vertex AI    │ │ Google Cloud Storage │
                 │ CP-SAT Discrete      │ │ Gemini Flash │ │ & BigQuery Data Lake │
                 │ Solver Engine        │ │ Critic & NLP │ │ Telemetry & Schema   │
                 └──────────────────────┘ └──────────────┘ └──────────────────────┘
```

The system comprises three decoupled architectural tiers:
1. **Light HMI & Ruggedized Floor Console (Frontend)**: Production React 19 interface providing dual synchronized perspectives: the 48-hour Planner Command Gantt and the shop-floor ruggedized worker station tablet.
2. **Mathematical Discrete Optimization Engine (Backend)**: FastAPI asynchronous microservice running Google OR-Tools CP-SAT discrete solver (seed = 42 for 100% deterministic repeatability), paired with Open-Meteo environmental integration and BigQuery persistence.
3. **Safety & Policy Critic Gate**: Vertex AI Gemini extraction pipeline with deterministic schema verification that translates plain-language shift policies into mathematical solver constraints while validating against ISO 7243:2017 standards.

---

## ⚙️ Core Engineering Capabilities

### 1. Dual-Comparator Schedule Optimization
For every production horizon, TEEVRA solves two schedules from the same operational order book:
* **Unconstrained Output-Only Baseline**: Greedy earliest-dispatch schedule representing conventional shop-floor scheduling without thermal or carbon constraints.
* **Heat-Safe & Carbon-Aware Plan**: Discrete mathematical optimization allocating shifts to avoid peak Wet Bulb Globe Temperature (WBGT) windows and shifting energy-intensive operations into solar tariff hours.

Every rupee saved, heat breach eliminated, and kilowatt-hour shifted is computed strictly as the delta between these two solver outputs.

### 2. ISO 7243:2017 & OSH Code 2020 Compliance
Worker metabolic thermal limits are enforced per Annex A, Table A.1 of ISO 7243:2017:
* **Heavy Metabolic Work (Class 4, Furnaces & Pour Bays)**: Thermal cut-off at **26.0°C WBGT** for acclimatized workers, with mandatory pre-allocated relief buffers.
* **Moderate Metabolic Work (Class 3, Ovens & Coating)**: Thermal cut-off at **28.0°C WBGT**.
* **Light Metabolic Work (Class 1-2, CNC Bays & Quality Inspection)**: Thermal cut-off at **30.0°C WBGT**.

Continuous high-temperature metallurgical pour operations (e.g., induction melting) are mathematically tagged as non-interruptible once tapped, enforcing certified relief crew handoffs instead of machine shutdowns.

### 3. Industrial Time-of-Day (ToD) Tariff Optimization
Power dispatch is optimized against standard high-tension industrial tariff structures:
* **Solar Concession Window (10:00 – 16:00 IST)**: Concessional base power tariff at **₹6.00/kWh**. Shiftable loads (billet pre-heating, gantry roughing, and chiller thermal charging) are prioritized during this window.
* **Standard Operational Hours**: Base industrial power at **₹7.50/kWh**.
* **Evening Peak Surcharge (18:00 – 22:00 IST)**: Peak grid surcharge at **₹9.20/kWh**. Energy-intensive non-critical operations are deferred.

### 4. Honest Grid Carbon Accounting
Carbon intensity is calculated using India Central Electricity Authority (CEA) v22 grid baseline emission factors (**0.675 tCO2/MWh**). In industrial grids without dedicated on-site solar storage, shifting load hours reduces power expense rather than absolute grid emissions; TEEVRA explicitly reflects this distinction on all management dashboards without deceptive claims.

### 5. Resilient Machine Breakdown Dispatch with 2-Hour Frozen Window
When a mechanical or electrical failure occurs (e.g., CNC Line 2 spindle fault):
* In-progress operations within a **2-hour frozen window** are held stationary to prevent floor chaos.
* Downstream routing operations are mathematically re-routed to parallel compatible machines (e.g., rough stages shifted from CNC 2 to CNC 1).
* The replanned schedule is submitted to the manager console with before/after delta metrics and one-click dispatch to floor tablets.

### 6. Bilingual Ruggedized Station Tablet & Hardware-Interrupt SOS
The floor worker tablet operates in English and Telugu (`తెలుగు`):
* Contextual thermal check-in prompts ("Are you okay? / మీరు క్షేమంగా ఉన్నారా?") scheduled before hot operating windows.
* One-tap response options: **OK**, **Too Hot (ఎక్కువ వేడి)**, **Dizzy (తలతిరుగుతుంది)**, and **Hazard (ప్రమాదం)**.
* **Emergency SOS Hold**: Bypasses AI models and cloud queues entirely; a 2.5-second physical press executes an immediate hardware interrupt, halts high-risk tooling, triggers audible plant-floor alerts, and routes supervisor relief dispatch.

---

## 📁 Production Repository Layout

```
ThermaPlan_AI/
├── frontend/                     # React 19 Production Light HMI
│   ├── src/
│   │   ├── components/
│   │   │   ├── planner/          # Planner Console, 192-Slot Gantt, Audit Trace Drawer
│   │   │   ├── worker/           # Ruggedized Station Tablet (Bilingual English/Telugu)
│   │   │   └── start/            # Command Dashboard & Scenario Upload Portal
│   │   ├── context/              # Synchronized Real-time Plant State & Solver Context
│   │   ├── services/             # Axios API Client, Gemini Vertex SDK, Audit Logging
│   │   └── utils/                # ISO 7243 Math, Data Mappers, Phone Number Masking
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile                # Production Multi-stage NGINX Alpine Container
│
├── teevra-backend/               # FastAPI Production Optimization Microservice
│   ├── app/
│   │   ├── core_math/            # Google OR-Tools CP-SAT Solver & Thermal Equations
│   │   ├── routers/              # Production API Routes (Manager, Worker, Breakdown)
│   │   ├── services/             # BigQuery Persistence, Pub/Sub, Vertex AI Client
│   │   ├── models/               # Strict Pydantic Domain & Schema Validation
│   │   └── data/                 # 5-Day Production Order Books & Worker Rosters
│   ├── tests/                    # Pytest Suite (CP-SAT Benchmarks & End-to-End Tests)
│   ├── pyproject.toml
│   └── Dockerfile                # Production Uvicorn Python 3.12 Container
│
├── sample_manager_uploads/       # 5-Day Operational Dataset Packages (CSV / Excel / PDF)
│   ├── Day 1 - Monday/           # Aerospace & Defense Heavy Alloy Castings
│   ├── Day 2 - Tuesday/          # EV Powertrain & Copper Rotor Continuous Pour
│   ├── Day 3 - Wednesday/        # Indian Railways Heavy Bogie & Axle Forging
│   ├── Day 4 - Thursday/         # Wind Turbine Planetary Gearbox Induction Heating
│   └── Day 5 - Friday/           # Medical Titanium Micro-Machining & Valve Castings
│
├── .gitignore                    # Production Git Ignore (Strict Secret & Environment Isolation)
├── LICENSE                       # MIT Open-Source License
└── README.md                     # Production Specification & Architecture Guide
```

---

## 🔒 Security, Privacy & Secret Governance

TEEVRA is built to pass 100% automated security scans and cloud policy audits:
* **Zero PII Exposure**: Worker names on public or supervisor consoles display role identifiers and masked phone numbers (`+91 98*** **000`). Personal identity records remain in secured BigQuery tables.
* **Zero Tracked Secrets**: Environment files (`.env`, `*.key`, `*.pem`, `service-account*.json`) are strictly excluded via `.gitignore`. Production configurations are injected via Google Cloud Secret Manager or runtime container environment variables.
* **Standard `.env.example` Templates**: Both `frontend/.env.example` and `teevra-backend/.env.example` provide clean, production-documented configuration keys with zero hardcoded credentials.

---

## 🚀 Production Deployment

### Backend Deployment (Google Cloud Run)

The backend service is containerized using multi-stage Python 3.12 builds with UV dependency caching:

```bash
# Build production container image
docker build -t gcr.io/${GCP_PROJECT_ID}/teevra-backend:latest ./teevra-backend

# Deploy to Google Cloud Run
gcloud run deploy teevra-backend \
  --image gcr.io/${GCP_PROJECT_ID}/teevra-backend:latest \
  --region asia-south1 \
  --platform managed \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300s \
  --set-env-vars "GCP_PROJECT_ID=${GCP_PROJECT_ID},GCP_REGION=asia-south1,LOG_LEVEL=INFO" \
  --allow-unauthenticated
```

Interactive OpenAPI documentation is automatically served at `/docs` (Swagger UI) and `/openapi.json`.

### Frontend Deployment (Firebase Hosting)

The frontend application compiles into optimized static assets served through global edge CDN:

```bash
# Navigate to frontend and build production bundle
cd frontend
npm ci
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

---

## 🧪 Automated Verification & Quality Assurance

The codebase includes comprehensive unit tests, mathematical validation, and end-to-end API integration tests:

```bash
# Execute full backend test suite
cd teevra-backend
pytest -v
```

Test Coverage Includes:
* **`test_ortools_cp_sat.py`**: Mathematical verification that the CP-SAT solver achieves zero heat breaches across all 16 workstations under high-heat summer profiles.
* **`test_breakdown_frozen_window.py`**: Validates the 2-hour operational freeze window and sequential routing reassignment during unexpected machine downtime.
* **`test_wbgt_and_carbon_math.py`**: Verifies exact ISO 7243:2017 Table A.1 metabolic work limits and honest CEA v22 carbon calculations.
* **`test_end_to_end_demo_flow.py`**: End-to-end validation of morning plan generation, plain-language rule extraction, and worker signal ingestion.

---

## 📜 Standards & Citations

1. **ISO 7243:2017**: *Ergonomics of the thermal environment — Assessment of heat stress using the WBGT (wet bulb globe temperature) index*, International Organization for Standardization, Geneva.
2. **Occupational Safety, Health and Working Conditions Code 2020**: Government of India, Ministry of Labour and Employment, New Delhi.
3. **CEA Baseline Carbon Database v22**: *CO2 Baseline Database for the Indian Power Sector*, Central Electricity Authority, Ministry of Power, Government of India.
4. **TGSPDCL HT-1 Industrial Tariff Schedule**: *Tariff Order for High Tension Heavy Industrial Consumers*, Telangana State Electricity Regulatory Commission.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for complete details.

Built using Google Antigravity.
