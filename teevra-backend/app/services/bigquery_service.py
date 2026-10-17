"""
BigQuery Service for TEEVRA (asia-south1, Mumbai).
Manages all reads and writes for the 6 core manufacturing & safety tables:
1. versioned_factor_table
2. plant_orders_and_loads
3. workstation_roster
4. weather_forecast_48h
5. solved_schedules
6. safety_signals_audit_log
Includes resilient in-memory caching fallback for offline/demo robustness.
"""

import json
from datetime import UTC, datetime
from typing import Any

import structlog

from app.config import get_settings
from app.dependencies import get_cloud_container
from app.models.domain import (
    PlantOrder,
    VersionedFactor,
    WeatherSlot,
    WorkstationRoster,
)
from app.models.schedule import SchedulePlanResponse

logger = structlog.get_logger(__name__)


# Default Seed Factor Table Records (Official Rulebook)
DEFAULT_SEED_FACTORS = [
    # CEA Grid Factor
    VersionedFactor(
        factor_id="FACT_CEA_V20_2024",
        regime="CEA",
        parameter_name="cea_grid_emission_factor",
        numeric_value=0.716,
        unit="tCO2/MWh",
        source_document="CEA CO2 Baseline Database v20.0",
        source_clause="Baseline Database Dec 2024",
        version_tag="v20.0",
        effective_date="2024-12-01",
    ),
    # TGSPDCL ToD Tariffs
    VersionedFactor(
        factor_id="FACT_TARIFF_BASE",
        regime="TARIFF",
        parameter_name="base_industrial_ht1",
        numeric_value=7.50,
        unit="INR/kWh",
        tod_start_hour=6,
        tod_end_hour=10,
        tod_multiplier=1.0,
        source_document="TGSPDCL FY26 Tariff Order",
        source_clause="Clause 4.2a (Base Rate)",
        version_tag="FY2025-26",
        effective_date="2025-04-01",
    ),
    VersionedFactor(
        factor_id="FACT_TARIFF_SOLAR",
        regime="TARIFF",
        parameter_name="solar_discount_ht1",
        numeric_value=6.00,
        unit="INR/kWh",
        tod_start_hour=10,
        tod_end_hour=16,
        tod_multiplier=0.8,
        source_document="TGSPDCL FY26 Tariff Order",
        source_clause="Clause 4.2b (Solar Hours -20%)",
        version_tag="FY2025-26",
        effective_date="2025-04-01",
    ),
    VersionedFactor(
        factor_id="FACT_TARIFF_PEAK",
        regime="TARIFF",
        parameter_name="evening_peak_ht1",
        numeric_value=9.00,
        unit="INR/kWh",
        tod_start_hour=18,
        tod_end_hour=22,
        tod_multiplier=1.2,
        source_document="TGSPDCL FY26 Tariff Order",
        source_clause="Clause 4.2c (Evening Peak +20%)",
        version_tag="FY2025-26",
        effective_date="2025-04-01",
    ),
    # ISO 7243:2017 Table A.1 Heat Limits
    VersionedFactor(
        factor_id="FACT_ISO_CLASS_0_ACC",
        regime="SAFETY_ISO_7243",
        parameter_name="class_0_resting_limit",
        numeric_value=33.0,
        unit="deg_C",
        work_class=0,
        acclimatised=True,
        source_document="ISO 7243:2017 Standard",
        source_clause="Table A.1 (Resting 115W, Acclimatised)",
        version_tag="2017",
        effective_date="2017-08-01",
    ),
    VersionedFactor(
        factor_id="FACT_ISO_CLASS_1_ACC",
        regime="SAFETY_ISO_7243",
        parameter_name="class_1_low_limit",
        numeric_value=30.0,
        unit="deg_C",
        work_class=1,
        acclimatised=True,
        source_document="ISO 7243:2017 Standard",
        source_clause="Table A.1 (Low 180W, Acclimatised)",
        version_tag="2017",
        effective_date="2017-08-01",
    ),
    VersionedFactor(
        factor_id="FACT_ISO_CLASS_2_ACC",
        regime="SAFETY_ISO_7243",
        parameter_name="class_2_moderate_limit",
        numeric_value=28.0,
        unit="deg_C",
        work_class=2,
        acclimatised=True,
        source_document="ISO 7243:2017 Standard",
        source_clause="Table A.1 (Moderate 300W, Acclimatised)",
        version_tag="2017",
        effective_date="2017-08-01",
    ),
    VersionedFactor(
        factor_id="FACT_ISO_CLASS_3_ACC",
        regime="SAFETY_ISO_7243",
        parameter_name="class_3_high_furnace_limit",
        numeric_value=26.0,
        unit="deg_C",
        work_class=3,
        acclimatised=True,
        source_document="ISO 7243:2017 Standard",
        source_clause="Table A.1 (High 415W Furnace, Acclimatised)",
        version_tag="2017",
        effective_date="2017-08-01",
    ),
    VersionedFactor(
        factor_id="FACT_ISO_CLASS_4_ACC",
        regime="SAFETY_ISO_7243",
        parameter_name="class_4_very_high_limit",
        numeric_value=25.0,
        unit="deg_C",
        work_class=4,
        acclimatised=True,
        source_document="ISO 7243:2017 Standard",
        source_clause="Table A.1 (Very High 520W, Acclimatised)",
        version_tag="2017",
        effective_date="2017-08-01",
    ),
]


