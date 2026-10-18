"""Write the five Telangana day order books and ~288-person rosters.

Local files only. Does not call gcloud, firebase, BigQuery, or Firestore.
"""

from __future__ import annotations

import csv
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "data"
SAMPLE = ROOT.parent / "sample_manager_uploads"

HEADER = (
    "upload_batch_id,order_id,job_name,machine_id,station_id,routing_seq,"
    "duration_mins,duration_slots,kwh_per_op,restart_kwh,load_tag,splittable,"
    "due_slot,is_critical_melt"
).split(",")

ROSTER_HEADER = [
    "worker_id",
    "full_name",
    "bilingual_name",
    "telugu_name",
    "phone_number",
    "assigned_station_id",
    "assigned_machine_id",
    "station_name",
    "shift_schedule",
    "shift_code",
    "role_title",
    "is_furnace_qualified",
    "heat_metabolic_class",
    "acclimatised_status",
    "worker_status",
    "telemetry_consent",
    "rest_minutes_available",
    "safety_clearance_date",
]

FIRST = [
    ("Anand", "అనంద్"),
    ("Bharath", "భరత్"),
    ("Chandu", "చందు"),
    ("Deepak", "దీపక్"),
    ("Eshwar", "ఈశ్వర్"),
    ("Farooq", "ఫరూక్"),
    ("Gopal", "గోపాల్"),
    ("Harish", "హరీష్"),
    ("Imran", "ఇమ్రాన్"),
    ("Jagan", "జగన్"),
    ("Karthik", "కార్తీక్"),
    ("Lakshman", "లక్ష్మణ్"),
    ("Mahesh", "మహేష్"),
    ("Naveen", "నవీన్"),
    ("Omkar", "ఓంకార్"),
    ("Praveen", "ప్రవీణ్"),
    ("Qasim", "ఖాసిం"),
    ("Raju", "రాజు"),
    ("Srinivas", "శ్రీనివాస్"),
    ("Teja", "తేజ"),
    ("Uday", "ఉదయ్"),
    ("Vamshi", "వంశి"),
    ("Yasin", "యాసిన్"),
    ("Zeeshan", "జీషాన్"),
]
LAST = [
    ("Reddy", "రెడ్డి"),
    ("Rao", "రావు"),
    ("Goud", "గౌడ్"),
    ("Chary", "చారి"),
    ("Naidu", "నాయుడు"),
    ("Varma", "వర్మ"),
    ("Kumar", "కుమార్"),
    ("Babu", "బాబు"),
    ("Prasad", "ప్రసాద్"),
    ("Murthy", "మూర్తి"),
    ("Yadav", "యాదవ్"),
    ("Shaik", "షేక్"),
]

MACHINES = [
    ("FURNACE_1", "FURNACE_1", "Furnace 1", 3),
    ("FURNACE_2", "FURNACE_2", "Furnace 2", 3),
    ("FURNACE_3", "FURNACE_3", "Furnace 3", 3),
    ("CHARGE_1", "CHARGING_BAY", "Charge bay", 2),
    ("CNC_1", "CNC_1", "CNC 1", 1),
    ("CNC_2", "CNC_2", "CNC 2", 1),
    ("CNC_3", "CNC_3", "CNC 3", 1),
    ("CNC_4", "CNC_4", "CNC 4", 1),
    ("CNC_5", "CNC_5", "CNC 5", 1),
    ("OVEN_1", "OVEN_1", "Paint oven", 1),
    ("OVEN_2", "OVEN_2", "Powder oven", 1),
    ("QUENCH_1", "HEAT_TREAT_1", "Quench", 2),
    ("ASSEMBLY_1", "ASSEMBLY_1", "Assembly", 1),
    ("QUALITY_1", "QUALITY_INSPECT", "Quality", 1),
    ("CHILLER_1", "CHILLER_1", "Chiller", 0),
    ("COMP_1", "COMP_1", "Compressor", 0),
]

