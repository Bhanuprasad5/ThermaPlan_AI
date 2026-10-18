"""
Manager Router (Feature 1 & Feature 2):
- Upload factory orders, machine routing, and worker rosters to GCS & BigQuery
- Extract shift/lockout rules via Gemini Function Calling
- Solve 48-Hour Dual Schedules (Baseline vs Heat-Safe & Carbon-Aware Plan)
- Compare financial, energy, carbon, and thermal KPIs
"""

import asyncio
import io
from datetime import datetime, UTC
from pathlib import Path

import pandas as pd
import structlog
from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile, HTTPException

from app.core_math.ortools_solver import solve_dual_schedules
from app.models.constraints import ExtractedPlantConstraints
from app.models.domain import (
    PlantOrder,
    WorkstationRoster,
    PlanningConfigRequest,
    VALID_SLOT_MINUTES,
)
from app.models.schedule import ExplanationTrace, SchedulePlanResponse
from app.services.bigquery_service import bq_service
from app.services.firestore_fcm_service import firestore_fcm_service
from app.services.gemini_flash_service import OFFICIAL_CITATIONS, gemini_flash_service
from app.services.storage_service import storage_service
from app.services import demo_plan_cache, plan_store
from app.services.run_history import ActiveContext, run_history
from app.services.weather_integrator import weather_integrator

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/v1/manager", tags=["Manager Core Scheduler"])

CURRENT_ACTIVE_ROSTERS: list[WorkstationRoster] = []
CURRENT_ACTIVE_WORKERS: list[dict] = []
LAST_UPLOADED_ORDERS: list[PlantOrder] = []

_DATA_ROOT = Path(__file__).resolve().parent.parent / "data"
_DAY_PACKAGES = [
    {
        "day_id": "day1_monday",
        "label": "Monday: Castings",
        "folder": "Day 1 - Monday",
        "orders": "day1_monday_orders.csv",
        "roster": "day1_monday_workers_roster_260.csv",
        "tariff": "day1_monday_tgspdcl_tariff.csv",
    },
    {
        "day_id": "day2_tuesday",
        "label": "Tuesday: Housings",
        "folder": "Day 2 - Tuesday",
        "orders": "day2_tuesday_orders.csv",
        "roster": "day2_tuesday_workers_roster_255.csv",
        "tariff": "day2_tuesday_tgspdcl_tariff.csv",
    },
    {
        "day_id": "day3_wednesday",
        "label": "Wednesday: Gearbox",
        "folder": "Day 3 - Wednesday",
        "orders": "day3_wednesday_orders.csv",
        "roster": "day3_wednesday_workers_roster_265.csv",
        "tariff": "day3_wednesday_tgspdcl_tariff.csv",
    },
    {
        "day_id": "day4_thursday",
        "label": "Thursday: Pump bodies",
        "folder": "Day 4 - Thursday",
        "orders": "day4_thursday_orders.csv",
        "roster": "day4_thursday_workers_roster_258.csv",
        "tariff": "day4_thursday_tgspdcl_tariff.csv",
    },
    {
        "day_id": "day5_friday",
        "label": "Friday: Valve blocks",
        "folder": "Day 5 - Friday",
        "orders": "day5_friday_orders.csv",
        "roster": "day5_friday_workers_roster_270.csv",
        "tariff": "day5_friday_tgspdcl_tariff.csv",
    },
]


DAY_ORDER_FILES = {pkg["day_id"]: (pkg["folder"], pkg["orders"]) for pkg in _DAY_PACKAGES}


def _day_label(day_id: str) -> str:
    return next((p["label"] for p in _DAY_PACKAGES if p["day_id"] == day_id), day_id)


_TRUE = {"true", "1", "yes", "y"}


