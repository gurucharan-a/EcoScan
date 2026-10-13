# Demo script (2 minutes, exhibition-ready)

1. **Overview** → *Load demo data* (5 labeled samples appear; banner reads DEMO MODE).
2. **Live Scanner** → *Upload image* → pick any photo renamed `phone_demo.jpg`
   → enter weight `150` → *Capture & Analyze* → 88–95% `mobile_phone`, REPAIR/REUSE + evidence.
3. Upload `qxzv_blur.png` → `unknown`, ~20–40% → NEEDS_MANUAL_REVIEW → correct to
   `remote_control` manually → recommendation unlocks (shows the honesty path).
4. Open the scan → composition table (estimates labeled) → *Authorize sorting* →
   job completes in ~2 s as SIMULATED; event log says deposit NOT sensed.
5. **Sorting Control** → show state machine, retry path, Emergency stop.
6. **Sustainability** → point at method/uncertainty box (never claim real savings).
7. **Hardware** → *Simulate disconnect* → try sorting in Hardware mode → blocked
   with a real error (no silent fake data).

# Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Blank page after `npm run dev` | stale `node_modules` → `npm install`; check `dev-server.log` |
| Images won't upload | >6 MB or non-image type → resize to <6 MB JPG |
| Everything "Unknown" | filename has no keyword AND confidence <60% → confirm manually (by design) |
| Sort button errors "must be confirmed" | confirm the scan first (state machine enforced) |
| Hardware mode blocks sorting | device offline → `POST /heartbeat` from ESP32 or *Simulate connect* |
| ESP32 brownouts on sort | servo on USB power → separate 5 V rail, common ground |
| Servo wrong chute | `SERVO_MIN/MAX` or pin conflict (CAM GPIO 14) → see firmware/WIRING.md |
| Backend 401s | `X-Device-Token` ≠ `DEVICE_TOKEN` env → align both, never commit the secret |

# Known limitations & roadmap
- Classifier is a labeled mock; ONNX/MobileNet swap point is `lib/classifier.ts`.
- No real bin-level sensing (fill is estimated); add ToF/ultrasonic + `bin.fillMeasured`.
- Single-operator, no auth in prototype; FastAPI token only for devices.
- SQLite/localStorage now; Postgres via `prisma/ecoscan.prisma` for production.
- Roadmap: trained classifier, bin sensors, multi-device fleet, recycler API, PWA offline.