SHIFTS = [
    ("A", "Shift A (08:00 - 16:00)"),
    ("B", "Shift B (16:00 - 00:00)"),
    ("C", "Shift C (00:00 - 08:00)"),
]

DAYS = [
    ("MON", "BATCH_MON", "Day 1 - Monday", "day1_monday_orders.csv", "day1_monday_workers_roster_260.csv", "castings", 1.00),
    ("TUE", "BATCH_TUE", "Day 2 - Tuesday", "day2_tuesday_orders.csv", "day2_tuesday_workers_roster_255.csv", "housings", 0.98),
    ("WED", "BATCH_WED", "Day 3 - Wednesday", "day3_wednesday_orders.csv", "day3_wednesday_workers_roster_265.csv", "gearbox", 1.03),
    ("THU", "BATCH_THU", "Day 4 - Thursday", "day4_thursday_orders.csv", "day4_thursday_workers_roster_258.csv", "pump bodies", 0.98),
    ("FRI", "BATCH_FRI", "Day 5 - Friday", "day5_friday_orders.csv", "day5_friday_workers_roster_270.csv", "valve blocks", 1.02),
]

HEAT_LABEL = {
    0: "Class 0 (Resting)",
    1: "Class 1 (Light)",
    2: "Class 2 (Moderate)",
    3: "Class 3 (Heavy)",
}


def _roles(machine_id: str, heat: int) -> list[str]:
    if heat == 3:
        return ["Supervisor", "Relief Operator", "Senior Smelter", "Ladle Hand", "Charge Hand", "Pourer"]
    if machine_id.startswith("CHARGE"):
        return ["Supervisor", "Relief Operator", "Crane Operator", "Scrap Sorter", "Flux Hand", "Charger"]
    if machine_id.startswith("QUENCH"):
        return ["Supervisor", "Relief Operator", "Quench Operator", "Basket Hand", "Fixture Hand", "Recorder"]
    if machine_id.startswith("CNC"):
        return ["Supervisor", "Relief Operator", "Setter", "Operator", "Operator", "Inspector"]
    if machine_id.startswith("OVEN"):
        return ["Supervisor", "Relief Operator", "Oven Operator", "Loader", "Unloader", "Coater"]
    if machine_id.startswith("ASSEMBLY"):
        return ["Supervisor", "Relief Operator", "Fitter", "Fitter", "Torque Hand", "Packer"]
    if machine_id.startswith("QUALITY"):
        return ["Supervisor", "Relief Operator", "CMM Operator", "Gauge Hand", "Recorder", "Viewer"]
    if machine_id.startswith("CHILLER"):
        return ["Supervisor", "Relief Operator", "Chiller Operator", "Plant Hand", "Logger", "Rounds"]
    return ["Supervisor", "Relief Operator", "Compressor Operator", "Plant Hand", "Logger", "Rounds"]


