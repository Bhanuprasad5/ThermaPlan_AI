# TEEVRA: Heat-Safe, Carbon-Aware Production Scheduler

**Entry 1 Master Production-Grade Backend Architecture**

## Overview
TEEVRA is a neuro-symbolic manufacturing operations scheduler built with Google OR-Tools CP-SAT, Google Cloud Platform (BigQuery, GCS, Pub/Sub, Firestore, Vertex AI), and FastAPI.

### Key Pillars
1. **Golden Neuro-Symbolic Rule**: Zero AI hallucinations for numerical metrics. Every single rupee, slot, degree Celsius, kilowatt-hour, and CO2 calculation is computed deterministically. Vertex AI Gemini Flash is used solely for function calling extraction and explanatory narratives grounded in official regulatory citations.
2. **Thermal Safety Guardrails**: ISO 7243:2017 Table A.1 standards strictly enforced across 192 slots (48-hour forward horizon at 15-minute granularity). Pre-allocated 30-to-60 minute Heat Buffers protect workers during peak solar heat.
3. **Time-of-Day Tariffs (illustrative, TGSPDCL-style)**: Automated shifting of industrial loads into the 10:00–16:00 solar concession window (-20% discount) while vacating 18:00–22:00 peak hours (+20% surcharge).
4. **Honest Carbon Accounting**: Uses CEA Baseline Database v22 factor (0.675 tCO2/MWh). Pure time-shifting without net energy reduction reports exactly 0.0 tCO2 savings.
5. **Zero-AI SOS Bypass**: Emergency halts isolate machinery immediately without waiting for generative AI responses.
6. **2-Hour Frozen Window**: Breakdown rescheduler preserves active work within an 8-slot window to avoid shop floor chaos.
7. **Telugu Voice Interaction**: Hands-free worker check-ins with natural language responses.

## Tech Stack
- **Python**: 3.12 (managed exclusively with `uv`)
- **Web Framework**: FastAPI with Pydantic v2
- **Solver**: Google OR-Tools CP-SAT (192-Slot Discrete Optimization)
- **Cloud Infrastructure**: BigQuery, Cloud Storage, Pub/Sub, Firestore, Vertex AI (`asia-south1` & `us-central1`)

## Quickstart

### 1. Run Tests
```bash
uv run pytest -v
```

### 2. Start Local Development Server
```bash
uv run uvicorn app.main:app --reload --port 8000
```
Visit API Documentation at `http://localhost:8000/docs`.

### 3. Provision Cloud Resources (GCP)
```bash
bash scripts/bootstrap_gcp.sh
uv run python scripts/seed_bigquery_factors.py
```
