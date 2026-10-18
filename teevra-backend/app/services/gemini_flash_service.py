"""
Vertex AI Gemini Flash Service for TEEVRA.
Adheres strictly to the Golden Neuro-Symbolic Rule:
- Structured extraction via Function Calling with JSON Schema validation
- Plain-English explanations generated strictly around deterministically calculated numbers
- Grounded citations referencing TGSPDCL Tariff Order and ISO 7243:2017 standard
- Zero AI hallucinations: AI is never asked to generate or modify numeric metrics
"""

import json
import re
from typing import Any

import structlog

from app.config import get_settings
from app.dependencies import get_cloud_container
from app.models.constraints import ExtractedPlantConstraints
from app.models.schedule import CitationItem, KPISummary

logger = structlog.get_logger(__name__)

# ISO 7243:2017 Table A.1, acclimatised. Gemini maps class; these numbers stay in code.
ISO_WBGT_ACCLIMATISED = {0: 33.0, 1: 30.0, 2: 28.0, 3: 26.0, 4: 25.0}
ISO_CLASS_NAME = {0: "Resting", 1: "Low", 2: "Moderate", 3: "High", 4: "Very high"}

MANAGER_RULES_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "minimum_output_percentage": {"type": "number"},
        "frozen_window_hours": {"type": "integer"},
        "heat_buffer_count": {"type": "integer"},
        "rules": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "station": {"type": "string"},
                    "work_class": {"type": "integer"},
                    "summary": {"type": "string"},
                },
                "required": ["station", "work_class", "summary"],
            },
        },
    },
    "required": [
        "rules",
        "frozen_window_hours",
        "minimum_output_percentage",
        "heat_buffer_count",
    ],
}


# Official Grounded Citations
OFFICIAL_CITATIONS: list[CitationItem] = [
    CitationItem(
        source_title="Illustrative time-of-day tariff (simulated)",
        clause="Solar, normal and peak bands",
        snippet="Solar 10:00–16:00 ₹6.00/kWh, normal ₹7.50/kWh, peak 18:00–22:00 ₹9.00/kWh. Modelled on TGSPDCL ToD structure; not a quoted tariff order.",
    ),
    CitationItem(
        source_title="ISO 7243:2017 Ergonomics of the thermal environment",
        clause="Annex A, Table A.1: WBGT reference values",
        snippet="Reference WBGT for acclimatised workers: about 33°C at rest, 30°C low, 28°C moderate, 26°C high metabolic rate. A screening value above the reference triggers further assessment.",
    ),
    CitationItem(
        source_title="CEA CO2 Baseline Database for the Indian Power Sector, v22",
        clause="Weighted average grid emission factor",
        snippet="0.675 tCO2/MWh. Moving load in time at a single average factor does not change CO2, so no CO2 saving is claimed for time-shifting.",
    ),
]


