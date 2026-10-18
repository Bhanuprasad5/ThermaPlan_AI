"""
Google OR-Tools CP-SAT scheduler for TEEVRA.

Supports configurable planning horizons (24h, 48h, 72h) and slot resolutions
(15, 30, 60, 90, 120, 150, 180 minutes; 192 slots for 48h at 15 minutes).

Model:
- Fixed-length jobs: one start variable and one optional interval per job.
- Splittable jobs: one boolean per allowed slot, with a size-1 optional interval
  per slot; every new run segment counts as a restart.
- Machines: NoOverlap over all intervals on the same machine.
- Heat safety: slots where the station screening WBGT exceeds the ISO 7243
  reference value, and the daily 13:00 heat buffer, are removed from a job's domain.
- Breakdown: repair window removed for the faulted machine; slots before the
  fault and healthy lines inside the 2-hour frozen window keep their previous plan.
- Jobs that cannot be placed are left out and lower output_percentage, so the
  model never becomes infeasible.

The search is deterministic: fixed seed, one worker and a deterministic time
limit, so the same input always yields the same plan and plan_hash.
"""
import hashlib
import math
import time
from typing import Any

from ortools.sat.python import cp_model

from app.core_math.carbon_tariff_calc import (
    CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH,
    compute_honest_carbon_and_savings,
    get_tgspdcl_tod_rate,
)
from app.core_math.plan_insights import build_plan_views, build_summary
from app.core_math.wbgt_calculator import (
    calculate_effective_wbgt,
    get_iso_limit,
    get_station_globe_temp,
)
from app.models.domain import PlantOrder, WeatherSlot, WorkstationRoster
from app.models.schedule import (
    HeatBuffer,
    KPISummary,
    SchedulePlanResponse,
    ScheduleSlotAssignment,
)

TOTAL_SLOTS = 192  # Default 48h @ 15 min
SOLVER_SEED = 42
DETERMINISTIC_TIME_LIMIT = 20.0
WALL_CLOCK_GUARD_SEC = 90.0
RESTART_CAP_ABOVE_BASELINE = 2
# Paise per required slot left unscheduled; dominates every tariff term so output comes first.
UNSCHEDULED_PENALTY_PER_SLOT = 10_000_000
# Paise of machine wear charged per restart on top of restart energy.
RESTART_WEAR_COST_PAISE = 20_000


def _job_key(job: PlantOrder) -> str:
    return f"{job.order_id}_{job.routing_seq}"


