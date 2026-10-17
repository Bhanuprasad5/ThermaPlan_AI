import os
from pathlib import Path
import pandas as pd

out_dir = Path("D:/ThermaPlan_AI/sample_manager_uploads")
out_dir.mkdir(exist_ok=True)

# 1. Orders Data
orders = [
    {
        "upload_batch_id": "batch_telangana_metal_01",
        "order_id": "ORD_101",
        "job_name": "Induction Furnace Melt - High Heat Batch A",
        "machine_id": "FURNACE_1",
        "station_id": "FURNACE_BAY",
        "routing_seq": 1,
        "duration_mins": 180,
        "duration_slots": 12,
        "kwh_per_op": 450.0,
        "restart_kwh": 120.0,
        "load_tag": "fixed",
        "splittable": False,
        "due_slot": 40,
        "is_critical_melt": True,
    },
    {
        "upload_batch_id": "batch_telangana_metal_01",
        "order_id": "ORD_102",
        "job_name": "Induction Furnace Melt - High Heat Batch B",
        "machine_id": "FURNACE_1",
        "station_id": "FURNACE_BAY",
        "routing_seq": 1,
        "duration_mins": 120,
        "duration_slots": 8,
        "kwh_per_op": 320.0,
        "restart_kwh": 90.0,
        "load_tag": "fixed",
        "splittable": False,
        "due_slot": 80,
        "is_critical_melt": True,
    },
    {
        "upload_batch_id": "batch_telangana_metal_01",
        "order_id": "ORD_103",
        "job_name": "Automated Paint Curing Oven Operation",
        "machine_id": "OVEN_1",
        "station_id": "PAINT_SHOP",
        "routing_seq": 1,
        "duration_mins": 180,
        "duration_slots": 12,
        "kwh_per_op": 280.0,
        "restart_kwh": 30.0,
        "load_tag": "shiftable",
        "splittable": False,
        "due_slot": 90,
        "is_critical_melt": False,
    },
    {
        "upload_batch_id": "batch_telangana_metal_01",
        "order_id": "ORD_104",
        "job_name": "Precision CNC High-Speed Tooling Run 1",
        "machine_id": "CNC_1",
        "station_id": "CNC_BAY",
        "routing_seq": 1,
        "duration_mins": 120,
        "duration_slots": 8,
        "kwh_per_op": 180.0,
        "restart_kwh": 20.0,
        "load_tag": "fixed",
        "splittable": False,
        "due_slot": 70,
        "is_critical_melt": False,
    },
    {
        "upload_batch_id": "batch_telangana_metal_01",
        "order_id": "ORD_105",
        "job_name": "CNC Backup Secondary Milling Run",
        "machine_id": "CNC_2",
        "station_id": "CNC_BAY",
        "routing_seq": 1,
        "duration_mins": 90,
        "duration_slots": 6,
        "kwh_per_op": 140.0,
        "restart_kwh": 15.0,
        "load_tag": "shiftable",
        "splittable": False,
        "due_slot": 75,
        "is_critical_melt": False,
    },
    {
        "upload_batch_id": "batch_telangana_metal_01",
        "order_id": "ORD_UTIL_1",
        "job_name": "Central Thermal Chiller Pre-Cooling Cycle",
        "machine_id": "CHILLER_1",
        "station_id": "UTILITY_ROOM",
        "routing_seq": 1,
        "duration_mins": 240,
        "duration_slots": 16,
        "kwh_per_op": 220.0,
        "restart_kwh": 10.0,
        "load_tag": "interruptible",
        "splittable": True,
        "due_slot": 120,
        "is_critical_melt": False,
    },
    {
        "upload_batch_id": "batch_telangana_metal_01",
        "order_id": "ORD_UTIL_2",
        "job_name": "Pneumatic System Central Air Compressor Load",
        "machine_id": "COMP_1",
        "station_id": "UTILITY_ROOM",
        "routing_seq": 1,
        "duration_mins": 180,
        "duration_slots": 12,
        "kwh_per_op": 160.0,
        "restart_kwh": 8.0,
        "load_tag": "interruptible",
        "splittable": True,
        "due_slot": 130,
        "is_critical_melt": False,
    },
]

df = pd.DataFrame(orders)
csv_path = out_dir / "plant_orders_telangana.csv"
df.to_csv(csv_path, index=False)
print("Generated:", csv_path)

# 2. PDF generator function
def create_pdf(path, doc_title, text_lines):
    stream_lines = [f"BT /F1 14 Tf 50 740 Td ({doc_title}) Tj ET"]
    y = 700
    for l in text_lines:
        safe_l = l.replace("(", "[").replace(")", "]")
        stream_lines.append(f"BT /F1 10 Tf 50 {y} Td ({safe_l}) Tj ET")
        y -= 22
    content = "\n".join(stream_lines)
    stream = f"<< /Length {len(content)} >>\nstream\n{content}\nendstream"
    pdf = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj
{stream}
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000236 00000 n 
0000000305 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
{305 + len(stream) + 10}
%%EOF"""
    with open(path, "wb") as f:
        f.write(pdf.encode("latin1"))
    print("Generated:", path)


create_pdf(
    out_dir / "TGSPDCL_HT1_Tariff_Order_FY26_Excerpt.pdf",
    "TGSPDCL RETAIL SUPPLY TARIFF ORDER FY 2025-26",
    [
        "STATE DISCOM: Telangana Southern Power Distribution Company Ltd",
        "CONSUMER CATEGORY: HT-I Industrial High Tension Supply",
        "BASE ENERGY CHARGE: Rs 7.50 per kWh for round-the-clock consumption",
        "CLAUSE 4.2b - SOLAR CONCESSION: 20% discount [Rs 6.00/kWh] between 10:00 to 16:00 IST",
        "CLAUSE 4.2c - EVENING PEAK SURCHARGE: 20% penalty [Rs 9.00/kWh] between 18:00 to 22:00 IST",
        "AUDIT REQUIREMENT: Industrial consumers must optimize daytime solar absorption",
        "REGULATORY AUTHORITY: Telangana State Electricity Regulatory Commission [TSERC]",
    ],
)

create_pdf(
    out_dir / "ISO_7243_2017_Thermal_Limits_Excerpt.pdf",
    "ISO 7243:2017 ERGONOMICS OF THE THERMAL ENVIRONMENT",
    [
        "STANDARD: ISO 7243:2017 [Assessment of heat stress using the WBGT index]",
        "TABLE A.1 REFERENCE LIMITS FOR ACCLIMATISED WORKERS:",
        "Class 0 [Resting 115 W]: WBGT limit = 33.0 deg C",
        "Class 1 [Low Metabolic Rate 180 W, e.g. CNC machining]: WBGT limit = 30.0 deg C",
        "Class 2 [Moderate Metabolic Rate 300 W, e.g. Paint Oven Bay]: WBGT limit = 28.0 deg C",
        "Class 3 [High Metabolic Rate 415 W, e.g. Furnace casting]: WBGT limit = 26.0 deg C",
        "STATUTORY REQUIREMENT: Wet Bulb Globe Temperature [WBGT] must not exceed Table A.1",
    ],
)

print("All sample upload files ready.")
