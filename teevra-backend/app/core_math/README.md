# Deterministic Mathematical Core (`app/core_math`)

## Architecture & Design Principles

This package contains **zero AI text generation**. Every single rupee, degree Celsius, kilowatt-hour, and schedule slot assignment is computed using exact mathematical algorithms, physical psychrometric models, and discrete constraint optimization.

### 1. `wbgt_calculator.py`
- **Stull (2011) Wet Bulb Equation**: Computes natural wet-bulb temperature from dry-bulb temperature and relative humidity.
- **ISO 7243:2017 Table A.1 Reference Limits**: Implements metabolic rate classes (0 to 4) for acclimatised vs unacclimatised workers.
- **Conservative Safety Degradation**: If sensor telemetry fails or work class is ambiguous, automatically elevates the work class to enforce a stricter thermal ceiling.
- **Simulated Estimate Tagging**: Clearly flags simulated globe uplift calculations (`is_simulated_estimate: true`) to comply with legal screening standards.

### 2. `carbon_tariff_calc.py`
- **TGSPDCL Time-of-Day (ToD) Tariffs**: Base ₹7.50/kWh, Solar hours 10:00–16:00 (0.8x = ₹6.00/kWh), Peak hours 18:00–22:00 (1.2x = ₹9.00/kWh).
- **Honest CO2 Accounting**: Uses CEA Baseline Database v22 factor (0.675 tCO2/MWh). Enforces the hard rule that pure time-shifting without net kWh reduction yields 0.0 tCO2 savings.

### 3. `ortools_solver.py`
- **192 Discrete 15-Minute Slots**: 48-hour forward horizon.
- **Hard Constraint 1**: Thermal barrier preventing manual work during exceedance slots.
- **Hard Constraint 2**: Machine non-overlap and sequential routing precedence.
- **Hard Constraint 3**: 30-to-60 minute pre-allocated Heat Buffers in peak thermal afternoon slots.
- **2-Hour Frozen Window**: Locks all running jobs and healthy machines during machine fault recovery.
- **Interruptible Load Flexibility**: Guarantees $\ge 98\%$ output for splittable loads while minimizing restart penalties.

### 4. `safety_validator.py`
- **Deterministic Gate**: Rejects any proposed schedule modification that introduces negative thermal margins or increases heat breach counts.
- **Heat Buffer Capacity Management**: Tracks consumption of pre-allocated rest windows by worker micro-rests.