def parse_orders_csv(text: str) -> list[PlantOrder]:
    """Strict parse of an orders CSV. A bad file is a 400, never a silent swap to demo data."""
    try:
        df = pd.read_csv(io.StringIO(text))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Orders file is not a readable CSV: {e}") from e
    df.columns = [str(c).strip().lower() for c in df.columns]
    missing = [c for c in ("order_id", "machine_id", "duration_mins", "kwh_per_op") if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Orders file is missing columns: {', '.join(missing)}")
    if df.empty:
        raise HTTPException(status_code=400, detail="Orders file has no rows.")

    orders: list[PlantOrder] = []
    for i, row in df.iterrows():
        line = i + 2

        def val(col, default=None):
            v = row.get(col, default)
            return default if v is None or (isinstance(v, float) and pd.isna(v)) else v

        try:
            machine_id = str(val("machine_id")).strip().upper()
            duration_mins = int(float(val("duration_mins")))
            tag = str(val("load_tag", "shiftable")).strip().lower()
            orders.append(
                PlantOrder(
                    upload_batch_id=str(val("upload_batch_id", "manager_upload")),
                    order_id=str(val("order_id")).strip(),
                    job_name=str(val("job_name", val("order_id"))),
                    machine_id=machine_id,
                    station_id=str(val("station_id", f"st_{machine_id.lower()}")),
                    routing_seq=int(float(val("routing_seq", 1))),
                    duration_mins=duration_mins,
                    duration_slots=int(float(val("duration_slots", max(1, duration_mins // 15)))),
                    kwh_per_op=float(val("kwh_per_op")),
                    restart_kwh=float(val("restart_kwh", 0.0)),
                    load_tag=tag if tag in ("fixed", "shiftable", "interruptible") else "shiftable",
                    splittable=str(val("splittable", "false")).strip().lower() in _TRUE,
                    due_slot=int(float(val("due_slot", 191))),
                    is_critical_melt=str(val("is_critical_melt", "false")).strip().lower() in _TRUE,
                )
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Orders file row {line}: {e}") from e
    return orders


def _read_package_csv(folder: str, sub: str, filename: str) -> str:
    path = _DATA_ROOT / folder / sub / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Template file missing: {filename}")
    return path.read_text(encoding="utf-8")


@router.get("/available-templates")
async def list_available_templates():
    """Shipped day packages the manager can load instead of dragging files."""
    items = []
    for pkg in _DAY_PACKAGES:
        orders_path = _DATA_ROOT / pkg["folder"] / "Orders" / pkg["orders"]
        items.append(
            {
                "day_id": pkg["day_id"],
                "label": pkg["label"],
                "orders_filename": pkg["orders"],
                "roster_filename": pkg["roster"],
                "tariff_filename": pkg["tariff"],
                "available": orders_path.is_file(),
                "includes_pdf": False,
            }
        )
    return {
        "templates": items,
        "note": "Loads orders, worker roster and tariff spreadsheets only. Reference PDFs stay a manual upload.",
    }


@router.get("/available-templates/{day_id}")
async def load_available_template(day_id: str):
    """Return the CSV text for one shipped day. Does not include PDFs."""
    pkg = next((p for p in _DAY_PACKAGES if p["day_id"] == day_id), None)
    if pkg is None:
        raise HTTPException(status_code=404, detail=f"Unknown template day_id: {day_id}")
    orders_csv = _read_package_csv(pkg["folder"], "Orders", pkg["orders"])
    roster_csv = _read_package_csv(pkg["folder"], "Worker_Rosters", pkg["roster"])
    tariff_csv = _read_package_csv(pkg["folder"], "Tariffs", pkg["tariff"])
    return {
        "day_id": pkg["day_id"],
        "label": pkg["label"],
        "source": "shipped_demo_package",
        "orders_filename": pkg["orders"],
        "orders_csv": orders_csv,
        "orders_rows": max(0, orders_csv.count("\n") - (0 if orders_csv.endswith("\n") else 0)),
        "roster_filename": pkg["roster"],
        "roster_csv": roster_csv,
        "tariff_filename": pkg["tariff"],
        "tariff_csv": tariff_csv,
        "pdf_included": False,
    }


# Realistic 16 Workstations Roster for Telangana Metal Works
DEFAULT_DEMO_ROSTERS: list[WorkstationRoster] = [
    # 1. Furnace & Melting Bay (Class 3 Heavy Labor -> ISO Limit 26.0°C)
    WorkstationRoster(
        station_id="FURNACE_BAY",
        station_name="High-Heat Casting & Furnace Bay",
        work_class=3,
        metabolic_watts=415,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=2.5,
        has_qualified_relief=True,
        relief_operator_id="RELIEF_OP_01",
    ),
    WorkstationRoster(
        station_id="FURNACE_1",
        station_name="Induction Furnace 1 (150kW Melt Crucible)",
        work_class=3,
        metabolic_watts=415,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=2.8,
        has_qualified_relief=True,
        relief_operator_id="RELIEF_OP_01",
    ),
    WorkstationRoster(
        station_id="FURNACE_2",
        station_name="Induction Furnace 2 (120kW Ingot Cast)",
        work_class=3,
        metabolic_watts=415,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=2.5,
        has_qualified_relief=True,
        relief_operator_id="RELIEF_OP_02",
    ),
    WorkstationRoster(
        station_id="FURNACE_3",
        station_name="Induction Furnace 3 (100kW Billet Heater)",
        work_class=3,
        metabolic_watts=400,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=2.2,
        has_qualified_relief=True,
        relief_operator_id="RELIEF_OP_03",
    ),
    WorkstationRoster(
        station_id="CHARGING_BAY",
        station_name="Scrap Charging & Deoxidizing Flux Bay",
        work_class=2,
        metabolic_watts=300,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=1.8,
        has_qualified_relief=True,
        relief_operator_id="RELIEF_OP_04",
    ),
    # 2. Precision Machining & Tooling (Class 1 Light Labor -> ISO Limit 30.0°C)
    WorkstationRoster(
        station_id="CNC_BAY",
        station_name="Machining & CNC Tooling Shop",
        work_class=1,
        metabolic_watts=180,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.8,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="CNC_1",
        station_name="5-Axis CNC Precision Vertical Center",
        work_class=1,
        metabolic_watts=180,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.8,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="CNC_2",
        station_name="5-Axis High-Speed Finishing Center",
        work_class=1,
        metabolic_watts=180,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.8,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="CNC_3",
        station_name="Heavy Horizontal Boring & Milling Bay",
        work_class=1,
        metabolic_watts=180,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.9,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="CNC_4",
        station_name="High-Torque CNC Turning & Lathe Cell",
        work_class=1,
        metabolic_watts=180,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.8,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="CNC_5",
        station_name="Tool & Die Gear Hobbing Station",
        work_class=1,
        metabolic_watts=180,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.8,
        has_qualified_relief=False,
    ),
    # 3. Heat Treatment & Paint Curing (Class 2 Moderate -> ISO Limit 28.0°C)
    WorkstationRoster(
        station_id="OVEN_BAY",
        station_name="Automated Heat Treatment & Coating Bay",
        work_class=2,
        metabolic_watts=240,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=1.5,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="OVEN_1",
        station_name="Continuous Paint Curing Enamel Oven (85kW)",
        work_class=1,
        metabolic_watts=160,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=1.2,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="OVEN_2",
        station_name="Automated Epoxy Powder Baking Tunnel (75kW)",
        work_class=1,
        metabolic_watts=160,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=1.2,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="HEAT_TREAT_1",
        station_name="Vacuum Quench & Annealing Chamber (95kW)",
        work_class=2,
        metabolic_watts=220,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=1.6,
        has_qualified_relief=False,
    ),
    # 4. Assembly & Quality Bays (Class 1 Light -> ISO Limit 30.0°C)
    WorkstationRoster(
        station_id="ASSEMBLY_BAY",
        station_name="Clean Precision Assembly Bay",
        work_class=1,
        metabolic_watts=140,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.5,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="ASSEMBLY_1",
        station_name="Robotic Motor & Actuator Assembly Cell",
        work_class=1,
        metabolic_watts=140,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.5,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="ASSEMBLY_2",
        station_name="Heavy Transmission & Gearbox Integration Cell",
        work_class=1,
        metabolic_watts=150,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.6,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="QUALITY_BAY",
        station_name="Metrology & Quality Inspection Lab",
        work_class=1,
        metabolic_watts=120,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.4,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="QUALITY_INSPECT",
        station_name="CMM Coordinate Laser & Ultrasonic Metrology",
        work_class=1,
        metabolic_watts=120,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.4,
        has_qualified_relief=False,
    ),
    # 5. Utilities (Shiftable/Interruptible Electrical Loads -> Class 0)
    WorkstationRoster(
        station_id="UTILITY_BAY",
        station_name="Central Chiller & Compressor Utility Bay",
        work_class=0,
        metabolic_watts=115,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.5,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="CHILLER_1",
        station_name="Central Ice-Storage Thermal Chiller (90kW)",
        work_class=0,
        metabolic_watts=115,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.5,
        has_qualified_relief=False,
    ),
    WorkstationRoster(
        station_id="COMP_1",
        station_name="High-Pressure Rotary Screw Compressor (65kW)",
        work_class=0,
        metabolic_watts=115,
        acclimatised=True,
        clothing_adj_c=0.0,
        simulated_globe_uplift_c=0.5,
        has_qualified_relief=False,
    ),
]


def _load_default_orders() -> list[PlantOrder]:
    csv_candidates = [
        Path(__file__).resolve().parent.parent / "data" / "plant_orders_telangana.csv",
        Path(__file__).resolve().parent.parent / "data" / "Reference_and_Standards" / "plant_orders_telangana.csv",
        Path(__file__).resolve().parent.parent / "data" / "Day 1 - Monday" / "Orders" / "day1_monday_orders.csv",
        Path(__file__).resolve().parent.parent.parent / "sample_manager_uploads" / "Reference_and_Standards" / "plant_orders_telangana.csv",
        Path(__file__).resolve().parent.parent.parent / "sample_manager_uploads" / "Day 1 - Monday" / "Orders" / "day1_monday_orders.csv",
        Path("D:/ThermaPlan_AI/sample_manager_uploads/Reference_and_Standards/plant_orders_telangana.csv"),
    ]
    for p in csv_candidates:
        if p.exists():
            try:
                df = pd.read_csv(p)
                orders = [PlantOrder(**row.to_dict()) for _, row in df.iterrows()]
                if orders:
                    return orders
            except Exception:
                pass
    return []


DEFAULT_DEMO_ORDERS: list[PlantOrder] = _load_default_orders()


@router.post("/upload")
async def upload_factory_files(
    orders_file: UploadFile | None = File(None),
    roster_file: UploadFile | None = File(None),
    batch_id: str = Form("BATCH_DEFAULT_2026"),
):
    """
    Streams raw CSV/Excel files to GCS bucket and parses into BigQuery.
    If no file is provided, seeds realistic Telangana metal manufacturing demo dataset.
    """
    uploaded_orders = []
    uploaded_rosters = []

    if orders_file:
        gs_uri, size = await storage_service.upload_file_stream(
            orders_file, f"uploads/{batch_id}_{orders_file.filename}"
        )
        content = await orders_file.read()
        if orders_file.filename.lower().endswith(".csv"):
            text = content.decode("utf-8-sig", errors="replace")
        else:
            try:
                text = pd.read_excel(io.BytesIO(content)).to_csv(index=False)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Orders spreadsheet could not be read: {e}") from e
        uploaded_orders = parse_orders_csv(text)
    else:
        uploaded_orders = DEFAULT_DEMO_ORDERS

    global CURRENT_ACTIVE_ROSTERS, CURRENT_ACTIVE_WORKERS, LAST_UPLOADED_ORDERS
    if orders_file:
        LAST_UPLOADED_ORDERS = uploaded_orders
    if roster_file:
        gs_uri, size = await storage_service.upload_file_stream(
            roster_file, f"uploads/{batch_id}_{roster_file.filename}"
        )
        content = await roster_file.read()
        try:
            df = (
                pd.read_csv(io.BytesIO(content))
                if roster_file.filename.endswith(".csv")
                else pd.read_excel(io.BytesIO(content))
            )
            # If uploaded format is individual workers roster
            if "worker_id" in df.columns or "assigned_machine_id" in df.columns or "assigned_station_id" in df.columns:
                m_col = "assigned_machine_id" if "assigned_machine_id" in df.columns else ("assigned_station_id" if "assigned_station_id" in df.columns else "station_id")
                CURRENT_ACTIVE_WORKERS = df.to_dict(orient="records")
                grouped = df.groupby(m_col)
                for machine_id, grp in grouped:
                    first_row = grp.iloc[0]
                    heat_cls = str(first_row.get("heat_metabolic_class", "Class 1"))
                    work_class = 3 if "Class 3" in heat_cls else (2 if "Class 2" in heat_cls else 1)
                    metabolic_watts = 415 if work_class == 3 else (300 if work_class == 2 else 180)
                    has_relief = bool(grp.get("is_furnace_qualified", False).any())
                    relief_op = str(grp[grp.get("is_furnace_qualified", False)]["worker_id"].iloc[0]) if has_relief and "worker_id" in grp.columns else None
                    uploaded_rosters.append(
                        WorkstationRoster(
                            upload_batch_id=batch_id,
                            station_id=str(machine_id),
                            station_name=str(first_row.get("station_name", str(machine_id))),
                            shift_id=str(first_row.get("shift_schedule", "Shift 1")),
                            workers_assigned=len(grp),
                            work_class=work_class,
                            metabolic_watts=metabolic_watts,
                            acclimatised=True,
                            clothing_adj_c=0.0,
                            simulated_globe_uplift_c=2.0 if work_class == 3 else (1.0 if work_class == 2 else 0.5),
                            has_qualified_relief=has_relief,
                            relief_operator_id=relief_op,
                        )
                    )
            else:
                for _, row in df.iterrows():
                    uploaded_rosters.append(
                        WorkstationRoster(upload_batch_id=batch_id, **row.to_dict())
                    )
        except Exception:
            uploaded_rosters = DEFAULT_DEMO_ROSTERS
    else:
        uploaded_rosters = DEFAULT_DEMO_ROSTERS

    CURRENT_ACTIVE_ROSTERS = uploaded_rosters
    bq_service.save_plant_orders(uploaded_orders)
    bq_service.save_workstation_roster(uploaded_rosters)

    return {
        "status": "SUCCESS",
        "batch_id": batch_id,
        "orders_parsed": len(uploaded_orders),
        "rosters_parsed": len(uploaded_rosters),
        "active_workers_count": len(CURRENT_ACTIVE_WORKERS) if CURRENT_ACTIVE_WORKERS else sum(r.workers_assigned for r in uploaded_rosters),
        "source": "PORTAL_MANAGER_UPLOAD",
        "notice": "All data staged in BigQuery (asia-south1) and active in scheduler.",
    }


@router.get("/workers")
async def get_active_workers():
    """Returns currently active workers loaded from portal upload."""
    global CURRENT_ACTIVE_WORKERS
    return {
        "count": len(CURRENT_ACTIVE_WORKERS),
        "workers": CURRENT_ACTIVE_WORKERS,
        "source": "PORTAL_MANAGER_UPLOAD" if CURRENT_ACTIVE_WORKERS else "DEFAULT_DATASET"
    }


@router.post("/upload-workers")
async def upload_workers_roster(
    roster_file: UploadFile = File(...),
    batch_id: str = Form("BATCH_PORTAL_ROSTER_2026")
):
    """Direct portal upload for worker roster (bypasses BigQuery static seed)."""
    global CURRENT_ACTIVE_ROSTERS, CURRENT_ACTIVE_WORKERS
    content = await roster_file.read()
    try:
        df = (
            pd.read_csv(io.BytesIO(content))
            if roster_file.filename.endswith(".csv")
            else pd.read_excel(io.BytesIO(content))
        )
        CURRENT_ACTIVE_WORKERS = df.to_dict(orient="records")
        m_col = "assigned_machine_id" if "assigned_machine_id" in df.columns else ("assigned_station_id" if "assigned_station_id" in df.columns else "station_id")
        uploaded_rosters = []
        for machine_id, grp in df.groupby(m_col):
            first_row = grp.iloc[0]
            heat_cls = str(first_row.get("heat_metabolic_class", "Class 1"))
            work_class = 3 if "Class 3" in heat_cls else (2 if "Class 2" in heat_cls else 1)
            has_relief = bool(grp.get("is_furnace_qualified", False).any())
            relief_op = str(grp[grp.get("is_furnace_qualified", False)]["worker_id"].iloc[0]) if has_relief and "worker_id" in grp.columns else None
            uploaded_rosters.append(
                WorkstationRoster(
                    upload_batch_id=batch_id,
                    station_id=str(machine_id),
                    station_name=str(first_row.get("station_name", str(machine_id))),
                    shift_id=str(first_row.get("shift_schedule", "Shift 1")),
                    workers_assigned=len(grp),
                    work_class=work_class,
                    metabolic_watts=415 if work_class == 3 else (300 if work_class == 2 else 180),
                    acclimatised=True,
                    clothing_adj_c=0.0,
                    simulated_globe_uplift_c=2.0 if work_class == 3 else 0.5,
                    has_qualified_relief=has_relief,
                    relief_operator_id=relief_op,
                )
            )
        CURRENT_ACTIVE_ROSTERS = uploaded_rosters
        return {
            "status": "SUCCESS",
            "workers_loaded": len(CURRENT_ACTIVE_WORKERS),
            "workstations_configured": len(uploaded_rosters),
            "source": "PORTAL_DIRECT_UPLOAD",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse worker file: {str(e)}")


@router.post("/parse-memo", response_model=ExtractedPlantConstraints)
async def parse_manager_memo(memo_text: str = Form(...)):
    """Extracts operational constraints using Vertex AI Gemini Function Calling."""
    return await gemini_flash_service.extract_constraints_from_memo(memo_text)


@router.get("/planning-slots")
async def get_planning_slots():
    """Returns supported customizable time-slot resolutions."""
    return {
        "default_slot_minutes": 15,
        "default_horizon_hours": 48,
        "available_slots": [
            {"minutes": 15, "label": "15 minutes (Standard)", "default": True},
            {"minutes": 30, "label": "30 minutes"},
            {"minutes": 60, "label": "1 hour"},
            {"minutes": 90, "label": "1.5 hours"},
            {"minutes": 120, "label": "2 hours"},
            {"minutes": 150, "label": "2.5 hours"},
            {"minutes": 180, "label": "3 hours"},
        ],
        "common_horizons": [
            {"hours": 24, "label": "24 Hours (Next Day)"},
            {"hours": 48, "label": "48 Hours (Standard 2-Day)", "default": True},
            {"hours": 72, "label": "72 Hours (3-Day Forward)"},
        ],
    }


@router.post("/solve-48h", response_model=SchedulePlanResponse)
async def solve_morning_plan(
    config: PlanningConfigRequest | None = None,
    background_tasks: BackgroundTasks = None,  # type: ignore[assignment]
):
    """
    Solves the baseline (earliest start, no heat rule) and the heat-safe, tariff-aware plan.
    Orders come from, in order: the CSV in the request, a named demo day, the last upload, the default book.
    """
    plan_config = config or PlanningConfigRequest()
    if plan_config.slot_duration_minutes not in VALID_SLOT_MINUTES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid slot_duration_minutes {plan_config.slot_duration_minutes}. Must be one of: {VALID_SLOT_MINUTES}"
        )

    if plan_config.orders_csv and plan_config.orders_csv.strip():
        orders = parse_orders_csv(plan_config.orders_csv)
        label = plan_config.dataset_label or "Custom upload"
    elif plan_config.day_id:
        if plan_config.day_id not in DAY_ORDER_FILES:
            raise HTTPException(status_code=404, detail=f"Unknown day_id {plan_config.day_id}")
        folder, fname = DAY_ORDER_FILES[plan_config.day_id]
        orders = parse_orders_csv((_DATA_ROOT / folder / "Orders" / fname).read_text(encoding="utf-8"))
        label = plan_config.dataset_label or _day_label(plan_config.day_id)
    elif LAST_UPLOADED_ORDERS:
        orders, label = LAST_UPLOADED_ORDERS, plan_config.dataset_label or "Last upload"
    else:
        orders, label = DEFAULT_DEMO_ORDERS, _day_label("day1_monday")

    rosters = _heat_rosters_for(orders)
    weather_slots = await weather_integrator.fetch_48h_weather()

    cached = demo_plan_cache.morning_plan(orders, plan_config)
    if cached is not None:
        run_history.set_active(ActiveContext(cached, orders, rosters, weather_slots))
        if not any(r.get("plan_id") == cached.plan_id for r in run_history.runs):
            run_history.record(cached)
        if background_tasks is not None:
            background_tasks.add_task(_persist_plan, cached)
        return cached

    baseline_plan, optimized_plan = await asyncio.to_thread(
        solve_dual_schedules,
        orders=orders,
        rosters=rosters,
        weather_slots=weather_slots,
        horizon_hours=plan_config.horizon_hours,
        slot_duration_minutes=plan_config.slot_duration_minutes,
    )
    optimized_plan.dataset_label = label
    optimized_plan.gemini_explanation_text = f"{optimized_plan.summary} {optimized_plan.kpi.honest_co2_banner}"
    optimized_plan.citations = OFFICIAL_CITATIONS

    run_history.set_active(ActiveContext(optimized_plan, orders, rosters, weather_slots))
    run_history.record(optimized_plan)
    if background_tasks is not None:
        background_tasks.add_task(_persist_plan, optimized_plan)
    return optimized_plan


def _heat_rosters_for(orders: list[PlantOrder]) -> list[WorkstationRoster]:
    """Every order station gets a heat profile. Uploaded rosters override the default one where ids match,
    so a worker file keyed by machine id can never leave a bay without its heat rule."""
    by_station = {r.station_id: r for r in DEFAULT_DEMO_ROSTERS}
    by_station.update({r.station_id: r for r in CURRENT_ACTIVE_ROSTERS})
    missing = sorted({o.station_id for o in orders} - set(by_station))
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"No heat profile for station(s) {', '.join(missing)}. Use one of: {', '.join(sorted(by_station))}",
        )
    return list(by_station.values())


def _persist_plan(plan: SchedulePlanResponse) -> None:
    """Best-effort audit copy. The response never waits on BigQuery or Firestore."""
    plan_store.save(plan)
    try:
        bq_service.save_solved_schedule(plan)
        for buf in plan.heat_buffers:
            firestore_fcm_service.update_station_state(
                buf.station_id,
                {"status": "HEAT_BUFFER_ACTIVE", "buffer_capacity_mins": buf.remaining_capacity_minutes},
            )
    except Exception as e:
        logger.warning("plan_persist_failed", error=str(e))


@router.get("/active-plan", response_model=SchedulePlanResponse)
async def get_active_plan(background_tasks: BackgroundTasks):
    """The plan most recently solved by this process, else the last plan saved to disk."""
    if run_history.active:
        return run_history.active.plan
    stored = plan_store.load()
    if stored is not None:
        return stored
    raise HTTPException(status_code=404, detail="No plan yet")


@router.get("/morning-plan", response_model=SchedulePlanResponse)
async def get_morning_plan(background_tasks: BackgroundTasks):
    """Frontend compatibility endpoint for morning plan."""
    return await get_active_plan(background_tasks)


@router.post("/explain")
async def explain_active_plan():
    """Gemini rewords the active plan's own facts into a short note. Called after the plan is on screen."""
    ctx = run_history.active
    if ctx is None:
        raise HTTPException(status_code=409, detail="No plan is active yet.")
    plan = ctx.plan
    res = await gemini_flash_service.generate_plan_explanation(
        kpi=plan.kpi,
        baseline_kpi=plan.baseline_kpi,
        heat_buffer_count=len(plan.heat_buffers),
        trigger_type="Breakdown replan" if plan.trigger_type == "MACHINE_BREAKDOWN" else "Morning plan",
        summary=plan.summary,
        move_reasons=[f"{m.job_name}: {m.reason}" for m in plan.job_moves if m.kind != "unchanged"],
        timeout_sec=45.0,
    )
    trace = ExplanationTrace(**res["trace"])
    if run_history.active is ctx:
        plan.gemini_explanation_text = res["explanation"]
        plan.explanation_trace = trace
    return {"plan_id": plan.plan_id, "text": res["explanation"], "trace": trace}


@router.get("/evals/summary")
async def get_evals_summary():
    """Average baseline vs optimized KPIs over every morning-plan solve recorded so far."""
    return await asyncio.to_thread(run_history.summary)


@router.post("/approve-and-solve", response_model=SchedulePlanResponse)
async def approve_and_solve(background_tasks: BackgroundTasks, constraints: dict | None = None):
    """Frontend compatibility endpoint for approving parsed rules and solving."""
    c = constraints or {}
    cfg = PlanningConfigRequest(
        horizon_hours=c.get("horizon_hours", 48),
        slot_duration_minutes=c.get("slot_duration_minutes", 15),
        orders_csv=c.get("orders_csv"),
        day_id=c.get("day_id"),
        dataset_label=c.get("dataset_label"),
    )
    return await solve_morning_plan(cfg, background_tasks)


def _illustrative_tariff_periods() -> list[dict]:
    return [
        {
            "name": "Solar Hours (Illustrative tariff, simulated)",
            "start_hour": 10,
            "end_hour": 16,
            "rate_inr_per_kwh": 6.0,
            "description": "Illustrative tariff, simulated",
        },
        {
            "name": "Evening Peak (Illustrative tariff, simulated)",
            "start_hour": 18,
            "end_hour": 22,
            "rate_inr_per_kwh": 9.0,
            "description": "Illustrative tariff, simulated",
        },
        {
            "name": "Standard (Illustrative tariff, simulated)",
            "start_hour": 0,
            "end_hour": 24,
            "rate_inr_per_kwh": 7.5,
            "description": "Illustrative tariff, simulated",
        },
    ]


@router.post("/parse-rules")
async def parse_rules_endpoint(
    csv_file: UploadFile | None = File(None),
    pdf_file: UploadFile | None = File(None),
    natural_language_rule: str = Form("Keep every station within its ISO 7243 limit, keep output at 98% or more, and enforce a 2-hour frozen window."),
):
    """Gemini JSON extract of manager rules. WBGT values come from ISO 7243 Table A.1."""
    from app.config import get_settings

    parsed = await gemini_flash_service.extract_manager_rules(natural_language_rule)
    source = parsed.get("source") or "deterministic_fallback"
    model_version = parsed.get("model")
    return {
        "constraints": parsed.get("constraints") or [],
        "tariff_periods": _illustrative_tariff_periods(),
        "frozen_window_hours": parsed.get("frozen_window_hours") or 2,
        "gemini_model": model_version,
        "model_version": model_version,
        "region": get_settings().VERTEX_REGION if source == "gemini" else None,
        "source": source,
        "latency_ms": parsed.get("latency_ms"),
        "extraction_timestamp": datetime.now(UTC).isoformat(),
        "is_fallback": source != "gemini",
        "label": (
            f"{model_version}" if source == "gemini" and model_version
            else "Deterministic fallback, no Gemini call"
        ),
        "error": parsed.get("error"),
    }


@router.get("/citations/{plan_id}")
async def get_plan_citations(plan_id: str):
    """Returns Grounded Vertex AI Search citations for the schedule."""
    plan = bq_service.get_latest_solved_schedule()
    if plan and plan.citations:
        return [c.model_dump() for c in plan.citations]
    return [
        {
            "source_title": "ISO 7243:2017 Table A.1 reference values, acclimatised (voluntary, not statutory)",
            "clause": "Table A.1",
            "uri": "https://www.iso.org/standard/66787.html",
            "snippet": "Reference WBGT limits by metabolic class for acclimatised workers. Voluntary standard, not a statute.",
        },
        {
            "source_title": "CEA CO2 Baseline Database v22.0, 0.675 tCO2/MWh",
            "clause": "Grid average emission factor",
            "uri": "https://cea.nic.in/cdm-co2-baseline-database/",
            "snippet": "National grid factor used for honest CO2. Time-shifting with no kWh drop is 0.00 tCO2.",
        },
        {
            "source_title": "Illustrative tariff, simulated",
            "clause": "Not the published TGSPDCL FY2025-26 schedule",
            "uri": "",
            "snippet": "Demo rates: base 7.50, solar window 6.00 (10:00-16:00), evening peak 9.00 (18:00-22:00). Labelled illustrative.",
        },
        {
            "source_title": "OSH Code 2020 and plant heat policy",
            "clause": "Team summary",
            "uri": "https://labour.gov.in",
            "snippet": "Team summary of occupational safety duties. Not a clause citation from a tariff order.",
        },
    ]

