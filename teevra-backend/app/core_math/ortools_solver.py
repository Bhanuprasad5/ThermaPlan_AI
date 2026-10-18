"""
Production-Grade Google OR-Tools CP-SAT Solver for TEEVRA.
Supports configurable planning horizons (e.g. 24h, 48h, 72h) and customizable
slot resolutions:
- 15 minutes (default: 192 slots for 48h)
- 30 minutes (96 slots for 48h)
- 1 hour / 60 minutes (48 slots for 48h)
- 1.5 hours / 90 minutes (32 slots for 48h)
- 2 hours / 120 minutes (24 slots for 48h)
- 2.5 hours / 150 minutes (19 slots for 48h)
- 3 hours / 180 minutes (16 slots for 48h)

Implements:
- Zero Worker Heat Breaches (Hard Constraint 1)
- Machine No-Overlap & Sequential Routing Precedence (Hard Constraint 2)
- Pre-allocated 30-60m Heat Buffers in Peak Thermal Windows (Hard Constraint 3)
- 2-Hour Frozen Window Lockout during Breakdowns
- >= 98% Output Guarantee for Interruptible Loads
- Dual Output: Baseline Output-Only Plan vs Heat-Safe & Carbon-Aware Optimized Plan
"""
import math
import time
from typing import Any

from ortools.sat.python import cp_model

