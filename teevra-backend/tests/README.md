# TEEVRA Test Suite

This directory contains the verification suite for the TEEVRA manufacturing backend:

- `test_wbgt_and_carbon_math.py`: Validates Stull psychrometrics, ISO 7243 limits, safety uncertainty degradation, TGSPDCL ToD tariffs, and honest CEA carbon accounting.
- `test_ortools_cp_sat.py`: Verifies zero heat breaches in the optimized schedule, furnace batch contiguity, 30-60m heat buffers, and $\ge 98\%$ output guarantee.
- `test_breakdown_frozen_window.py`: Tests the 2-hour (8-slot = 120-minute) lock on healthy machines and faulted machine lockout.
- `test_safety_and_heat_buffer.py`: Verifies micro-rest absorption, buffer exhaustion logic, and SOS hardware isolation.
- `test_end_to_end_demo_flow.py`: Executes the full 90-second judge demo flow across all 6 core features.

## Running Tests via uv

```bash
uv run pytest -v
```
