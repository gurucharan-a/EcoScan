# EcoScan database — Prisma Postgres

The Postgres database is the **shared, multi-device** backend. The browser
`localStorage` store remains as the offline single-device mode. Switch between
them in **Settings → Database backend** (no redeploy needed).

```
Browser (dbMode=local)          Postgres (dbMode=postgres)
localStorage ecoscan-db-v1  →   Vercel /api/ecoscan/* → Prisma → Postgres
```

## 1. Create a Postgres database (pick one)

| Provider | Notes |
|---|---|
| **Supabase** (recommended for exhibitions) | New project → Connect → copy the `DATABASE_URL` (use the **pooled / transaction** URL, port 6543, for serverless) |
| **Neon** | New project → copy the pooled connection string (`?sslmode=require`) |
| **Prisma Postgres** | `npx prisma init` / Prisma dashboard — works with `prisma db push` directly |

Format:
```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require&pgbouncer=true"
```

## 2. Create the tables (once)

```bash
npx prisma db push --schema=prisma/ecoscan.prisma
# or: npm run db:push
```

This creates `Device, Scan, SortingJob, MaterialProfile, CollectionBin,
Alert, AuditEvent, EcoSetting`. No migration files needed for a prototype
(`prisma migrate` path is ready when you want history).

## 3. Wire the host

**Vercel:** Project → Settings → Environment Variables → add:
- `DATABASE_URL` = the pooled URL above (all environments)
- `DEVICE_TOKEN` = a long random secret (ESP32 + job-ack auth)

The build already runs `prisma generate --schema=prisma/ecoscan.prisma`
(`vercel.json` buildCommand), so serverless functions have a query client.
Redeploy after adding env vars.

**Local API dev:** `npx vercel dev` serves both the SPA and `/api/ecoscan/*`
with `.env` (`DATABASE_URL`, `DEVICE_TOKEN`) loaded automatically.

## 4. Use it in the app

1. Open **Settings → Database backend → Test connection** (same-origin
   `/api/ecoscan/health`, or enter your deployment URL as base).
2. Switch to **Postgres via Prisma API**. Dashboard, History, Scanner, Scan
   detail, Sorting, Alerts, and Hardware now read/write Postgres rows.
3. Bins, material factors, and composition profiles stay browser-local in this
   version (noted in-app wherever it applies).

## 5. Honesty rules (enforced)

- Without `DATABASE_URL` every endpoint answers **503 NO_DATABASE** — the UI
  shows an explicit error and never fake data.
- `GET /api/ecoscan/dashboard` aggregates real rows (counts, sums, group-bys).
- Sorting success is ack-gated (`POST /jobs/[id]/ack`, device token, 409 on
  duplicate acks, 3-attempt cap).
- Device `online` is derived from heartbeat freshness (< 60 s), not config.
- Images are NOT stored in Postgres (only the filename) — photo blobs would
  bloat rows; use object storage when needed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `P1012: Environment variable not found: DATABASE_URL` | create `.env` (local) / Vercel env var; never commit it |
| `Can't reach database` on `db push` | use the pooled URL; check `?sslmode=require`; allowlist `0.0.0.0/0` on serverless hosts |
| UI shows NO_DATABASE | Vercel env var added but not redeployed — redeploy |
| 401 on heartbeat/ack | `X-Device-Token` ≠ `DEVICE_TOKEN` — align firmware `config.h` and server env |
| Legacy `/api/auth`, `/api/users` 404 | removed on purpose — ServiceGrid endpoints incompatible with the EcoScan schema |
