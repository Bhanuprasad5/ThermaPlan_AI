"""Write the five demo order books.

Each day tests one planning question, so the Gantt shows a different decision:
  Mon  furnace melt runs into the hot window; machining moves to solar hours
  Tue  two-step orders (melt, then machining) that must stay in sequence
  Wed  heavy furnace day: four melts squeezed into the cool hours
  Thu  machining with same-day due times that compete for solar hours
  Fri  expedited orders due by noon and by evening

The solver, not this file, produces every plan number.
"""
from pathlib import Path

HEADER = (
    "upload_batch_id,order_id,job_name,machine_id,station_id,routing_seq,"
    "duration_mins,duration_slots,kwh_per_op,restart_kwh,load_tag,splittable,"
    "due_slot,is_critical_melt"
)

END = 191          # last 15-minute slot of the 48-hour horizon
D1_NOON = 47       # Day 1 11:45 is the last slot before 12:00
D1_1800 = 71
D1_2200 = 87

# suffix, seq, name, machine, station, minutes, kWh, restart kWh, tag, splittable, due slot, critical melt
DAYS = {
    "MON": ("Day 1 - Monday", "day1_monday_orders.csv", [
        ("01", 1, "Ladle melt A", "FURNACE_1", "FURNACE_BAY", 360, 360, 12, "fixed", False, END, True),
        ("02", 1, "Ladle melt B", "FURNACE_1", "FURNACE_BAY", 360, 360, 12, "fixed", False, END, True),
        ("03", 1, "Housing mill", "CNC_1", "CNC_BAY", 120, 80, 4, "shiftable", False, END, False),
        ("04", 1, "Shaft turn", "CNC_2", "CNC_BAY", 120, 80, 4, "shiftable", False, END, False),
        ("05", 1, "Flange mill", "CNC_3", "CNC_BAY", 120, 80, 4, "shiftable", False, END, False),
        ("06", 1, "Paint cure", "OVEN_1", "OVEN_1", 120, 80, 4, "shiftable", False, END, False),
        ("07", 1, "Ice bank charge", "CHILLER_1", "CHILLER_1", 120, 80, 20, "interruptible", True, END, False),
        ("08", 1, "Compressed air", "COMP_1", "COMP_1", 120, 80, 4, "shiftable", False, END, False),
    ]),
    "TUE": ("Day 2 - Tuesday", "day2_tuesday_orders.csv", [
        ("01", 1, "Housing melt", "FURNACE_1", "FURNACE_BAY", 240, 240, 10, "fixed", False, END, True),
        ("01", 2, "Housing machining", "CNC_1", "CNC_BAY", 180, 90, 4, "shiftable", False, END, False),
        ("02", 1, "Cover melt", "FURNACE_2", "FURNACE_BAY", 240, 240, 10, "fixed", False, END, True),
        ("02", 2, "Cover machining", "CNC_2", "CNC_BAY", 180, 90, 4, "shiftable", False, END, False),
        ("03", 1, "Primer cure", "OVEN_1", "OVEN_1", 180, 120, 5, "shiftable", False, END, False),
        ("04", 1, "Top coat cure", "OVEN_1", "OVEN_1", 180, 120, 5, "shiftable", False, END, False),
        ("05", 1, "Ice bank charge", "CHILLER_1", "CHILLER_1", 240, 120, 15, "interruptible", True, END, False),
        ("06", 1, "Compressed air", "COMP_1", "COMP_1", 180, 90, 4, "shiftable", False, END, False),
    ]),
    "WED": ("Day 3 - Wednesday", "day3_wednesday_orders.csv", [
        ("01", 1, "Gear blank melt 1", "FURNACE_1", "FURNACE_BAY", 240, 260, 10, "fixed", False, END, True),
        ("02", 1, "Gear blank melt 2", "FURNACE_1", "FURNACE_BAY", 240, 260, 10, "fixed", False, END, True),
        ("03", 1, "Gear blank melt 3", "FURNACE_1", "FURNACE_BAY", 240, 260, 10, "fixed", False, END, True),
        ("04", 1, "Shaft billet melt", "FURNACE_2", "FURNACE_BAY", 300, 300, 12, "fixed", False, END, True),
        ("05", 1, "Gear hobbing", "CNC_1", "CNC_BAY", 120, 70, 4, "shiftable", False, END, False),
        ("06", 1, "Spline cutting", "CNC_2", "CNC_BAY", 120, 70, 4, "shiftable", False, END, False),
        ("07", 1, "Compressed air", "COMP_1", "COMP_1", 240, 120, 4, "shiftable", False, END, False),
    ]),
    "THU": ("Day 4 - Thursday", "day4_thursday_orders.csv", [
        ("01", 1, "Impeller bore", "CNC_1", "CNC_BAY", 120, 70, 4, "shiftable", False, D1_1800, False),
        ("02", 1, "Impeller face", "CNC_1", "CNC_BAY", 120, 70, 4, "shiftable", False, D1_1800, False),
        ("03", 1, "Impeller keyway", "CNC_1", "CNC_BAY", 120, 70, 4, "shiftable", False, D1_1800, False),
        ("04", 1, "Casing turn", "CNC_2", "CNC_BAY", 180, 100, 4, "shiftable", False, END, False),
        ("05", 1, "Casing drill", "CNC_2", "CNC_BAY", 180, 100, 4, "shiftable", False, END, False),
        ("06", 1, "Volute mill", "CNC_3", "CNC_BAY", 240, 130, 5, "shiftable", False, END, False),
        ("07", 1, "Enamel cure", "OVEN_1", "OVEN_1", 120, 80, 4, "shiftable", False, END, False),
        ("08", 1, "Ice bank charge", "CHILLER_1", "CHILLER_1", 360, 180, 15, "interruptible", True, END, False),
    ]),
    "FRI": ("Day 5 - Friday", "day5_friday_orders.csv", [
        ("01", 1, "Valve body melt (rush)", "FURNACE_1", "FURNACE_BAY", 360, 360, 12, "fixed", False, D1_2200, True),
        ("02", 1, "Valve body melt", "FURNACE_1", "FURNACE_BAY", 360, 360, 12, "fixed", False, END, True),
        ("03", 1, "Seat machining (rush)", "CNC_1", "CNC_BAY", 120, 80, 4, "shiftable", False, D1_NOON, False),
        ("04", 1, "Stem machining (rush)", "CNC_2", "CNC_BAY", 120, 80, 4, "shiftable", False, D1_NOON, False),
        ("05", 1, "Bonnet machining", "CNC_3", "CNC_BAY", 120, 80, 4, "shiftable", False, END, False),
        ("06", 1, "Paint cure", "OVEN_1", "OVEN_1", 120, 80, 4, "shiftable", False, END, False),
        ("07", 1, "Ice bank charge", "CHILLER_1", "CHILLER_1", 240, 120, 15, "interruptible", True, END, False),
        ("08", 1, "Compressed air", "COMP_1", "COMP_1", 180, 90, 4, "shiftable", False, END, False),
    ]),
}

