# Calibration guide (load cell + servo)

## Load cell (HX711 + 5 kg bar)
1. Mount the cell with the arrow pointing DOWN toward the load; rigid frame, no side-load.
2. Flash firmware with `LOAD_SCALE_FACTOR 2280.0` (placeholder).
3. Hardware page → Tare with empty chamber (or hold BOOT 1 s).
4. Place a known 500 g weight (kitchen scale verified) dead-center.
5. Read serial `weight_g`. New factor = old factor × reading / 500.
6. Update `firmware/config.h`, reflash, verify: 0 g tare ±1 g, 500 g ±2 g, 2000 g ±5 g.
7. Stability rule: UI accepts a weight only after 5 consecutive readings within ±2 g
   (backend: `weightStable`; demo: entered values are labeled SIMULATED).

## Servo gate
1. With power OFF, center the horn so the gate blocks all chutes at 90° (safe default).
2. Power on — firmware parks at `SERVO_SAFE_DEG` and NEVER auto-moves.
3. Sorting page → authorize a job per destination; verify angles:
   Reuse 30° · Repair 70° · Recycle 110° · Hazardous 150° · Quarantine 90°.
4. If travel hits end-stops, tighten `SERVO_MIN/MAX_DEG` in `config.h` (default 20–160°).
5. Stall test: block the gate → expect timeout ack `{ok:false,"servo timeout"}` and FAILED job with retry.

## Camera
- ESP32-CAM @ SVGA, good diffuse light. If recognition is poor, clean the lens and
  fix exposure — the backend mock labels filename hints for demo determinism.
- Plain DevKit (`HAS_CAMERA=0`): upload images in the Scanner; inference runs server-side.
