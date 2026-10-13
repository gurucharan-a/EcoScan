# EcoScan — Smart E-Waste Intelligence & Automated Segregation Platform

Exhibition-ready prototype: ESP32 scanning chamber → image classification →
weighing → versioned composition lookup → transparent recommendation → ack-gated
servo sorting, with dashboard, history, materials DB, collections, sustainability
math, knowledge center, alerts, and hardware management.

## Quick start (frontend only — works with zero backend)

```bash
npm install
npm run dev     # http://localhost:5173
npm run test    # 32 tests (10 EcoScan + 22 legacy)
npm run build   # type-check + production build
```

Open the app → **Load demo data** → run the 2-minute script in
`docs/DEMO_TROUBLESHOOTING.md`. Demo banner, simulated labels, and seeded records
keep exhibition data unmistakably separate from real measurements.

## Deploy to Vercel (frontend — no server or database required)

The app is a static Vite SPA; all data persists in browser `localStorage`, so it
deploys with zero env vars.

1. Push this folder to a GitHub repo (or run `npx vercel` from here).
2. Vercel dashboard → **Add New → Project** → Import the repo (framework
   auto-detected as **Vite**; `vercel.json` already sets build `npm run build`,
   output `dist`, SPA fallback rewrite, and immutable caching for `/assets/*`).
3. Optional env vars (Settings page in-app overrides these at runtime; all have
   offline-safe defaults — deploy works with none set):
   - `VITE_ECOSCAN_API_URL` — FastAPI base URL for hardware mode (demo mode ignores it)
   - `VITE_ECOSCAN_MODE` — `demo` (default) or `hardware`
4. Deploy. `backend/`, `firmware/`, and `docs/` are excluded from uploads via
   `.vercelignore`; the legacy `api/` serverless functions are untouched.

## Hardware mode (optional, local)

```bash
cd backend
pip install -r requirements.txt
$env:DEVICE_TOKEN="pick-a-secret"   # PowerShell
uvicorn app.main:app --host 0.0.0.0 --port 8000  # docs at /docs
```

- Settings → API URL → `http://<pc-ip>:8000`, switch to **Hardware mode**.
- Flash `firmware/ecoscan_firmware.ino` (Arduino-ESP32): copy
  `firmware/config.example.h` → `config.h`, set Wi-Fi/API/token, flash, monitor serial.
- ESP32 heartbeat → poll → bounded servo → ack. Sorting stays blocked while offline.

## Database: Browser DB or Prisma Postgres

- **Browser DB (default):** offline `localStorage`, single device, zero setup.
- **Prisma Postgres (shared):** `prisma/ecoscan.prisma` → Vercel `/api/ecoscan/*`
  (scans, jobs, alerts, devices, dashboard aggregates) → Postgres. Full setup in
  `docs/DATABASE.md`. Switch live in **Settings → Database backend**; without
  `DATABASE_URL` the API answers 503 and the UI says so.

## What was built (and what is honestly simulated)

| Capability | Status |
|---|---|
| 11 pages: Overview, Live Scanner, Scan detail, History, Materials, Sorting, Collections, Sustainability, Knowledge, Alerts, Hardware, Settings | ✅ implemented, persisted |
| Scan state machine + interlocks + ack-gated jobs + retry + e-stop | ✅ implemented |
| Rule engine `rules-v1.2.0` with evidence/uncertainty/version | ✅ + tests |
| Composition DB `v1.3.0`, 12 categories, qualitative rows unfabricated | ✅ + tests |
| Mock classifier `mock-clf-v0.3.0` (filename heuristic, labeled simulated) | ⚠️ simulated by design |
| Demo-mode telemetry/servo | ⚠️ simulated, bannered |
| Real ESP32 ack path, heartbeat auth, watchdog, bounded servo | ✅ implemented, needs hardware to verify |
| CO₂/value math | ⚠️ planning estimates ±50%, verified only on handover |
| FastAPI backend (SQLite) + OpenAPI | ✅ implemented + pytest |
| Recyclers, bin sensing, auth, trained vision model | ❌ proposed (see docs roadmap) |

Prior repo (ServiceGrid) source remains in `src/` unused but intact; active app is
`src/ecoscan/*` via `src/App.tsx`. Prisma: `prisma/ecoscan.prisma` (Postgres path);
legacy `prisma/schema.prisma` untouched.

## Repository map

- `src/ecoscan/` — types, data, libs, store, components, pages
- `backend/app/main.py` — FastAPI (SQLite, token-gated device routes)
- `backend/tests/` — pytest lifecycle/interlock tests
- `firmware/` — ESP32 `.ino` + `config.example.h` + `WIRING.md` (BOM in INR)
- `docs/` — ARCHITECTURE, CALIBRATION, DEMO_TROUBLESHOOTING
- `prisma/ecoscan.prisma` — production Postgres schema

## API (frontend store ≡ backend endpoints)

`GET /api/health · GET /api/dashboard/summary · GET/POST /api/scans ·
GET /api/scans/{id} · POST /api/scans/{id}/classify|recommendation|confirm|sort ·
GET /api/sorting/jobs/{id} · POST /api/devices/{id}/heartbeat|commands ·
POST /api/sorting/jobs/{id}/ack · GET /api/material-profiles|collections|alerts|
/analytics/sustainability|audit-log|devices`