THEMES = {"MON": "Castings", "TUE": "Housings", "WED": "Gearbox", "THU": "Pump bodies", "FRI": "Valve blocks"}


def render(code: str, rows: list[tuple]) -> str:
    lines = [HEADER]
    for suffix, seq, name, machine, station, mins, kwh, restart, tag, split, due, crit in rows:
        lines.append(
            f"BATCH_{code},{code}-{suffix},{name},{machine},{station},{seq},"
            f"{mins},{mins // 15},{kwh},{restart},{tag},{split},{due},{crit}"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    data = root / "app" / "data"
    monday = ""
    for code, (folder, filename, rows) in DAYS.items():
        text = render(code, rows)
        if code == "MON":
            monday = text
        path = data / folder / "Orders" / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print(path, len(rows), "jobs")
    for extra in (
        data / "plant_orders_telangana.csv",
        data / "Reference_and_Standards" / "plant_orders_telangana.csv",
        root / "scripts" / "demo_files" / "plant_orders_telangana.csv",
        root.parent / "sample_manager_uploads" / "Reference_and_Standards" / "plant_orders_telangana.csv",
    ):
        extra.parent.mkdir(parents=True, exist_ok=True)
        extra.write_text(monday, encoding="utf-8")


if __name__ == "__main__":
    main()
