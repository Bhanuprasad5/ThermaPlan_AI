"""
TEEVRA Entry 1: Heat-Safe, Carbon-Aware Production Scheduler.
Master Production-Grade FastAPI Application Entrypoint.
"""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    breakdown_router,
    guardian_router,
    manager_router,
    safety_signals_router,
    supervisor_router,
)
from app.services.weather_integrator import weather_integrator

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes weather baseline, registers factor rules, and warms solvers on startup."""
    settings = get_settings()
    logger.info(
        "teevra_backend_starting",
        project_id=settings.GCP_PROJECT_ID,
        region=settings.GCP_REGION,
    )

    # Pre-warm 48-hour baseline weather
    await weather_integrator.fetch_48h_weather()

    yield

    logger.info("teevra_backend_shutting_down")


app = FastAPI(
    title="TEEVRA: Heat-Safe, Carbon-Aware Production Scheduler",
    description=(
        "Production-grade backend implementing neuro-symbolic industrial manufacturing optimization, "
        "ISO 7243:2017 thermal safety limits, TGSPDCL time-of-day tariffs, CEA honest carbon accounting, "
        "and Google OR-Tools CP-SAT discrete optimization."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing (CORS) for Manager UI, Supervisor Console, and Worker PWA
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://thermaplan-ai.web.app",
        "https://thermaplan-ai.firebaseapp.com",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://thermaplan-ai\.(web\.app|firebaseapp\.com)\.?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(manager_router)
app.include_router(breakdown_router)
app.include_router(guardian_router)
app.include_router(safety_signals_router)
app.include_router(supervisor_router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "TEEVRA Heat-Safe Carbon-Aware Production Scheduler",
        "status": "OPERATIONAL",
        "tariff": "Illustrative time-of-day tariff (simulated, TGSPDCL-style bands)",
        "carbon_factor": "CEA v22, 0.675 tCO2/MWh",
        "thermal_standard": "ISO 7243:2017 Annex A, Table A.1",
        "solver": "Google OR-Tools CP-SAT, seed 42, single worker",
        "docs_url": "/docs",
    }


@app.get("/healthz", tags=["Health"])
@app.get("/health", tags=["Health"])
async def health_check():
    from app.services.run_history import run_history

    settings = get_settings()
    active = run_history.active
    return {
        "status": "HEALTHY",
        "model": settings.GEMINI_FLASH_MODEL,
        "vertex_region": settings.VERTEX_REGION,
        "active_plan_id": active.plan.plan_id if active else None,
        "runs_in_memory": len(run_history.runs),
    }


@app.get("/readyz", tags=["Health"])
async def readiness_check():
    return {
        "status": "READY",
        "database": "BigQuery (asia-south1)",
        "storage": "GCS (asia-south1)",
        "event_bus": "Pub/Sub (asia-south1)",
    }
