# TEEVRA

A 48-hour production plan that keeps crews out of unsafe heat and moves work into cheaper power.

[Open the app](https://thermaplan-ai.web.app) · [API](https://teevra-backend-gkdvqod5qa-el.a.run.app) · [API docs](https://teevra-backend-gkdvqod5qa-el.a.run.app/docs)

TEEVRA plans a metal plant in Telangana. It takes the day’s orders and builds two schedules with the same solver:

- **Baseline.** Every job starts as early as it can. No heat rule.
- **Our plan.** Crews stay inside the heat limit, and shiftable work moves into the cheaper hours.

The saving is the difference between those two. The Gantt shows where each job went, and why.

## What you see

| | |
|---|---|
| **Monday to Friday** | Five order books. Melts, machining, paint, a chiller, a compressor. Tuesday melts before it machines. Thursday and Friday have real due times. |
| **The chart** | One row per machine. Switch between our plan and the baseline. Red hatching is unsafe heat. The strip above the rows is the power price. |
| **The numbers** | Bill, unsafe-heat hours, energy, restarts, and output. All of them come from the solve. Nothing is typed in. |
| **A breakdown** | Pick a machine that fails. Work already started stays put for two hours. The rest is replanned. |
| **Evals** | The average of every morning plan run so far: baseline against our plan. A second section shows how a plan would be cross-checked. That section is a mockup and is labelled as one. |
| **The floor tablet** | Heat check, dizzy, and SOS. The SOS does not wait for a model. |

## How a plan is made

1. Orders, a heat limit per station, and a replayed hot summer day go into Google OR-Tools CP-SAT.
2. The heat limit follows ISO 7243:2017, Annex A, Table A.1. A furnace crew (heavy work) stops at 26°C WBGT. A CNC crew stops at 30°C.
3. The power price is an illustrative time-of-day tariff: **₹6** from 10:00–16:00, **₹7.50** otherwise, **₹9** from 18:00–22:00. It follows the shape of a TGSPDCL tariff. It is not a quoted tariff order.
4. Carbon uses the CEA v22 grid factor, **0.675 tCO2/MWh**. Moving the same energy to a different hour does not reduce CO2, so the plan says so.
5. The same input always produces the same plan. The solver seed is 42.
6. Gemini may rewrite the result as a short note for the shift manager. It is given the numbers. It does not calculate them.

## Try it

1. Open [thermaplan-ai.web.app](https://thermaplan-ai.web.app).
2. Choose **Launch 48-Hour Plan Console**. Monday solves in a few seconds.
3. Read the sentence under the chart. Then switch to **Baseline** and back.
4. Change the day in the top bar. Each day makes a different decision.
5. Open **Evals** from the footer.

## Run it locally

Backend, from `teevra-backend`:

```bash
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend, from `frontend`:

```bash
npm install
npm run dev
```

The app talks to `http://localhost:8000/api/v1`. Copy `teevra-backend/.env.example` to `.env` for cloud credentials. The solver runs without them. Weather is a replayed summer day, so a solve does not call a weather service.

Check all five days:

```bash
cd teevra-backend
uv run python scripts/verify_days.py
```

## What is honest about the data

The orders, the weather, and the tariff are simulated so a judge can see a clear decision. The solver, the rupees, the kilowatt-hours, and the heat-breach count are computed. If the live solver cannot be reached, the screen says so. It does not invent a plan.

## Layout

```
frontend/         React planner, Gantt, evals, floor tablet
teevra-backend/   FastAPI, CP-SAT solver, five day books
```
