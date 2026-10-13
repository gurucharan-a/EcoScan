# EcoScan architecture

```
Browser (Vite + React + TS + Tailwind, this repo root)
  src/ecoscan/
    types.ts              domain model (mirrors backend + prisma/ecoscan.prisma)
    data/materialProfiles.ts   versioned composition DB (v1.3.0)
    data/knowledge.ts          disposal guidance + FAQs (sourced, dated)
    lib/recommendation.ts      transparent rules engine (rules-v1.2.0)
    lib/classifier.ts          replaceable inference iface (mock default, LABELED)
    lib/sustainability.ts      CO2/value math with method + uncertainty
    services/ecoStore.ts       persistent store (localStorage ecoscan-db-v1)
                              scan state machine + sorting jobs + alerts + audit
    pages/* + components/*     11 routed views (state-router, no new deps)
                ↕ (optional, hardware mode)
backend/app/main.py  FastAPI + SQLite (OpenAPI at /docs)
                ↕  X-Device-Token
firmware/ecoscan_firmware.ino  ESP32 Arduino (heartbeat → poll → bounded servo → ack)
```

## Why not react-router / recharts / react-query?
The existing repo had none of them; adding deps for a hackathon demo risks build
breaks with zero functional gain. Equivalents: state-router in `EcoApp.tsx`,
dependency-free SVG `Bars`/`Donut` in `components/ui.tsx`, and `useSyncExternalStore`
against the persistent store (works offline, survives refresh).

## Data honesty invariants (enforced in code + tests)
1. Photo → category only; internals always `database estimate` or `qualitative`.
2. Weights are `measured` (HW) or `simulated` (demo) — labeled everywhere.
3. Classifier below threshold → `unknown`, never forced; sorting blocked until confirmed.
4. Swollen battery / unknown / low-confidence → Hazardous/Quarantine interlock.
5. Sort success only on ack (`completeSimulatedJob` / `ackJob`); movement ≠ deposit.
6. CO₂/value are `ESTIMATED ±50%`; verified only with handover records.
7. No fabricated recyclers, sensor states, or external notifications.

## API parity
Frontend store methods map 1:1 to `backend/app/main.py` endpoints
(`POST /api/scans`, `/classify`, `/recommendation`, `/confirm`, `/sort`,
`GET /api/sorting/jobs/{id}`, `POST /api/devices/{id}/heartbeat|commands`,
`.../ack`, plus dashboard/materials/collections/alerts/analytics/audit).
Set `VITE_ECOSCAN_API_URL` / Settings → API URL to run hardware mode against FastAPI.
