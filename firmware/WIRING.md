# EcoScan wiring & bill of materials (prices indicative INR, Sept 2026 street pricing)

| Part | Spec | ~INR |
|---|---|---|
| ESP32-CAM (WROVER + OV2640) | camera-capable board | 900–1,400 |
| ESP32-DevKit V1 (fallback, no camera) | telemetry + servo only | 550–800 |
| Load cell 5 kg + HX711 amplifier | weighing | 450–700 |
| SG90 / MG996R servo | sorting gate | 250–900 |
| 0.96″ OLED SSD1306 (I2C) | status display | 350–500 |
| LEDs + buzzer + push button | status / tare / e-stop | 150–250 |
| 5 V 3 A supply + buck converter | servos need clean power | 400–600 |
| Plywood/acrylic chamber + 4 diverter bins | sorting rig | 1,500–3,000 |

## Pin map (ESP32-CAM defaults — adjust in `firmware/config.h`)

| Signal | GPIO | Notes |
|---|---|---|
| Servo PWM | 14 | 500–2400 µs, clamp 20–160° |
| HX711 DOUT | 12 |  |
| HX711 SCK | 13 |  |
| OLED SDA / SCL | 15 / 14* | *move servo to 2 if conflict — record in config |
| Tare button | 0 (BOOT) | short-press = tare |
| E-stop | 4 | HIGH = stop active |
| Status LED / buzzer | 33 / 32 | |

> Camera + servo pin conflicts are the #1 build issue: if the OV2640 uses GPIO 14
> on your CAM variant, move the servo to GPIO 2 or 16 and update `config.h`.
> Plain DevKit builds set `HAS_CAMERA=0` — inference runs on the backend.

## Power rules
- Servos on a SEPARATE 5 V rail with common ground; USB alone browns out.
- HX711 VCC to 5 V, logic to 3.3 V-safe pins only.
- Never drive the gate by hand while powered.