from app.core_math.carbon_tariff_calc import (
    calculate_slot_energy_and_cost,
    compute_honest_carbon_and_savings,
    get_tgspdcl_tod_rate,
)
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
        self.orders = unique_orders
        self.rosters = {r.station_id: r for r in rosters}
        self.weather = {w.slot_index: w for w in weather_slots}
        self.horizon_hours = horizon_hours
        self.slot_duration_minutes = slot_duration_minutes
        self.total_slots = max(1, (horizon_hours * 60) // slot_duration_minutes)
        self.thermal_matrix: dict[tuple[str, int], dict[str, Any]] = {}
        self._precompute_thermal_matrix()

    def _get_slot_time_info(self, t: int) -> dict[str, int]:
        total_mins = t * self.slot_duration_minutes
        h = (total_mins // 60) % 24
        m = total_mins % 60
        day = (total_mins // (24 * 60)) + 1
        return {"hour": h, "minute": m, "day": day, "total_mins": total_mins}

    def _precompute_thermal_matrix(self):
        """Precomputes station-specific WBGT and ISO limit for all (station_id, slot_index)."""
        for station_id, roster in self.rosters.items():
            limit_c, eff_class, _ = get_iso_limit(
                work_class=roster.work_class, acclimatised=roster.acclimatised
            )
            for t in range(self.total_slots):
                # Map slot t to standard 15-minute weather slot index
                w_idx = min(len(self.weather) - 1, int(t * self.slot_duration_minutes / 15)) if self.weather else 0
                w = self.weather.get(w_idx) or self.weather.get(t)

                if w:
                    ambient_globe = w.ambient_globe_temp_c
                    tw = w.natural_wet_bulb_c
                    ta = w.air_temp_c
                else:
                    time_info = self._get_slot_time_info(t)
                    h = time_info["hour"]
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
        """
        Hard Constraint 3: Identifies stations needing 30-60m heat buffers during
        peak thermal afternoon windows (13:00 to 14:00 daily).
        """
        heat_buffers = []
        total_days = max(1, math.ceil(self.horizon_hours / 24))
        buf_slots = max(1, math.ceil(60 / self.slot_duration_minutes))

        for station_id, roster in self.rosters.items():
            if roster.work_class >= 2:  # High heat sensitivity stations
                for day in range(1, total_days + 1):
                    # Start at 13:00 on Day 'day'
                    b_start = int(((day - 1) * 24 + 13) * 60 / self.slot_duration_minutes)
                    b_end = min(self.total_slots, b_start + buf_slots)
                    if b_start >= self.total_slots:
                        continue

                    peak_wbgt = max(
                        self.thermal_matrix.get((station_id, s), {}).get("station_wbgt_c", 25.0)
                        for s in range(b_start, b_end)
                    ) if b_end > b_start else 25.0

                    buf_mins = (b_end - b_start) * self.slot_duration_minutes
                    buf_type = "60_MIN" if buf_mins >= 50 else ("45_MIN" if buf_mins >= 40 else "30_MIN")

                    buf = HeatBuffer(
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
                    heat_buffers.append(buf)
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
    ) -> SchedulePlanResponse:
        start_time = time.time()
        model = cp_model.CpModel()

        x_vars = {}
        start_vars = {}
        end_vars = {}
        interval_vars = {}
        restart_vars = {}

        heat_buffers = self._identify_heat_buffers() if enforce_heat_safety else []

        # 1. Setup Job Variables scaled to slot_duration_minutes
        for idx, job in enumerate(self.orders):
            j_id = f"{job.order_id}_{job.routing_seq}"
            d_slots = max(1, math.ceil(job.duration_mins / self.slot_duration_minutes))

            if not job.splittable:
                s_var = model.NewIntVar(0, max(0, self.total_slots - d_slots), f"start_{j_id}")
                e_var = model.NewIntVar(d_slots, self.total_slots, f"end_{j_id}")
                i_var = model.NewIntervalVar(s_var, d_slots, e_var, f"interval_{j_id}")

                start_vars[j_id] = s_var
                end_vars[j_id] = e_var
                interval_vars[j_id] = i_var

                for t in range(self.total_slots):
                    x = model.NewBoolVar(f"x_{j_id}_{t}")
                    x_vars[(j_id, t)] = x
                    b_after_start = model.NewBoolVar(f"after_s_{j_id}_{t}")
                    b_before_end = model.NewBoolVar(f"before_e_{j_id}_{t}")
                    model.Add(t >= s_var).OnlyEnforceIf(b_after_start)
                    model.Add(t < s_var).OnlyEnforceIf(b_after_start.Not())
                    model.Add(t < e_var).OnlyEnforceIf(b_before_end)
                    model.Add(t >= e_var).OnlyEnforceIf(b_before_end.Not())
                    model.AddBoolAnd([b_after_start, b_before_end]).OnlyEnforceIf(x)
                    model.AddBoolOr([b_after_start.Not(), b_before_end.Not()]).OnlyEnforceIf(x.Not())
            else:
                min_req = max(1, math.ceil(0.98 * d_slots))
                slot_vars = []
                for t in range(self.total_slots):
                    x = model.NewBoolVar(f"x_{j_id}_{t}")
                    x_vars[(j_id, t)] = x
                    slot_vars.append(x)
                model.Add(sum(slot_vars) >= min_req)

                for t in range(1, self.total_slots):
                    r = model.NewBoolVar(f"restart_{j_id}_{t}")
                    restart_vars[(j_id, t)] = r
                    model.Add(r >= x_vars[(j_id, t)] - x_vars[(j_id, t - 1)])

        # 2. Hard Constraint 1: Zero Worker Heat Breaches
        if enforce_heat_safety:
            for job in self.orders:
                j_id = f"{job.order_id}_{job.routing_seq}"
                station_id = job.station_id
                for t in range(self.total_slots):
                    thm = self.thermal_matrix.get((station_id, t))
                    if thm and thm["is_breach"]:
                        model.Add(x_vars[(j_id, t)] == 0)

        # 3. Hard Constraint 2: Machine No-Overlap & Routing Precedence
        machine_jobs: dict[str, list[str]] = {}
        for job in self.orders:
            j_id = f"{job.order_id}_{job.routing_seq}"
            machine_jobs.setdefault(job.machine_id, []).append(j_id)

        for m_id, j_ids in machine_jobs.items():
            for t in range(self.total_slots):
                model.Add(sum(x_vars[(jid, t)] for jid in j_ids) <= 1)

        orders_by_id: dict[str, list[PlantOrder]] = {}
        for job in self.orders:
            orders_by_id.setdefault(job.order_id, []).append(job)

        for o_id, seq_list in orders_by_id.items():
            sorted_seq = sorted(seq_list, key=lambda o: o.routing_seq)
            for i in range(len(sorted_seq) - 1):
                prev_j = f"{sorted_seq[i].order_id}_{sorted_seq[i].routing_seq}"
                next_j = f"{sorted_seq[i+1].order_id}_{sorted_seq[i+1].routing_seq}"
                if prev_j in end_vars and next_j in start_vars:
                    model.Add(start_vars[next_j] >= end_vars[prev_j])

        # 4. Hard Constraint 3: Pre-allocated Heat Buffers
        if enforce_heat_safety:
            for buf in heat_buffers:
                for job in self.orders:
                    if job.station_id == buf.station_id:
                        j_id = f"{job.order_id}_{job.routing_seq}"
                        for t in range(buf.start_slot, buf.end_slot):
                            if (j_id, t) in x_vars:
                                model.Add(x_vars[(j_id, t)] == 0)

        # 5. Breakdown & Frozen Window Lockout
        if frozen_window and previous_assignments:
            f_start, f_end = frozen_window
            for (jid, t), prev_val in previous_assignments.items():
                if (jid, t) in x_vars:
                    # 5a. Lock completed past operations before fault slot
                    if t < f_start:
                        model.Add(x_vars[(jid, t)] == prev_val)
                    # 5b. Lock healthy lines during 2-hour frozen window [f_start, f_end]
                    elif f_start <= t <= f_end:
                        job_obj = next((j for j in self.orders if f"{j.order_id}_{j.routing_seq}" == jid), None)
                        if not (job_obj and job_obj.machine_id == faulted_machine_id):
                            model.Add(x_vars[(jid, t)] == prev_val)

        if faulted_machine_id and fault_slot is not None and repair_duration_slots is not None:
            repair_end = min(self.total_slots, fault_slot + repair_duration_slots)
            for job in self.orders:
                if job.machine_id == faulted_machine_id:
                    j_id = f"{job.order_id}_{job.routing_seq}"
                    for t in range(fault_slot, repair_end):
                        if (j_id, t) in x_vars:
                            model.Add(x_vars[(j_id, t)] == 0)

        # 6. Objective Function
        if not enforce_heat_safety and not enforce_tariff_optimization:
            obj_terms = [t * x for (j_id, t), x in x_vars.items()]
            model.Minimize(sum(obj_terms))
        else:
            cost_terms = []
            for job in self.orders:
                j_id = f"{job.order_id}_{job.routing_seq}"
                d_slots = max(1, math.ceil(job.duration_mins / self.slot_duration_minutes))
                kwh_slot = job.kwh_per_op / d_slots
                for t in range(self.total_slots):
                    time_info = self._get_slot_time_info(t)
                    rate = get_tgspdcl_tod_rate(time_info["hour"])["rate_inr"]
                    unit_cost = int(round(kwh_slot * rate * 100))
                    cost_terms.append(unit_cost * x_vars[(j_id, t)])

            for (j_id, t), r in restart_vars.items():
                job = next(j for j in self.orders if f"{j.order_id}_{j.routing_seq}" == j_id)
                time_info = self._get_slot_time_info(t)
                rate = get_tgspdcl_tod_rate(time_info["hour"])["rate_inr"]
                rst_cost = int(round(job.restart_kwh * rate * 100))
                cost_terms.append(rst_cost * r)

            model.Minimize(sum(cost_terms))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        solver.parameters.random_seed = 42
        solver.parameters.num_search_workers = 1
        status = solver.Solve(model)
        solve_duration = round(time.time() - start_time, 2)
        status_str = "OPTIMAL" if status == cp_model.OPTIMAL else ("FEASIBLE" if status == cp_model.FEASIBLE else "INFEASIBLE")

        schedule_slots: list[ScheduleSlotAssignment] = []
        total_active_kwh = 0.0
        total_restart_kwh = 0.0
        total_cost_inr = 0.0
        total_restarts = 0
        total_heat_breaches = 0
        scheduled_slot_count = 0
        required_slot_count = sum(max(1, math.ceil(j.duration_mins / self.slot_duration_minutes)) for j in self.orders)

        for t in range(self.total_slots):
            time_info = self._get_slot_time_info(t)
            h = time_info["hour"]
            m = time_info["minute"]
            day = time_info["day"]
            ts_str = f"Day {day} {h:02d}:{m:02d} IST"

            for job in self.orders:
                j_id = f"{job.order_id}_{job.routing_seq}"
                is_active = (solver.Value(x_vars[(j_id, t)]) == 1) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else False
                is_rst = (solver.Value(restart_vars[(j_id, t)]) == 1) if (j_id, t) in restart_vars and status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else False

                if is_active:
                    scheduled_slot_count += 1
                    d_slots = max(1, math.ceil(job.duration_mins / self.slot_duration_minutes))
                    e_calc = calculate_slot_energy_and_cost(
                        kwh_per_op=job.kwh_per_op,
                        duration_slots=d_slots,
                        is_active=True,
                        is_restart=is_rst,
                        restart_kwh=job.restart_kwh,
                        slot_index=t,
                    )
                    # Override rate with current slot's hour rate
                    actual_rate = get_tgspdcl_tod_rate(h)["rate_inr"]
                    e_calc["tod_rate_inr"] = actual_rate
                    e_calc["cost_inr"] = round(e_calc["total_kwh"] * actual_rate, 2)

                    total_active_kwh += e_calc["slot_kwh"]
                    total_restart_kwh += e_calc["restart_kwh"]
                    total_cost_inr += e_calc["cost_inr"]
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
                            timestamp_ist=ts_str,
                            order_id=job.order_id,
                            job_name=job.job_name,
                            machine_id=job.machine_id,
                            station_id=job.station_id,
                            is_active=True,
                            is_restart=is_rst,
                            active_kwh=e_calc["total_kwh"],
                            tod_rate_inr=e_calc["tod_rate_inr"],
                            cost_inr=e_calc["cost_inr"],
                            station_wbgt_c=thm["station_wbgt_c"],
                            iso_limit_c=thm["iso_limit_c"],
                            thermal_margin_c=thm["thermal_margin_c"],
                            is_heat_buffer=False,
                        )
                    )

        for buf in heat_buffers:
            for t in range(buf.start_slot, buf.end_slot):
                time_info = self._get_slot_time_info(t)
                h = time_info["hour"]
                m = time_info["minute"]
                day = time_info["day"]
                rate = get_tgspdcl_tod_rate(h)["rate_inr"]
                schedule_slots.append(
                    ScheduleSlotAssignment(
                        slot_index=t,
                        timestamp_ist=f"Day {day} {h:02d}:{m:02d} IST",
                        order_id="HEAT_BUFFER",
                        job_name="Thermal Rest & Recovery Buffer",
                        machine_id="NONE",
                        station_id=buf.station_id,
                        is_active=False,
                        is_restart=False,
                        active_kwh=0.0,
                        tod_rate_inr=rate,
                        cost_inr=0.0,
                        station_wbgt_c=buf.peak_ambient_wbgt_c,
                        iso_limit_c=26.0,
                        thermal_margin_c=0.0,
                        is_heat_buffer=True,
                    )
                )

        output_pct = round((scheduled_slot_count / max(1, required_slot_count)) * 100, 1)

        kpi = KPISummary(
            total_cost_inr=round(total_cost_inr, 2),
            total_kwh=round(total_active_kwh + total_restart_kwh, 2),
            total_restart_kwh=round(total_restart_kwh, 2),
            total_restarts=total_restarts,
            heat_breaches_count=total_heat_breaches,
            output_percentage=min(100.0, output_pct),
            co2_saved_tco2=0.0,
            honest_co2_banner="Time-shifting saves rupees, not CO2, at an annual average grid factor.",
        )

        return SchedulePlanResponse(
            plan_id=f"PLAN_{int(time.time())}",
            trigger_type="MORNING_PLAN",
            solver_status=status_str,
            solve_time_sec=solve_duration,
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
    scheduler = TeevraCPSATScheduler(
        orders=orders,
        rosters=rosters,
        weather_slots=weather_slots,
        horizon_hours=horizon_hours,
        slot_duration_minutes=slot_duration_minutes,
    )

    baseline = scheduler.solve(
        enforce_heat_safety=False, enforce_tariff_optimization=False
    )

    optimized = scheduler.solve(
        enforce_heat_safety=True,
        enforce_tariff_optimization=True,
        frozen_window=frozen_window,
        previous_assignments=previous_assignments,
        faulted_machine_id=faulted_machine_id,
        fault_slot=fault_slot,
        repair_duration_slots=repair_duration_slots,
    )

    carbon_analysis = compute_honest_carbon_and_savings(
        baseline_kwh=baseline.kpi.total_kwh,
        optimized_kwh=optimized.kpi.total_kwh,
        baseline_cost_inr=baseline.kpi.total_cost_inr,
        optimized_cost_inr=optimized.kpi.total_cost_inr,
    )

    optimized.baseline_kpi = baseline.kpi
    optimized.kpi.cost_savings_inr = carbon_analysis["cost_savings_inr"]
    optimized.kpi.co2_saved_tco2 = carbon_analysis["co2_saved_tco2"]
    optimized.kpi.honest_co2_banner = carbon_analysis["honest_co2_banner"]

    return baseline, optimized