def _job_rows(token: str, batch: str, theme: str, scale: float) -> list[dict]:
    rows: list[dict] = []
    n = 0

    def add(machine, station, name, hours, kw, tag, critical, due=191, restart=8.0):
        nonlocal n
        n += 1
        kwh = round(kw * hours * scale, 1)
        rows.append(
            {
                "upload_batch_id": batch,
                "order_id": f"{token}-{n:03d}",
                "job_name": name,
                "machine_id": machine,
                "station_id": station,
                "routing_seq": 1,
                "duration_mins": hours * 60,
                "duration_slots": hours * 4,
                "kwh_per_op": kwh,
                "restart_kwh": restart,
                "load_tag": tag,
                "splittable": False,
                "due_slot": due,
                "is_critical_melt": critical,
            }
        )

    # Three jobs on flexible machines: shortest first, so the earliest-start
    # baseline parks the middle (high kW) job on the evening peak. Heat-limited
    # lines are two 10 h melts, which fit the night window outside 10:00-20:00.
    for mid, station, _label, heat in MACHINES:
        if heat >= 2 and mid.startswith("FURNACE"):
            add(mid, station, f"{theme} melt night", 10, 850, "fixed", True, restart=50)
            add(mid, station, f"{theme} melt late", 10, 850, "fixed", True, restart=50)
        elif heat == 2:
            kw = 160
            label = "charge" if mid.startswith("CHARGE") else "quench"
            add(mid, station, f"{theme} {label} night", 10, kw, "shiftable", False)
            add(mid, station, f"{theme} {label} late", 10, kw, "shiftable", False)
        elif heat == 0:
            kind = "ice bank" if mid.startswith("CHILLER") else "compressed air"
            add(mid, station, f"{kind} trim", 8, 40, "interruptible", False)
            add(mid, station, f"{kind} heavy", 10, 780, "interruptible", False, restart=10)
            add(mid, station, f"{kind} hold", 12, 90, "interruptible", False)
        else:
            heavy = 620 if mid.startswith("CNC") else (480 if mid.startswith("OVEN") else 360)
            due = 160 if mid == "QUALITY_1" else 191
            add(mid, station, f"{theme} setup", 8, 40, "shiftable", False, due=due)
            add(mid, station, f"{theme} heavy", 10, heavy, "shiftable", False)
            add(mid, station, f"{theme} follow", 12, 80, "shiftable", False)
    return rows


def _roster_rows(token: str, day_index: int) -> list[dict]:
    rows = []
    seq = 0
    for m_i, (machine, station, label, heat) in enumerate(MACHINES):
        roles = _roles(machine, heat)
        for s_i, (code, schedule) in enumerate(SHIFTS):
            for r_i, role in enumerate(roles):
                ordinal = seq % (len(FIRST) * len(LAST))
                pair = (ordinal + day_index * 17) % (len(FIRST) * len(LAST))
                fi = pair % len(FIRST)
                li = pair // len(FIRST)
                first, first_te = FIRST[fi]
                last, last_te = LAST[li]
                full = f"{first} {last}"
                seq += 1
                wid = f"W_{token}_{seq:03d}"
                phone = f"+91 98{day_index:01d}{seq:03d} {1000 + (seq * 17) % 9000:04d}"
                rows.append(
                    {
                        "worker_id": wid,
                        "full_name": full,
                        "bilingual_name": f"{first} ({first_te})",
                        "telugu_name": f"{first_te} {last_te}",
                        "phone_number": phone,
                        "assigned_station_id": station,
                        "assigned_machine_id": machine,
                        "station_name": label,
                        "shift_schedule": schedule,
                        "shift_code": code,
                        "role_title": role,
                        "is_furnace_qualified": "True" if heat == 3 else "False",
                        "heat_metabolic_class": HEAT_LABEL[heat],
                        "acclimatised_status": "Acclimatised (ISO 7243 Compliant)",
                        "worker_status": "active_on_shift",
                        "telemetry_consent": "voice_and_buttons_consented",
                        "rest_minutes_available": 45 if heat >= 2 else 15,
                        "safety_clearance_date": "2026-10-18",
                    }
                )
    return rows


def _write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=header, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    for i, (token, batch, folder, orders_name, roster_name, theme, scale) in enumerate(DAYS):
        orders = _job_rows(token, batch, theme, scale)
        roster = _roster_rows(token, i)
        names = [r["full_name"] for r in roster]
        assert len(names) == len(set(names)), token
        assert len({r["worker_id"] for r in roster}) == len(roster)
        assert all("Suresh" not in r["full_name"] and "Manager" not in r["full_name"] for r in roster)
        for base in (DATA, SAMPLE):
            _write_csv(base / folder / "Orders" / orders_name, HEADER, orders)
            _write_csv(base / folder / "Worker_Rosters" / roster_name, ROSTER_HEADER, roster)
        print(f"{token}: {len(orders)} orders, {len(roster)} workers")


if __name__ == "__main__":
    main()
