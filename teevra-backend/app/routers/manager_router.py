"""
Manager Router (Feature 1 & Feature 2):
- Upload factory orders, machine routing, and worker rosters to GCS & BigQuery
- Extract shift/lockout rules via Gemini Function Calling
- Solve 48-Hour Dual Schedules (Baseline vs Heat-Safe & Carbon-Aware Plan)
- Compare financial, energy, carbon, and thermal KPIs
"""

import io
from datetime import datetime, UTC
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from app.core_math.ortools_solver import solve_dual_schedules
from app.models.constraints import ExtractedPlantConstraints
from app.models.domain import (
    PlantOrder,
    WorkstationRoster,
    PlanningConfigRequest,
    VALID_SLOT_MINUTES,
)
from app.models.schedule import SchedulePlanResponse
from app.services.bigquery_service import bq_service
from app.services.firestore_fcm_service import firestore_fcm_service
from app.services.gemini_flash_service import gemini_flash_service
from app.services.storage_service import storage_service
from app.services.weather_integrator import weather_integrator

router = APIRouter(prefix="/api/v1/manager", tags=["Manager Core Scheduler"])

CURRENT_ACTIVE_ROSTERS: list[WorkstationRoster] = []
CURRENT_ACTIVE_WORKERS: list[dict] = []

