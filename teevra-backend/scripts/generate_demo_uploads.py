"""
Generates realistic demo CSVs and sample tariff summary documents
for testing file upload workflows in TEEVRA.
"""

import sys
from pathlib import Path

import pandas as pd

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.routers.manager_router import DEFAULT_DEMO_ORDERS, DEFAULT_DEMO_ROSTERS


def main():
    output_dir = Path(__file__).resolve().parent / "demo_files"
    output_dir.mkdir(exist_ok=True)

    # 1. Orders CSV
    orders_data = [o.model_dump() for o in DEFAULT_DEMO_ORDERS]
    orders_df = pd.DataFrame(orders_data)
    orders_csv_path = output_dir / "plant_orders_telangana.csv"
    orders_df.to_csv(orders_csv_path, index=False)

    # 2. Roster CSV
    rosters_data = [r.model_dump() for r in DEFAULT_DEMO_ROSTERS]
    rosters_df = pd.DataFrame(rosters_data)
    rosters_csv_path = output_dir / "workstation_roster_telangana.csv"
    rosters_df.to_csv(rosters_csv_path, index=False)

    print(f"Generated demo upload files in {output_dir}:")
    print(f"- {orders_csv_path.name} ({len(orders_df)} orders)")
    print(f"- {rosters_csv_path.name} ({len(rosters_df)} workstations)")


if __name__ == "__main__":
    main()
