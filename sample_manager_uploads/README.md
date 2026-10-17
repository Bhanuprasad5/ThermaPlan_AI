# Sample Manager Uploads Directory

This folder contains organized operational data packages for the 5-day manufacturing simulation in TEEVRA.

Each day has its own dedicated directory containing subfolders for each distinct operational data type:
- **`Orders/`**: Factory production work orders in CSV and Excel (`.xlsx`) formats.
- **`Tariffs/`**: TGSPDCL time-of-day electricity tariffs with hourly pricing and solar windows in CSV and Excel formats.
- **`Worker_Rosters/`**: Certified worker rosters with bilingual English/Telugu names, skill qualifications, and safety clearance dates in CSV and Excel formats.

---

## Directory Hierarchy

```text
sample_manager_uploads/
│
├── Day 1 - Monday/
│   ├── Orders/
│   │   ├── day1_monday_orders.csv
│   │   └── day1_monday_orders.xlsx
│   ├── Tariffs/
│   │   ├── day1_monday_tgspdcl_tariff.csv
│   │   └── day1_monday_tgspdcl_tariff.xlsx
│   └── Worker_Rosters/
│       ├── day1_monday_workers_roster_260.csv
│       └── day1_monday_workers_roster_260.xlsx
│
├── Day 2 - Tuesday/
│   ├── Orders/
│   │   ├── day2_tuesday_orders.csv
│   │   └── day2_tuesday_orders.xlsx
│   ├── Tariffs/
│   │   ├── day2_tuesday_tgspdcl_tariff.csv
│   │   └── day2_tuesday_tgspdcl_tariff.xlsx
│   └── Worker_Rosters/
│       ├── day2_tuesday_workers_roster_255.csv
│       └── day2_tuesday_workers_roster_255.xlsx
│
├── Day 3 - Wednesday/
│   ├── Orders/
│   │   ├── day3_wednesday_orders.csv
│   │   └── day3_wednesday_orders.xlsx
│   ├── Tariffs/
│   │   ├── day3_wednesday_tgspdcl_tariff.csv
│   │   └── day3_wednesday_tgspdcl_tariff.xlsx
│   └── Worker_Rosters/
│       ├── day3_wednesday_workers_roster_265.csv
│       └── day3_wednesday_workers_roster_265.xlsx
│
├── Day 4 - Thursday/
│   ├── Orders/
│   │   ├── day4_thursday_orders.csv
│   │   └── day4_thursday_orders.xlsx
│   ├── Tariffs/
│   │   ├── day4_thursday_tgspdcl_tariff.csv
│   │   └── day4_thursday_tgspdcl_tariff.xlsx
│   └── Worker_Rosters/
│       ├── day4_thursday_workers_roster_258.csv
│       └── day4_thursday_workers_roster_258.xlsx
│
├── Day 5 - Friday/
│   ├── Orders/
│   │   ├── day5_friday_orders.csv
│   │   └── day5_friday_orders.xlsx
│   ├── Tariffs/
│   │   ├── day5_friday_tgspdcl_tariff.csv
│   │   └── day5_friday_tgspdcl_tariff.xlsx
│   └── Worker_Rosters/
│       ├── day5_friday_workers_roster_270.csv
│       └── day5_friday_workers_roster_270.xlsx
│
└── Reference_and_Standards/
    ├── ISO_7243_2017_Thermal_Limits_Excerpt.pdf
    ├── TGSPDCL_HT1_Tariff_Order_FY26_Excerpt.pdf
    └── plant_orders_telangana.csv
```

---

## Daily Manufacturing Scenarios
- **Day 1 (Monday)**: Heavy Aerospace & Defense Ingot Melt (260 Workers, 45 Orders)
- **Day 2 (Tuesday)**: High-Voltage EV Powertrain & Copper Rotor Casting (255 Workers, 45 Orders)
- **Day 3 (Wednesday)**: Indian Railways Heavy Bogie & Axles (265 Workers, 45 Orders)
- **Day 4 (Thursday)**: 3MW Wind Turbine Planetary Gears & Flange Profiling (258 Workers, 45 Orders)
- **Day 5 (Friday)**: Orthopedic Titanium Implants & Micro-Machining (270 Workers, 45 Orders)