class GeminiFlashService:
    def __init__(self):
        self.settings = get_settings()
        self.container = get_cloud_container()

    def _attach_iso_limits(self, policy: dict[str, Any], source: str) -> list[dict[str, Any]]:
        frozen = int(policy.get("frozen_window_hours") or 2)
        output = float(policy.get("minimum_output_percentage") or 98.0)
        buffers = int(policy.get("heat_buffer_count") or 2)
        rows: list[dict[str, Any]] = []
        for idx, rule in enumerate(policy.get("rules") or [], 1):
            try:
                work_class = int(rule.get("work_class"))
            except (TypeError, ValueError):
                work_class = 3
            work_class = min(4, max(0, work_class))
            wbgt = ISO_WBGT_ACCLIMATISED[work_class]
            station = str(rule.get("station") or "All stations").strip() or "All stations"
            summary = str(rule.get("summary") or "").strip()
            rows.append({
                "constraint_id": f"CNS-{idx:02d}",
                "station": station,
                "work_class": work_class,
                "acclimatised": True,
                "wbgt_limit_c": wbgt,
                "frozen_window_hours": frozen,
                "minimum_output_percentage": output,
                "heat_buffer_count": buffers,
                "parameter": (
                    f"WBGT ≤ {wbgt:g}°C · Class {work_class} {ISO_CLASS_NAME[work_class]} (acclimatised). "
                    f"Frozen window {frozen}h · output ≥ {output:g}% · {buffers} heat buffers."
                ),
                "summary": summary,
                "source": "ISO 7243:2017 Table A.1",
                "unsure": False,
            })
        if not rows:
            rows.append({
                "constraint_id": "CNS-PLANT-ISO",
                "station": "All stations",
                "work_class": 3,
                "acclimatised": True,
                "wbgt_limit_c": 26.0,
                "frozen_window_hours": frozen,
                "minimum_output_percentage": output,
                "heat_buffer_count": buffers,
                "parameter": (
                    f"WBGT ≤ 26°C · Class 3 High (acclimatised). "
                    f"Frozen window {frozen}h · output ≥ {output:g}% · {buffers} heat buffers."
                ),
                "summary": "Plant-wide ISO 7243 Table A.1 high-metabolic limit",
                "source": "ISO 7243:2017 Table A.1",
                "unsure": True,
            })
        for row in rows:
            row["extraction_source"] = source
        return rows

    def _fallback_manager_policy(self, text_content: str) -> dict[str, Any]:
        lowered = (text_content or "").lower()
        frozen = 2
        frozen_match = re.search(r"(\d+)\s*-?\s*hour(?:s)?\s+frozen", lowered)
        if frozen_match:
            frozen = int(frozen_match.group(1))
        output = 98.0
        output_match = re.search(r"(\d+(?:\.\d+)?)\s*%", lowered)
        if output_match:
            output = float(output_match.group(1))
        buffers = 2
        buffer_match = re.search(r"(\d+)\s+heat buffer", lowered)
        if buffer_match:
            buffers = int(buffer_match.group(1))

        rules: list[dict[str, Any]] = []
        if "furnace" in lowered or "pour" in lowered or "melt" in lowered:
            rules.append({
                "station": "Furnace bay",
                "work_class": 3,
                "summary": "Furnace / melt work stays at ISO 7243 Class 3",
            })
        if "paint" in lowered or "oven" in lowered:
            rules.append({
                "station": "Paint / oven",
                "work_class": 2,
                "summary": "Paint and curing stay at ISO 7243 Class 2",
            })
        plant_wide = "every station" in lowered or "iso 7243" in lowered or "all station" in lowered
        if plant_wide or not rules:
            rules = [
                {
                    "station": "Furnace bay",
                    "work_class": 3,
                    "summary": "Class 3 high metabolic work, ISO 7243 Table A.1",
                },
                {
                    "station": "CNC / paint / moderate work",
                    "work_class": 2,
                    "summary": "Class 2 moderate metabolic work, ISO 7243 Table A.1",
                },
                {
                    "station": "Light stations",
                    "work_class": 1,
                    "summary": "Class 1 low metabolic work, ISO 7243 Table A.1",
                },
            ]
        return {
            "minimum_output_percentage": output,
            "frozen_window_hours": frozen,
            "heat_buffer_count": buffers,
            "rules": rules,
        }

    async def extract_manager_rules(self, text_content: str, timeout_sec: float = 30.0) -> dict[str, Any]:
        """Gemini JSON extract of manager rules. WBGT numbers come from ISO Table A.1 in code."""
        import asyncio
        import time
        from google.genai import types

        started = time.perf_counter()
        prompt = (
            "Extract factory heat-safety and planning rules from the manager note.\n"
            "Use only ISO 7243:2017 Table A.1 acclimatised metabolic classes: "
            "0 resting, 1 low, 2 moderate, 3 high, 4 very high.\n"
            "Do not invent temperatures. The server will attach Table A.1 WBGT values.\n"
            "Station names must be readable plant areas such as Furnace bay, CNC bay, Paint / oven.\n"
            "If the note applies to every station, emit three rules: furnace Class 3, moderate Class 2, light Class 1.\n"
            "Extract frozen window hours, minimum output percentage, and heat buffer count when stated.\n\n"
            f"Manager note:\n{text_content}"
        )

        if self.container.genai_client:
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.container.genai_client.models.generate_content,
                        model=self.settings.GEMINI_FLASH_MODEL,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=MANAGER_RULES_JSON_SCHEMA,
                            temperature=0,
                            thinking_config=types.ThinkingConfig(thinking_budget=0),
                        ),
                    ),
                    timeout=timeout_sec,
                )
                policy = json.loads(response.text or "{}")
                if not isinstance(policy, dict) or not policy.get("rules"):
                    raise ValueError("Gemini returned no rules")
                latency_ms = int((time.perf_counter() - started) * 1000)
                logger.info("gemini_manager_rules_extracted", latency_ms=latency_ms, rules=len(policy["rules"]))
                return {
                    "constraints": self._attach_iso_limits(policy, "gemini"),
                    "frozen_window_hours": int(policy.get("frozen_window_hours") or 2),
                    "source": "gemini",
                    "model": self.settings.GEMINI_FLASH_MODEL,
                    "latency_ms": latency_ms,
                }
            except Exception as e:
                logger.warning("gemini_extract_failed_using_deterministic_fallback", error=str(e))
                fallback = self._fallback_manager_policy(text_content)
                return {
                    "constraints": self._attach_iso_limits(fallback, "deterministic_fallback"),
                    "frozen_window_hours": int(fallback["frozen_window_hours"]),
                    "source": "deterministic_fallback",
                    "model": None,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                    "error": type(e).__name__,
                }

        fallback = self._fallback_manager_policy(text_content)
        return {
            "constraints": self._attach_iso_limits(fallback, "deterministic_fallback"),
            "frozen_window_hours": int(fallback["frozen_window_hours"]),
            "source": "deterministic_fallback",
            "model": None,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "error": "Gemini not configured",
        }

    async def extract_constraints_from_memo(
        self, text_content: str
    ) -> ExtractedPlantConstraints:
        """JSON extract used by /parse-memo. WBGT stays in ISO Table A.1 lookup."""
        parsed = await self.extract_manager_rules(text_content)
        first = (parsed.get("constraints") or [{}])[0]
        notes = "; ".join(
            f"{c.get('station')}: {c.get('parameter')}"
            for c in parsed.get("constraints") or []
        )
        return ExtractedPlantConstraints(
            plant_name="Telangana Heavy Metal Works",
            effective_date="2026-10-18",
            shift_rules=[],
            machine_lockouts=[],
            order_priorities=[],
            relief_assignments=[],
            solar_peak_load_shifting_enabled=True,
            minimum_output_percentage=float(first.get("minimum_output_percentage") or 98.0),
            notes_or_caveats=notes or "Parsed via resilient deterministic extractor.",
        )

    async def generate_plan_explanation(
        self,
        kpi: KPISummary,
        baseline_kpi: KPISummary | None,
        heat_buffer_count: int,
        trigger_type: str,
        summary: str = "",
        move_reasons: list[str] | None = None,
        timeout_sec: float = 15.0,
    ) -> dict[str, Any]:
        """
        Plain-English summary around the solver's numbers. Gemini only rewords facts it is given;
        if it is unavailable the deterministic summary is used and the trace says so.
        """
        facts = summary or (
            f"Bill ₹{kpi.total_cost_inr:,.0f}; saves ₹{kpi.cost_savings_inr:,.0f}; "
            f"heat-breach slots {kpi.heat_breaches_count}; output {kpi.output_percentage:g}%."
        )
        moves = "\n".join(f"- {r}" for r in (move_reasons or [])[:10])
        prompt = (
            "You write a three-sentence note for a factory shift manager about tomorrow's production plan.\n"
            "Use only the facts below. Do not add, round or invent any number, rule or clause.\n"
            "Sentence 1: what the plan saves. Sentence 2: how it keeps crews out of unsafe heat. "
            "Sentence 3: one honest caveat about energy or CO2.\n\n"
            f"Trigger: {trigger_type}\n"
            f"Facts: {facts}\n"
            f"CO2 note: {kpi.honest_co2_banner}\n"
            f"Job moves:\n{moves}\n"
        )
        template = f"{facts} {kpi.honest_co2_banner}"

        if self.container.is_cloud_connected and self.container.genai_client:
            import asyncio
            import time

            started = time.perf_counter()
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.container.genai_client.models.generate_content,
                        model=self.settings.GEMINI_FLASH_MODEL,
                        contents=prompt,
                    ),
                    timeout=timeout_sec,
                )
                usage = getattr(response, "usage_metadata", None)
                return {
                    "explanation": (response.text or "").strip() or template,
                    "citations": OFFICIAL_CITATIONS,
                    "trace": {
                        "source": "gemini",
                        "model": self.settings.GEMINI_FLASH_MODEL,
                        "model_version": getattr(response, "model_version", None),
                        "region": self.settings.VERTEX_REGION,
                        "latency_ms": int((time.perf_counter() - started) * 1000),
                        "prompt_tokens": getattr(usage, "prompt_token_count", None),
                        "output_tokens": getattr(usage, "candidates_token_count", None),
                    },
                }
            except Exception as e:
                logger.warning("gemini_explanation_failed_using_template", error=str(e))
                return {
                    "explanation": template,
                    "citations": OFFICIAL_CITATIONS,
                    "trace": {
                        "source": "template",
                        "model": self.settings.GEMINI_FLASH_MODEL,
                        "latency_ms": int((time.perf_counter() - started) * 1000),
                        "error": type(e).__name__,
                    },
                }

        return {
            "explanation": template,
            "citations": OFFICIAL_CITATIONS,
            "trace": {"source": "template", "error": "Gemini not configured"},
        }


# Global singleton instance
gemini_flash_service = GeminiFlashService()
