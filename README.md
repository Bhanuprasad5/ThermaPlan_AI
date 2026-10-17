# TEEVRA: Heat-Safe, Carbon-Aware Industrial Production Scheduler

[![Firebase Hosting](https://img.shields.io/badge/Frontend-Firebase%20Hosting-FFCA28?logo=firebase&logoColor=black)](https://thermaplan-ai.web.app)
[![Google Cloud Run](https://img.shields.io/badge/Backend-Google%20Cloud%20Run-4285F4?logo=googlecloud&logoColor=white)](https://teevra-backend-gkdvqod5qa-el.a.run.app)
[![ISO 7243 Compliant](https://img.shields.io/badge/Safety-ISO%207243%3A2017-success)](https://www.iso.org/standard/66787.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**TEEVRA** (తెలుగు: తీవ్ర) is an industrial manufacturing dispatch and production scheduling system designed for extreme thermal climates. It solves the critical trilemma of **worker heat stress safety (ISO 7243)**, **time-of-day electricity tariffs (TGSPDCL)**, and **carbon intensity reduction (CEA v22.0)**.

---

## 🌐 Live Cloud Deployments

- **Frontend Application (Firebase)**: [https://thermaplan-ai.web.app](https://thermaplan-ai.web.app)
- **Backend API (Google Cloud Run)**: [https://teevra-backend-gkdvqod5qa-el.a.run.app](https://teevra-backend-gkdvqod5qa-el.a.run.app)
- **Interactive API Documentation (Swagger)**: [https://teevra-backend-gkdvqod5qa-el.a.run.app/docs](https://teevra-backend-gkdvqod5qa-el.a.run.app/docs)

---

## 🏭 Core Features

1. **48-Hour Continuous Discrete Optimization (Google OR-Tools CP-SAT)**:
   - Evaluates 192 fifteen-minute slots across 16 heavy workstations and 250+ workers.
   - Generates deterministic, zero-breach production schedules in under 800ms.

2. **Dynamic Heat Buffers (Thermal Rest Cushions)**:
   - Proactively reserves scheduled rest windows during peak thermal hours (13:00–15:00) without delaying downstream assembly or shipping deadlines.

3. **Real-Time Weather Thermal Spike (+3.2°C) Defense**:
   - Continuously monitors indoor WBGT telemetry and re-optimizes schedules dynamically when sudden microclimate spikes occur.

4. **Machine Breakdown Resilience**:
   - Reallocates downstream dependencies while protecting ongoing operations.

5. **Multilingual Operator Tablet (English & Telugu)**:
   - Native bilingual interface and voice check-in system (*"మీరు బాగున్నారా? / Are you okay?"*) designed for plant-floor shop operators.

6. **TGSPDCL Tariff & Solar Window Maximization**:
   - Shifts energy-intensive melting and annealing batches into peak solar tariff hours (₹4.40/kWh, 10:00–16:00 IST), avoiding evening peak rates (₹9.20/kWh).

---

## 🏗️ Repository Architecture

```
ThermaPlan_AI/
├── frontend/                  # React 19 + TypeScript + Vite + TailwindCSS
│   ├── src/
│   │   ├── components/        # Gantt chart, TopBar, ContextPanel, StartPage, etc.
│   │   ├── context/           # PlantContext state management
│   │   └── utils/             # Data mappers, tariff calculations, WBGT models
│   ├── firebase.json          # Firebase Hosting configuration
│   └── .env.production        # Cloud Run backend endpoints
│
├── teevra-backend/            # FastAPI + Python 3.12 + Google OR-Tools
│   ├── app/
│   │   ├── core_math/         # CP-SAT solver, WBGT equations, TGSPDCL tariffs
│   │   ├── models/            # Pydantic schemas and domain models
│   │   ├── routers/           # Manager, Guardian, Breakdown, and Supervisor APIs
│   │   └── services/          # BigQuery, GCS, Pub/Sub, Firestore integrations
│   ├── Dockerfile             # Multi-stage production container
│   └── pyproject.toml         # uv package manifest
│
└── sample_manager_uploads/    # Ready-to-upload factory orders, rosters & tariffs
```

---

## 🚀 Local Development Setup

### 1. Backend (Python 3.12 + uv)
```bash
cd teevra-backend
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend (Node.js)
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` to access the local development environment.

---

## 📜 Standards & Compliance
- **Thermal Stress**: ISO 7243:2017 & Indian Factories Act Section 11
- **Electricity Tariffs**: TGSPDCL HT-I Industrial Time-of-Day Tariffs
- **Carbon Accounting**: Central Electricity Authority (CEA) CO₂ Baseline Database v22.0
