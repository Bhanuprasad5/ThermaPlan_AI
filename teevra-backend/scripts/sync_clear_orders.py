"""Copy the clear order books into the frontend dataset and the xlsx uploads."""
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "teevra-backend" / "app" / "data"
FRONTEND = ROOT / "frontend" / "src" / "constants" / "dailyDatasets.ts"
UPLOADS = ROOT / "sample_manager_uploads"

DAYS = [
    ("day1_monday", "Day 1 - Monday", "day1_monday_orders.csv", "Monday: Castings", "Melts avoid the hot window"),
    ("day2_tuesday", "Day 2 - Tuesday", "day2_tuesday_orders.csv", "Tuesday: Housings", "Melt, then machining, in order"),
    ("day3_wednesday", "Day 3 - Wednesday", "day3_wednesday_orders.csv", "Wednesday: Gearbox", "Four melts in the cool hours"),
    ("day4_thursday", "Day 4 - Thursday", "day4_thursday_orders.csv", "Thursday: Pump bodies", "Same-day due times"),
    ("day5_friday", "Day 5 - Friday", "day5_friday_orders.csv", "Friday: Valve blocks", "Rush orders due by noon"),
]


def csv_literal(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\r\n", "\n").replace("\n", "\\n")


def main() -> None:
    src = FRONTEND.read_text(encoding="utf-8")
    for day_id, folder, filename, label, theme in DAYS:
        csv_path = DATA / folder / "Orders" / filename
        raw = csv_path.read_text(encoding="utf-8")
        xlsx_name = filename.replace(".csv", ".xlsx")
        frame = pd.read_csv(csv_path)
        for dest in (csv_path.with_suffix(".xlsx"), UPLOADS / folder / "Orders" / xlsx_name):
            dest.parent.mkdir(parents=True, exist_ok=True)
            frame.to_excel(dest, index=False)
        upload_csv = UPLOADS / folder / "Orders" / filename
        upload_csv.parent.mkdir(parents=True, exist_ok=True)
        upload_csv.write_text(raw, encoding="utf-8")

        id_at = src.find(f'"id": "{day_id}"')
        if id_at < 0:
            raise SystemExit(f"missing {day_id}")
        window = src[id_at:id_at + 2500]
        window2, n1 = re.subn(r'"orders_count": \d+', f'"orders_count": {len(frame)}', window, count=1)
        window3, n2 = re.subn(r'"label": "[^"]*"', f'"label": "{label}"', window2, count=1)
        window4, n3 = re.subn(r'"theme": "[^"]*"', f'"theme": "{theme}"', window3, count=1)
        if not (n1 and n2 and n3):
            raise SystemExit(f"label patch failed for {day_id} {n1} {n2} {n3}")
        src = src[:id_at] + window4 + src[id_at + 2500:]

        raw_at = src.find('"orders_csv_raw":', id_at)
        if raw_at < 0 or raw_at - id_at > 8000:
            raise SystemExit(f"orders_csv_raw missing for {day_id}")
        quote = src.find('"', raw_at + len('"orders_csv_raw":'))
        # value is a quoted string with escaped quotes
        i = quote + 1
        while i < len(src):
            if src[i] == "\\" and i + 1 < len(src):
                i += 2
                continue
            if src[i] == '"':
                break
            i += 1
        src = src[:quote + 1] + csv_literal(raw) + src[i:]
        print("patched", day_id, "jobs", len(frame))

    # Tariff notes still claim a published rate. Keep them short and honest.
    src = src.replace(
        "TGSPDCL \\u20b94.40 Solar Window (10:00-16:00), \\u20b99.20 Evening Peak",
        "Illustrative tariff, simulated",
    )
    FRONTEND.write_text(src, encoding="utf-8")
    print("wrote", FRONTEND)


if __name__ == "__main__":
    main()