class BigQueryService:
    def __init__(self):
        self.settings = get_settings()
        self.container = get_cloud_container()
        self.dataset_id = self.settings.BIGQUERY_DATASET

        # In-memory store for fallback/demo resilience
        self._memory_factors: list[VersionedFactor] = list(DEFAULT_SEED_FACTORS)
        self._memory_orders: list[PlantOrder] = []
        self._memory_rosters: list[WorkstationRoster] = []
        self._memory_weather: list[WeatherSlot] = []
        self._memory_plans: dict[str, SchedulePlanResponse] = {}
        self._memory_audit_logs: list[dict[str, Any]] = []

    def get_versioned_factors(self, regime: str | None = None) -> list[VersionedFactor]:
        if self.container.is_cloud_connected and self.container.bigquery_client:
            try:
                table_ref = f"{self.settings.GCP_PROJECT_ID}.{self.dataset_id}.versioned_factor_table"
                query = f"SELECT DISTINCT * FROM `{table_ref}`"
                if regime:
                    query += f" WHERE regime = '{regime}'"
                query_job = self.container.bigquery_client.query(query)
                results = []
                for row in query_job.result():
                    results.append(VersionedFactor(**dict(row.items())))
                return results
            except Exception as e:
                logger.warning("bq_read_factors_failed_using_memory", error=str(e))

        if regime:
            return [f for f in self._memory_factors if f.regime == regime]
        return self._memory_factors

    def save_plant_orders(self, orders: list[PlantOrder]) -> int:
        self._memory_orders = list(orders)
        if self.container.is_cloud_connected and self.container.bigquery_client:
            try:
                table_ref = f"{self.settings.GCP_PROJECT_ID}.{self.dataset_id}.plant_orders_and_loads"
                rows = [o.model_dump() for o in orders]
                errors = self.container.bigquery_client.insert_rows_json(
                    table_ref, rows
                )
                if errors:
                    logger.error("bq_insert_orders_errors", errors=errors)
            except Exception as e:
                logger.warning("bq_save_orders_failed_using_memory", error=str(e))
        return len(orders)

    def get_plant_orders(self, batch_id: str | None = None) -> list[PlantOrder]:
        if self.container.is_cloud_connected and self.container.bigquery_client:
            try:
                table_ref = f"{self.settings.GCP_PROJECT_ID}.{self.dataset_id}.plant_orders_and_loads"
                query = f"SELECT DISTINCT * FROM `{table_ref}`"
                if batch_id:
                    query += f" WHERE upload_batch_id = '{batch_id}'"
                query_job = self.container.bigquery_client.query(query)
                return [PlantOrder(**dict(row.items())) for row in query_job.result()]
            except Exception as e:
                logger.warning("bq_get_orders_failed_using_memory", error=str(e))
        return self._memory_orders

    def save_workstation_roster(self, rosters: list[WorkstationRoster]) -> int:
        self._memory_rosters = list(rosters)
        if self.container.is_cloud_connected and self.container.bigquery_client:
            try:
                table_ref = f"{self.settings.GCP_PROJECT_ID}.{self.dataset_id}.workstation_roster"
                rows = [r.model_dump() for r in rosters]
                errors = self.container.bigquery_client.insert_rows_json(
                    table_ref, rows
                )
                if errors:
                    logger.error("bq_insert_rosters_errors", errors=errors)
            except Exception as e:
                logger.warning("bq_save_rosters_failed_using_memory", error=str(e))
        return len(rosters)

    def get_workstation_roster(self) -> list[WorkstationRoster]:
        if self.container.is_cloud_connected and self.container.bigquery_client:
            try:
                table_ref = f"{self.settings.GCP_PROJECT_ID}.{self.dataset_id}.workstation_roster"
                query = f"SELECT DISTINCT * FROM `{table_ref}`"
                query_job = self.container.bigquery_client.query(query)
                return [
                    WorkstationRoster(**dict(row.items())) for row in query_job.result()
                ]
            except Exception as e:
                logger.warning("bq_get_rosters_failed_using_memory", error=str(e))
        return self._memory_rosters

    def save_weather_forecast_48h(self, weather_slots: list[WeatherSlot]) -> int:
        self._memory_weather = list(weather_slots)
        if self.container.is_cloud_connected and self.container.bigquery_client:
            try:
                table_ref = f"{self.settings.GCP_PROJECT_ID}.{self.dataset_id}.weather_forecast_48h"
                rows = [w.model_dump() for w in weather_slots]
                self.container.bigquery_client.insert_rows_json(table_ref, rows)
            except Exception as e:
                logger.warning("bq_save_weather_failed_using_memory", error=str(e))
        return len(weather_slots)

    def get_weather_forecast_48h(self) -> list[WeatherSlot]:
        if self.container.is_cloud_connected and self.container.bigquery_client:
            try:
                table_ref = f"{self.settings.GCP_PROJECT_ID}.{self.dataset_id}.weather_forecast_48h"
                query = f"SELECT * FROM `{table_ref}` ORDER BY slot_index ASC"
                query_job = self.container.bigquery_client.query(query)
                return [WeatherSlot(**dict(row.items())) for row in query_job.result()]
            except Exception as e:
                logger.warning("bq_get_weather_failed_using_memory", error=str(e))
        return self._memory_weather

    def save_solved_schedule(self, plan: SchedulePlanResponse) -> str:
        self._memory_plans[plan.plan_id] = plan
        if self.container.is_cloud_connected and self.container.bigquery_client:
            try:
                table_ref = (
                    f"{self.settings.GCP_PROJECT_ID}.{self.dataset_id}.solved_schedules"
                )
                row = {
                    "plan_id": plan.plan_id,
                    "parent_plan_id": plan.parent_plan_id,
                    "created_at": plan.created_at,
                    "trigger_type": plan.trigger_type,
                    "solver_status": plan.solver_status,
                    "solve_time_sec": plan.solve_time_sec,
                    "kpi_json": plan.kpi.model_dump_json(),
                    "schedule_slots_json": json.dumps(
                        [s.model_dump() for s in plan.schedule_slots]
                    ),
                    "heat_buffers_json": json.dumps(
                        [b.model_dump() for b in plan.heat_buffers]
                    ),
                    "gemini_explanation_text": plan.gemini_explanation_text,
                    "citations_json": json.dumps(
                        [c.model_dump() for c in plan.citations]
                    ),
                }
                self.container.bigquery_client.insert_rows_json(table_ref, [row])
            except Exception as e:
                logger.warning("bq_save_plan_failed_using_memory", error=str(e))
        return plan.plan_id

    def get_latest_solved_schedule(self) -> SchedulePlanResponse | None:
        if self._memory_plans:
            latest_id = list(self._memory_plans.keys())[-1]
            return self._memory_plans[latest_id]
        return None

    def log_safety_signal(
        self,
        event_id: str,
        station_id: str,
        signal_category: str,
        action_taken: str = "",
        action: str | None = None,
        rest_minutes: int = 0,
        rest_minutes_assigned: int | None = None,
        hazard_code: str | None = None,
        absorbed_by_buffer_id: str | None = None,
        triggered_replan: bool = False,
    ) -> dict[str, Any]:
        """Privacy-preserving audit log. Zero worker PII or GPS coordinates stored."""
        final_action = action if action is not None else action_taken
        final_rest = (
            rest_minutes if rest_minutes_assigned is None else rest_minutes_assigned
        )
        now_iso = datetime.now(UTC).isoformat()
        audit_entry = {
            "event_id": event_id,
            "created_at": now_iso,
            "station_id": station_id,
            "signal_category": signal_category,
            "hazard_code": hazard_code,
            "action_taken": final_action,
            "rest_minutes_assigned": final_rest,
            "absorbed_by_buffer_id": absorbed_by_buffer_id,
            "triggered_replan": triggered_replan,
            "retention_expires_at": now_iso,
        }
        self._memory_audit_logs.append(audit_entry)
        if self.container.is_cloud_connected and self.container.bigquery_client:
            try:
                table_ref = f"{self.settings.GCP_PROJECT_ID}.{self.dataset_id}.safety_signals_audit_log"
                self.container.bigquery_client.insert_rows_json(
                    table_ref, [audit_entry]
                )
            except Exception as e:
                logger.warning("bq_log_safety_failed_using_memory", error=str(e))
        return audit_entry

    def get_station_hazard_aggregates(self) -> list[dict[str, Any]]:
        """Privacy guarantee: station hazard aggregates only returned when COUNT(*) >= 3."""
        counts = {}
        for entry in self._memory_audit_logs:
            s_id = entry["station_id"]
            counts[s_id] = counts.get(s_id, 0) + 1

        aggregates = []
        for s_id, count in counts.items():
            if count >= 3:
                aggregates.append(
                    {
                        "station_id": s_id,
                        "incident_count": count,
                        "privacy_protected": True,
                    }
                )
        return aggregates


# Global singleton instance
bq_service = BigQueryService()