def compute_plan_hash(schedule_slots: list[ScheduleSlotAssignment], seed: int = SOLVER_SEED) -> str:
    """SHA-256 over the sorted (order_id, machine_id, slot) triples of active work plus the seed."""
    triples = sorted(
        (s.order_id, s.machine_id, s.slot_index)
        for s in schedule_slots
        if s.is_active and not s.is_heat_buffer
    )
    payload = ";".join(f"{o}|{m}|{t}" for o, m, t in triples) + f";seed={seed}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class TeevraCPSATScheduler:
    def __init__(
        self,
        orders: list[PlantOrder],
        rosters: list[WorkstationRoster],
        weather_slots: list[WeatherSlot],
        horizon_hours: int = 48,
        slot_duration_minutes: int = 15,
    ):
        seen_keys = set()
        unique_orders = []
        for o in orders:
            k = (o.order_id, o.routing_seq)
            if k not in seen_keys:
                seen_keys.add(k)
                unique_orders.append(o)
        self.orders = sorted(unique_orders, key=lambda o: (o.order_id, o.routing_seq))
        self.rosters = {r.station_id: r for r in rosters}
        self.weather = {w.slot_index: w for w in weather_slots}
        self.horizon_hours = horizon_hours
        self.slot_duration_minutes = slot_duration_minutes
        self.total_slots = max(1, (horizon_hours * 60) // slot_duration_minutes)
        self.slot_rates = [
            get_tgspdcl_tod_rate(self._get_slot_time_info(t)["hour"])["rate_inr"]
            for t in range(self.total_slots)
        ]
        self.thermal_matrix: dict[tuple[str, int], dict[str, Any]] = {}
        self._precompute_thermal_matrix()

    def _get_slot_time_info(self, t: int) -> dict[str, int]:
        total_mins = t * self.slot_duration_minutes
        h = (total_mins // 60) % 24
        m = total_mins % 60
        day = (total_mins // (24 * 60)) + 1
        return {"hour": h, "minute": m, "day": day, "total_mins": total_mins}

    def _duration_slots(self, job: PlantOrder) -> int:
        return max(1, math.ceil(job.duration_mins / self.slot_duration_minutes))

    def _due_slot(self, job: PlantOrder) -> int:
        """Last slot a job may occupy. due_slot in the CSV is in 15-minute units."""
        due_minutes = (int(job.due_slot) + 1) * 15
        return max(0, min(self.total_slots - 1, due_minutes // self.slot_duration_minutes - 1))

    def blocked_slots(self, station_id: str) -> set[int]:
        """Slots the heat rule removes for a station: screening breaches plus the rest buffer."""
        blocked = {
            t for t in range(self.total_slots)
            if self.thermal_matrix.get((station_id, t), {}).get("is_breach")
        }
        for buf in self._identify_heat_buffers():
            if buf.station_id == station_id:
                blocked.update(range(buf.start_slot, buf.end_slot))
        return blocked

    def _precompute_thermal_matrix(self):
        """Station screening WBGT and ISO 7243 reference value for every (station_id, slot)."""
        for station_id, roster in self.rosters.items():
            limit_c, _eff_class, _ = get_iso_limit(
                work_class=roster.work_class, acclimatised=roster.acclimatised
            )
            for t in range(self.total_slots):
                w_idx = min(len(self.weather) - 1, int(t * self.slot_duration_minutes / 15)) if self.weather else 0
                w = self.weather.get(w_idx) or self.weather.get(t)

                if w:
                    ambient_globe = w.ambient_globe_temp_c
                    tw = w.natural_wet_bulb_c
                    ta = w.air_temp_c
                else:
                    h = self._get_slot_time_info(t)["hour"]
                    is_solar = 10 <= h < 16
                    ta = 38.0 if is_solar else 26.0
                    tw = 25.5 if is_solar else 20.0
                    ambient_globe = ta + (2.0 if is_solar else 0.5)

                globe_t, is_sim = get_station_globe_temp(
                    ambient_globe_c=ambient_globe,
                    simulated_uplift_c=roster.simulated_globe_uplift_c,
                )
                wbgt_eff = calculate_effective_wbgt(
                    wet_bulb_c=tw,
                    globe_temp_c=globe_t,
                    air_temp_c=ta,
                    clothing_adj_c=roster.clothing_adj_c,
                    is_outdoors_in_sun=False,
                )
                margin = round(limit_c - wbgt_eff, 2)
                self.thermal_matrix[(station_id, t)] = {
                    "station_wbgt_c": wbgt_eff,
                    "iso_limit_c": limit_c,
                    "thermal_margin_c": margin,
                    "is_breach": margin < 0.0,
                    "is_near_ceiling": 0.0 <= margin <= 2.0,
                    "is_simulated_estimate": is_sim,
                }

    def _identify_heat_buffers(self) -> list[HeatBuffer]:
        """60-minute rest buffers from 13:00 each day on stations with work class 2 or higher."""
        heat_buffers = []
        total_days = max(1, math.ceil(self.horizon_hours / 24))
        buf_slots = max(1, math.ceil(60 / self.slot_duration_minutes))

        for station_id, roster in sorted(self.rosters.items()):
            if roster.work_class < 2:
                continue
            for day in range(1, total_days + 1):
                b_start = int(((day - 1) * 24 + 13) * 60 / self.slot_duration_minutes)
                if b_start >= self.total_slots:
                    continue
                b_end = min(self.total_slots, b_start + buf_slots)
                peak_wbgt = max(
                    self.thermal_matrix.get((station_id, s), {}).get("station_wbgt_c", 25.0)
                    for s in range(b_start, b_end)
                )
                buf_mins = (b_end - b_start) * self.slot_duration_minutes
                buf_type = "60_MIN" if buf_mins >= 50 else ("45_MIN" if buf_mins >= 40 else "30_MIN")
                heat_buffers.append(
                    HeatBuffer(
                        buffer_id=f"BUF_{station_id}_D{day}_{b_start}",
                        station_id=station_id,
                        day=day,
                        start_slot=b_start,
                        end_slot=b_end,
                        duration_minutes=buf_mins,
                        buffer_type=buf_type,
                        peak_ambient_wbgt_c=peak_wbgt,
                        remaining_capacity_minutes=buf_mins,
                    )
                )
        return heat_buffers

    def solve(
        self,
        enforce_heat_safety: bool = True,
        enforce_tariff_optimization: bool = True,
        frozen_window: tuple[int, int] | None = None,
        previous_assignments: dict[tuple[str, int], int] | None = None,
        faulted_machine_id: str | None = None,
        fault_slot: int | None = None,
        repair_duration_slots: int | None = None,
        max_restarts: int | None = None,
    ) -> SchedulePlanResponse:
        started = time.perf_counter()
        T = self.total_slots
        optimize_cost = enforce_heat_safety or enforce_tariff_optimization
        model = cp_model.CpModel()

        heat_buffers = self._identify_heat_buffers() if enforce_heat_safety else []
        buffer_slots: dict[str, set[int]] = {}
        for buf in heat_buffers:
            buffer_slots.setdefault(buf.station_id, set()).update(range(buf.start_slot, buf.end_slot))

        repair_slots: set[int] = set()
        if faulted_machine_id and fault_slot is not None and repair_duration_slots:
            repair_slots = set(range(fault_slot, min(T, fault_slot + repair_duration_slots)))

        prev_active: dict[str, set[int]] = {}
        for (jid, t), val in (previous_assignments or {}).items():
            if val:
                prev_active.setdefault(jid, set()).add(t)
        f_start, f_end = frozen_window if frozen_window else (None, None)
        replanning = f_start is not None

        prefix_rate = [0.0]
        for r in self.slot_rates:
            prefix_rate.append(prefix_rate[-1] + r)

        machine_intervals: dict[str, list] = {}
        job_vars: dict[str, dict[str, Any]] = {}
        objective_terms = []
        restart_terms = []
        unscheduled_terms = []

        for job in self.orders:
            jid = _job_key(job)
            d = self._duration_slots(job)
            on_faulted = bool(faulted_machine_id) and job.machine_id == faulted_machine_id

            due = self._due_slot(job)
            blocked: set[int] = set(range(due + 1, T))
            if enforce_heat_safety:
                blocked.update(
                    t for t in range(T)
                    if self.thermal_matrix.get((job.station_id, t), {}).get("is_breach")
                )
                blocked.update(buffer_slots.get(job.station_id, set()))
            if on_faulted:
                blocked.update(repair_slots)

            presence = model.NewBoolVar(f"present_{jid}")
            info: dict[str, Any] = {"job": job, "d": d, "presence": presence}

            if not job.splittable:
                prev = prev_active.get(jid)
                prev_start = min(prev) if prev else None
                locked_start = None
                if replanning and prev_start is not None:
                    if not on_faulted and prev_start <= f_end:
                        locked_start = prev_start
                    elif on_faulted and prev_start + d <= f_start:
                        locked_start = prev_start

                if locked_start is not None:
                    domain = [locked_start]
                else:
                    lower = 0
                    if replanning:
                        lower = f_start if on_faulted else f_end + 1
                    domain = [
                        s for s in range(lower, T - d + 1)
                        if not any(t in blocked for t in range(s, s + d))
                    ]

                if not domain:
                    model.Add(presence == 0)
                    domain = [0] if T - d >= 0 else []
                if not domain:
                    unscheduled_terms.append(d)
                    job_vars[jid] = {**info, "fixed_absent": True}
                    continue

                s_var = model.NewIntVarFromDomain(cp_model.Domain.FromValues(domain), f"start_{jid}")
                interval = model.NewOptionalFixedSizeIntervalVar(s_var, d, presence, f"iv_{jid}")
                machine_intervals.setdefault(job.machine_id, []).append(interval)
                info.update({"start": s_var, "splittable": False})

                if optimize_cost:
                    kwh_slot = job.kwh_per_op / d
                    max_start = T - d
                    # "+ s" is a sub-rupee tie-break: equal-cost starts resolve to the earliest one.
                    cost_by_start = [
                        int(round(kwh_slot * (prefix_rate[s + d] - prefix_rate[s]) * 100)) + s
                        for s in range(max_start + 1)
                    ]
                    c = model.NewIntVar(0, max(cost_by_start) if cost_by_start else 0, f"cost_{jid}")
                    model.AddElement(s_var, cost_by_start, c)
                    c_eff = model.NewIntVar(0, max(cost_by_start) if cost_by_start else 0, f"ceff_{jid}")
                    model.Add(c_eff == c).OnlyEnforceIf(presence)
                    model.Add(c_eff == 0).OnlyEnforceIf(presence.Not())
                    objective_terms.append(c_eff)
                else:
                    s_eff = model.NewIntVar(0, T, f"seff_{jid}")
                    model.Add(s_eff == s_var).OnlyEnforceIf(presence)
                    model.Add(s_eff == 0).OnlyEnforceIf(presence.Not())
                    objective_terms.append(s_eff)
            else:
                prev = prev_active.get(jid, set())
                x: dict[int, Any] = {}
                for t in range(T):
                    locked_val = None
                    if replanning:
                        if t < f_start:
                            locked_val = 1 if t in prev else 0
                        elif t <= f_end and not on_faulted:
                            locked_val = 1 if t in prev else 0
                    if locked_val == 0:
                        continue
                    if locked_val is None and t in blocked:
                        continue
                    xv = model.NewBoolVar(f"x_{jid}_{t}")
                    if locked_val == 1:
                        model.Add(xv == 1)
                    x[t] = xv
                    machine_intervals.setdefault(job.machine_id, []).append(
                        model.NewOptionalFixedSizeIntervalVar(t, 1, xv, f"ivx_{jid}_{t}")
                    )

                if len(x) < d:
                    model.Add(presence == 0)
                model.Add(sum(x.values()) == d * presence)
                for xv in x.values():
                    model.AddImplication(xv, presence)

                # A segment start is a slot that runs when the previous available slot does not.
                # A restart is a segment start after the job has already run once. The first start is free.
                starts: dict[int, Any] = {}
                for t, xv in x.items():
                    st = model.NewBoolVar(f"seg_{jid}_{t}")
                    if t - 1 in x:
                        model.Add(st >= xv - x[t - 1])
                        model.Add(st <= xv)
                        model.Add(st <= 1 - x[t - 1])
                    else:
                        model.Add(st == xv)
                    starts[t] = st
                restarts: dict[int, Any] = {}
                earlier: list[Any] = []
                for t in sorted(starts):
                    if earlier:
                        ran_before = model.NewBoolVar(f"ran_{jid}_{t}")
                        model.AddMaxEquality(ran_before, earlier)
                        r = model.NewBoolVar(f"rst_{jid}_{t}")
                        model.Add(r >= starts[t] + ran_before - 1)
                        model.Add(r <= starts[t])
                        model.Add(r <= ran_before)
                        restarts[t] = r
                        restart_terms.append(r)
                    earlier.append(x[t])
                info.update({"x": x, "restarts": restarts, "splittable": True})

                kwh_slot = job.kwh_per_op / d
                for t, xv in x.items():
                    if optimize_cost:
                        objective_terms.append((int(round(kwh_slot * self.slot_rates[t] * 100)) + t) * xv)
                    else:
                        objective_terms.append(t * xv)
                if optimize_cost:
                    for t, r in restarts.items():
                        objective_terms.append(
                            (int(round(job.restart_kwh * self.slot_rates[t] * 100)) + RESTART_WEAR_COST_PAISE) * r
                        )

            unscheduled_terms.append(d * (1 - presence))
            job_vars[jid] = info

        for intervals in machine_intervals.values():
            if len(intervals) > 1:
                model.AddNoOverlap(intervals)

        orders_by_id: dict[str, list[PlantOrder]] = {}
        for job in self.orders:
            orders_by_id.setdefault(job.order_id, []).append(job)
        for seq_list in orders_by_id.values():
            sorted_seq = sorted(seq_list, key=lambda o: o.routing_seq)
            for prev_job, next_job in zip(sorted_seq, sorted_seq[1:]):
                pv = job_vars.get(_job_key(prev_job), {})
                nv = job_vars.get(_job_key(next_job), {})
                if "start" in pv and "start" in nv:
                    model.Add(nv["start"] >= pv["start"] + pv["d"]).OnlyEnforceIf(
                        [pv["presence"], nv["presence"]]
                    )
                    model.AddImplication(nv["presence"], pv["presence"])

        if max_restarts is not None and restart_terms:
            model.Add(sum(restart_terms) <= max_restarts)

        model.Minimize(sum(objective_terms) + UNSCHEDULED_PENALTY_PER_SLOT * sum(unscheduled_terms))

        solver = cp_model.CpSolver()
        solver.parameters.random_seed = SOLVER_SEED
        solver.parameters.num_workers = 1
        solver.parameters.max_deterministic_time = DETERMINISTIC_TIME_LIMIT
        solver.parameters.max_time_in_seconds = WALL_CLOCK_GUARD_SEC
        status = solver.Solve(model)
        solved = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        status_str = {
            cp_model.OPTIMAL: "OPTIMAL",
            cp_model.FEASIBLE: "FEASIBLE",
            cp_model.INFEASIBLE: "INFEASIBLE",
        }.get(status, "UNKNOWN")

        schedule_slots: list[ScheduleSlotAssignment] = []
        total_active_kwh = 0.0
        total_restart_kwh = 0.0
        total_cost_inr = 0.0
        total_restarts = 0
        total_heat_breaches = 0
        scheduled_slot_count = 0
        scheduled_jobs = 0
        required_slot_count = sum(self._duration_slots(j) for j in self.orders)

        for job in self.orders:
            jid = _job_key(job)
            info = job_vars.get(jid, {})
            if not solved or info.get("fixed_absent") or not solver.Value(info["presence"]):
                continue
            d = info["d"]
            if info["splittable"]:
                active = [t for t, xv in info["x"].items() if solver.Value(xv)]
                restart_at = {t for t, r in info["restarts"].items() if solver.Value(r)}
            else:
                s = solver.Value(info["start"])
                active = list(range(s, s + d))
                restart_at = set()
            scheduled_jobs += 1
            kwh_slot = job.kwh_per_op / d

            for t in active:
                scheduled_slot_count += 1
                ti = self._get_slot_time_info(t)
                rate = self.slot_rates[t]
                is_rst = t in restart_at
                rst_kwh = job.restart_kwh if is_rst else 0.0
                slot_kwh = kwh_slot + rst_kwh
                cost = round(slot_kwh * rate, 2)
                total_active_kwh += kwh_slot
                total_restart_kwh += rst_kwh
                total_cost_inr += cost
                if is_rst:
                    total_restarts += 1

                thm = self.thermal_matrix.get((job.station_id, t), {
                    "station_wbgt_c": 25.0,
                    "iso_limit_c": 28.0,
                    "thermal_margin_c": 3.0,
                    "is_breach": False,
                })
                if thm["is_breach"]:
                    total_heat_breaches += 1

                schedule_slots.append(
                    ScheduleSlotAssignment(
                        slot_index=t,
                        timestamp_ist=f"Day {ti['day']} {ti['hour']:02d}:{ti['minute']:02d} IST",
                        order_id=job.order_id,
                        job_name=job.job_name,
                        machine_id=job.machine_id,
                        station_id=job.station_id,
                        is_active=True,
                        is_restart=is_rst,
                        active_kwh=round(slot_kwh, 3),
                        tod_rate_inr=rate,
                        cost_inr=cost,
                        station_wbgt_c=thm["station_wbgt_c"],
                        iso_limit_c=thm["iso_limit_c"],
                        thermal_margin_c=thm["thermal_margin_c"],
                        is_heat_buffer=False,
                    )
                )

        schedule_slots.sort(key=lambda s: (s.slot_index, s.machine_id, s.order_id))

        for buf in heat_buffers:
            roster = self.rosters.get(buf.station_id)
            limit_c = get_iso_limit(roster.work_class, roster.acclimatised)[0] if roster else 26.0
            for t in range(buf.start_slot, buf.end_slot):
                ti = self._get_slot_time_info(t)
                schedule_slots.append(
                    ScheduleSlotAssignment(
                        slot_index=t,
                        timestamp_ist=f"Day {ti['day']} {ti['hour']:02d}:{ti['minute']:02d} IST",
                        order_id="HEAT_BUFFER",
                        job_name="Heat rest buffer",
                        machine_id="NONE",
                        station_id=buf.station_id,
                        is_active=False,
                        is_restart=False,
                        active_kwh=0.0,
                        tod_rate_inr=self.slot_rates[t],
                        cost_inr=0.0,
                        station_wbgt_c=buf.peak_ambient_wbgt_c,
                        iso_limit_c=limit_c,
                        thermal_margin_c=round(limit_c - buf.peak_ambient_wbgt_c, 2),
                        is_heat_buffer=True,
                    )
                )

        output_pct = round((scheduled_slot_count / max(1, required_slot_count)) * 100, 1)
        plan_hash = compute_plan_hash(schedule_slots)

        kpi = KPISummary(
            total_cost_inr=round(total_cost_inr, 2),
            total_kwh=round(total_active_kwh + total_restart_kwh, 2),
            total_restart_kwh=round(total_restart_kwh, 2),
            total_restarts=total_restarts,
            heat_breaches_count=total_heat_breaches,
            output_percentage=min(100.0, output_pct),
            co2_saved_tco2=0.0,
            scheduled_jobs=scheduled_jobs,
            total_jobs=len(self.orders),
        )

        return SchedulePlanResponse(
            plan_id=f"PLAN_{plan_hash[:10].upper()}",
            plan_hash=plan_hash,
            solver_seed=SOLVER_SEED,
            restart_cap=max_restarts,
            trigger_type="MORNING_PLAN",
            solver_status=status_str,
            solve_time_sec=round(time.perf_counter() - started, 2),
            kpi=kpi,
            schedule_slots=schedule_slots,
            heat_buffers=heat_buffers,
            gemini_explanation_text="",
            citations=[],
        )


def solve_dual_schedules(
    orders: list[PlantOrder],
    rosters: list[WorkstationRoster],
    weather_slots: list[WeatherSlot],
    horizon_hours: int = 48,
    slot_duration_minutes: int = 15,
    frozen_window: tuple[int, int] | None = None,
    previous_assignments: dict[tuple[str, int], int] | None = None,
    faulted_machine_id: str | None = None,
    fault_slot: int | None = None,
    repair_duration_slots: int | None = None,
) -> tuple[SchedulePlanResponse, SchedulePlanResponse]:
    """
    Baseline: output first, earliest start, no heat rules.
    Optimized: heat safe, tariff aware, restarts capped at baseline + 2. The cap is
    relaxed only if keeping it would drop work, and the response says so.
    """
    scheduler = TeevraCPSATScheduler(
        orders=orders,
        rosters=rosters,
        weather_slots=weather_slots,
        horizon_hours=horizon_hours,
        slot_duration_minutes=slot_duration_minutes,
    )
    breakdown_kwargs = {
        "faulted_machine_id": faulted_machine_id,
        "fault_slot": fault_slot,
        "repair_duration_slots": repair_duration_slots,
    }

    baseline = scheduler.solve(
        enforce_heat_safety=False, enforce_tariff_optimization=False, **breakdown_kwargs
    )

    restart_cap = baseline.kpi.total_restarts + RESTART_CAP_ABOVE_BASELINE
    optimized = scheduler.solve(
        enforce_heat_safety=True,
        enforce_tariff_optimization=True,
        frozen_window=frozen_window,
        previous_assignments=previous_assignments,
        max_restarts=restart_cap,
        **breakdown_kwargs,
    )
    if optimized.kpi.output_percentage < 100.0:
        uncapped = scheduler.solve(
            enforce_heat_safety=True,
            enforce_tariff_optimization=True,
            frozen_window=frozen_window,
            previous_assignments=previous_assignments,
            max_restarts=None,
            **breakdown_kwargs,
        )
        if uncapped.kpi.output_percentage > optimized.kpi.output_percentage:
            uncapped.restart_cap = restart_cap
            uncapped.restart_cap_relaxed = True
            optimized = uncapped

    carbon = compute_honest_carbon_and_savings(
        baseline_kwh=baseline.kpi.total_kwh,
        optimized_kwh=optimized.kpi.total_kwh,
        baseline_cost_inr=baseline.kpi.total_cost_inr,
        optimized_cost_inr=optimized.kpi.total_cost_inr,
    )

    optimized.baseline_kpi = baseline.kpi
    optimized.baseline_plan_hash = baseline.plan_hash
    optimized.kpi.cost_savings_inr = carbon["cost_savings_inr"]
    optimized.kpi.co2_saved_tco2 = carbon["co2_saved_tco2"]
    optimized.kpi.energy_delta_kwh = carbon["energy_delta_kwh"]
    optimized.kpi.co2_delta_tco2 = carbon["co2_delta_tco2"]
    optimized.kpi.honest_co2_banner = carbon["honest_co2_banner"]
    optimized.solve_time_sec = round(baseline.solve_time_sec + optimized.solve_time_sec, 2)
    optimized.cea_factor_tco2_per_mwh = round(CEA_GRID_EMISSION_FACTOR_TCO2_PER_KWH * 1000, 3)
    optimized.weather_source = weather_slots[0].source if weather_slots else "NONE"

    build_plan_views(scheduler, baseline, optimized)
    optimized.summary = build_summary(optimized)

    return baseline, optimized