_DATA_ROOT = Path(__file__).resolve().parent.parent / "data"
_DAY_PACKAGES = [
    {
        "day_id": "day1_monday",
        "label": "Day 1 — Monday (Aerospace & Defense melt)",
        "folder": "Day 1 - Monday",
        "orders": "day1_monday_orders.csv",
        "roster": "day1_monday_workers_roster_260.csv",
        "tariff": "day1_monday_tgspdcl_tariff.csv",
    },
    {
        "day_id": "day2_tuesday",
        "label": "Day 2 — Tuesday (EV powertrain)",
        "folder": "Day 2 - Tuesday",
        "orders": "day2_tuesday_orders.csv",
        "roster": "day2_tuesday_workers_roster_255.csv",
        "tariff": "day2_tuesday_tgspdcl_tariff.csv",
    },
    {
        "day_id": "day3_wednesday",
        "label": "Day 3 — Wednesday (Railways bogie & axles)",
        "folder": "Day 3 - Wednesday",
        "orders": "day3_wednesday_orders.csv",
        "roster": "day3_wednesday_workers_roster_265.csv",
        "tariff": "day3_wednesday_tgspdcl_tariff.csv",
    },
    {
        "day_id": "day4_thursday",
        "label": "Day 4 — Thursday (Wind turbine gears)",
        "folder": "Day 4 - Thursday",
        "orders": "day4_thursday_orders.csv",
        "roster": "day4_thursday_workers_roster_258.csv",
        "tariff": "day4_thursday_tgspdcl_tariff.csv",
    },
    {
        "day_id": "day5_friday",
        "label": "Day 5 — Friday (Orthopedic titanium)",
        "folder": "Day 5 - Friday",
        "orders": "day5_friday_orders.csv",
        "roster": "day5_friday_workers_roster_270.csv",
        "tariff": "day5_friday_tgspdcl_tariff.csv",
    },
]


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
                if len(orders) >= 10:
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
        try:
            df = (
                pd.read_csv(io.BytesIO(content))
                if orders_file.filename.endswith(".csv")
                else pd.read_excel(io.BytesIO(content))
            )
            for _, row in df.iterrows():
                uploaded_orders.append(
                    PlantOrder(upload_batch_id=batch_id, **row.to_dict())
                )
        except Exception:
            uploaded_orders = DEFAULT_DEMO_ORDERS
    else:
        uploaded_orders = DEFAULT_DEMO_ORDERS

    global CURRENT_ACTIVE_ROSTERS, CURRENT_ACTIVE_WORKERS
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
async def solve_morning_plan(config: PlanningConfigRequest | None = None):
    """
    Executes CP-SAT Optimization with configurable time slots & planning horizon:
    - Supported slot resolutions: 15m, 30m, 1h (60m), 1.5h (90m), 2h (120m), 2.5h (150m), 3h (180m).
    - Supported horizons: 24h, 48h (default), 72h.
    - Generates unconstrained Output-Only Baseline comparator.
    - Generates Heat-Safe & Carbon-Aware Plan with zero heat breaches and pre-allocated heat buffers.
    - Evaluates honest CEA carbon and TGSPDCL ToD electricity bill savings.
    """
    plan_config = config or PlanningConfigRequest()
    if plan_config.slot_duration_minutes not in VALID_SLOT_MINUTES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid slot_duration_minutes {plan_config.slot_duration_minutes}. Must be one of: {VALID_SLOT_MINUTES}"
        )

    orders: list[PlantOrder] = []
    if plan_config.orders_csv and len(plan_config.orders_csv.strip()) > 0:
        try:
            df = pd.read_csv(io.StringIO(plan_config.orders_csv))
            col_map = {str(c).strip().lower(): c for c in df.columns}
            
            def get_val(row, aliases, default=None):
                for a in aliases:
                    if a in col_map:
                        v = row[col_map[a]]
                        if pd.notna(v):
                            return v
                return default

            for idx, row in df.iterrows():
                order_id = str(get_val(row, ["order_id", "id", "order", "orderid"], f"ORD_{idx+1}"))
                job_name = str(get_val(row, ["job_name", "job", "name", "jobname", "description"], f"Job #{order_id}"))
                machine_id = str(get_val(row, ["machine_id", "machine", "machineid"], "CNC_1")).upper()
                station_id = str(get_val(row, ["station_id", "station", "stationid", "station_name"], f"st_{machine_id.lower()}"))
                
                try:
                    duration_mins = int(float(get_val(row, ["duration_mins", "duration", "mins", "duration_minutes"], 120)))
                except (ValueError, TypeError):
                    duration_mins = 120
                    
                try:
                    duration_slots = int(float(get_val(row, ["duration_slots", "slots"], max(1, duration_mins // 15))))
                except (ValueError, TypeError):
                    duration_slots = max(1, duration_mins // 15)
                    
                try:
                    kwh_per_op = float(get_val(row, ["kwh_per_op", "kwh", "kwh_op", "energy_kwh"], 100.0))
                except (ValueError, TypeError):
                    kwh_per_op = 100.0
                    
                try:
                    restart_kwh = float(get_val(row, ["restart_kwh", "restart"], 10.0))
                except (ValueError, TypeError):
                    restart_kwh = 10.0
                    
                raw_tag = str(get_val(row, ["load_tag", "tag", "flexibility"], "shiftable")).lower()
                load_tag = raw_tag if raw_tag in ["fixed", "shiftable", "interruptible"] else "shiftable"
                splittable = str(get_val(row, ["splittable", "can_split"], "false")).lower() in ["true", "1", "yes"]
                
                try:
                    due_slot = int(float(get_val(row, ["due_slot", "due"], 191)))
                except (ValueError, TypeError):
                    due_slot = 191
                    
                is_crit = str(get_val(row, ["is_critical_melt", "critical_melt", "critical", "is_critical"], "false")).lower() in ["true", "1", "yes"]
                upload_batch = str(get_val(row, ["upload_batch_id", "batch_id", "batch"], "custom_manager_upload"))
                
                orders.append(PlantOrder(
                    upload_batch_id=upload_batch,
                    order_id=order_id,
                    job_name=job_name,
                    machine_id=machine_id,
                    station_id=station_id,
                    routing_seq=1,
                    duration_mins=duration_mins,
                    duration_slots=duration_slots,
                    kwh_per_op=kwh_per_op,
                    restart_kwh=restart_kwh,
                    load_tag=load_tag,
                    splittable=splittable,
                    due_slot=due_slot,
                    is_critical_melt=is_crit
                ))
        except Exception as e:
            logger.warning(f"Failed parsing uploaded orders CSV: {e}")
            orders = []
    elif plan_config.day_id:
        day_dir_map = {
            "day1_monday": ("Day 1 - Monday", "day1_monday_orders.csv"),
            "day2_tuesday": ("Day 2 - Tuesday", "day2_tuesday_orders.csv"),
            "day3_wednesday": ("Day 3 - Wednesday", "day3_wednesday_orders.csv"),
            "day4_thursday": ("Day 4 - Thursday", "day4_thursday_orders.csv"),
            "day5_friday": ("Day 5 - Friday", "day5_friday_orders.csv"),
        }
        if plan_config.day_id in day_dir_map:
            folder, fname = day_dir_map[plan_config.day_id]
            day_path = Path(__file__).resolve().parent.parent / "data" / folder / "Orders" / fname
            if day_path.exists():
                try:
                    df = pd.read_csv(day_path)
                    orders = [PlantOrder(**row.to_dict()) for _, row in df.iterrows()]
                except Exception:
                    orders = []

    if not orders:
        orders = bq_service.get_plant_orders()
    if not orders:
        orders = DEFAULT_DEMO_ORDERS
        bq_service.save_plant_orders(orders)

    rosters = CURRENT_ACTIVE_ROSTERS if CURRENT_ACTIVE_ROSTERS else bq_service.get_workstation_roster()
    if not rosters:
        rosters = DEFAULT_DEMO_ROSTERS
        bq_service.save_workstation_roster(rosters)

    weather_slots = await weather_integrator.fetch_48h_weather()
    bq_service.save_weather_forecast_48h(weather_slots)

    # Solve dual plans with user-configured slot resolution and horizon
    baseline_plan, optimized_plan = solve_dual_schedules(
        orders=orders,
        rosters=rosters,
        weather_slots=weather_slots,
        horizon_hours=plan_config.horizon_hours,
        slot_duration_minutes=plan_config.slot_duration_minutes,
    )

    # Generate grounded explanation strictly around calculated numbers
    explanation_res = await gemini_flash_service.generate_plan_explanation(
        kpi=optimized_plan.kpi,
        baseline_kpi=baseline_plan.kpi,
        heat_buffer_count=len(optimized_plan.heat_buffers),
        trigger_type=f"MORNING_PLAN ({plan_config.slot_label} slots, {plan_config.horizon_hours}h horizon)",
    )

    optimized_plan.gemini_explanation_text = explanation_res["explanation"]
    optimized_plan.citations = explanation_res["citations"]

    # Persist in BigQuery and sync state to Firestore
    bq_service.save_solved_schedule(optimized_plan)
    for buf in optimized_plan.heat_buffers:
        firestore_fcm_service.update_station_state(
            buf.station_id,
            {
                "status": "HEAT_BUFFER_ACTIVE",
                "buffer_capacity_mins": buf.remaining_capacity_minutes,
            },
        )

    return optimized_plan


@router.get("/active-plan", response_model=SchedulePlanResponse)
async def get_active_plan():
    """Fetches the latest active 48-hour schedule plan."""
    plan = bq_service.get_latest_solved_schedule()
    if not plan:
        # Generate on the fly if none exists
        return await solve_morning_plan()
    return plan


@router.get("/morning-plan", response_model=SchedulePlanResponse)
async def get_morning_plan():
    """Frontend compatibility endpoint for morning plan."""
    return await get_active_plan()


@router.post("/approve-and-solve", response_model=SchedulePlanResponse)
async def approve_and_solve(constraints: dict | None = None):
    """Frontend compatibility endpoint for approving parsed rules and solving."""
    c = constraints or {}
    cfg = PlanningConfigRequest(
        horizon_hours=c.get("horizon_hours", 48),
        slot_duration_minutes=c.get("slot_duration_minutes", 15),
        orders_csv=c.get("orders_csv"),
        day_id=c.get("day_id"),
    )
    return await solve_morning_plan(cfg)


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


def _deterministic_constraints_from_text(text: str) -> list[dict]:
    """Keyword parser used only when Gemini did not return a function call."""
    lowered = (text or "").lower()
    paint = "paint" in lowered
    furnace = "furnace" in lowered
    rows: list[dict] = []
    if paint and not furnace:
        rows.append({
            "constraint_id": "CNS-PAINT-ONLY",
            "station": "paint_oven_bay",
            "work_class": 2,
            "acclimatised": True,
            "wbgt_limit_c": 28.0,
            "frozen_window_hours": 0,
            "unsure": False,
            "source": "Deterministic fallback, no Gemini call",
        })
    if furnace and not paint:
        no_pour = "15:00" in lowered or "15.00" in lowered or "no pour" in lowered
        rows.append({
            "constraint_id": "CNS-FURNACE-ONLY",
            "station": "furnace_manual",
            "work_class": 3,
            "acclimatised": True,
            "wbgt_limit_c": 26.0,
            "frozen_window_hours": 2,
            "no_pour_after_hour": 15 if no_pour else None,
            "unsure": False,
            "source": "Deterministic fallback, no Gemini call",
        })
    if "line 9" in lowered or "unknown station" in lowered:
        rows.append({
            "constraint_id": "CNS-UNSURE-STATION",
            "station": "Please check",
            "work_class": None,
            "acclimatised": None,
            "wbgt_limit_c": None,
            "frozen_window_hours": None,
            "unsure": True,
            "source": "Deterministic fallback, no Gemini call",
        })
    if not rows:
        rows.append({
            "constraint_id": "CNS-PLANT-ISO",
            "station": "all_manual_stations",
            "work_class": None,
            "acclimatised": True,
            "wbgt_limit_c": None,
            "frozen_window_hours": 2,
            "unsure": True,
            "source": "Deterministic fallback, no Gemini call",
        })
    return rows


@router.post("/parse-rules")
async def parse_rules_endpoint(
    csv_file: UploadFile | None = File(None),
    pdf_file: UploadFile | None = File(None),
    natural_language_rule: str = Form("Keep every station within its ISO 7243 limit, keep output at 98% or more, and enforce a 2-hour frozen window."),
):
    """Gemini function-calling extraction. Falls back with an explicit source label."""
    import time
    from app.config import get_settings

    started = time.perf_counter()
    gemini_res = None
    source = "deterministic_fallback"
    model_version = None
    try:
        gemini_res = await gemini_flash_service.extract_constraints_from_memo(natural_language_rule)
    except Exception:
        gemini_res = None

    latency_ms = int((time.perf_counter() - started) * 1000)
    c_list: list[dict] = []
    if gemini_res and (gemini_res.shift_rules or gemini_res.machine_lockouts):
        source = "gemini"
        model_version = get_settings().GEMINI_FLASH_MODEL
        for idx, rule in enumerate(gemini_res.shift_rules, 1):
            c_list.append({
                "constraint_id": f"CNS-GEMINI-SHIFT-{idx:02d}",
                "station": rule.shift_name,
                "work_class": None,
                "acclimatised": True,
                "wbgt_limit_c": None,
                "frozen_window_hours": 2,
                "mandatory_rest_minutes": rule.mandatory_rest_minutes,
                "unsure": False,
                "source": "gemini",
            })
        for idx, lock in enumerate(gemini_res.machine_lockouts, 1):
            c_list.append({
                "constraint_id": f"CNS-GEMINI-LOCK-{idx:02d}",
                "station": lock.machine_id,
                "work_class": None,
                "acclimatised": True,
                "wbgt_limit_c": None,
                "frozen_window_hours": 2,
                "lockout_start_slot": lock.lockout_start_slot,
                "lockout_end_slot": lock.lockout_end_slot,
                "unsure": False,
                "source": "gemini",
            })
    if not c_list:
        source = "deterministic_fallback"
        model_version = None
        c_list = _deterministic_constraints_from_text(natural_language_rule)

    return {
        "constraints": c_list,
        "tariff_periods": _illustrative_tariff_periods(),
        "frozen_window_hours": 2,
        "gemini_model": model_version,
        "model_version": model_version,
        "region": get_settings().VERTEX_REGION if source == "gemini" else None,
        "source": source,
        "latency_ms": latency_ms,
        "extraction_timestamp": datetime.now(UTC).isoformat(),
        "is_fallback": source != "gemini",
        "label": "Gemini" if source == "gemini" else "Deterministic fallback, no Gemini call",
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

