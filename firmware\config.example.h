// !!! Copy to config.h and fill in — NEVER commit real credentials !!!
#pragma once

#define FIRMWARE_VERSION "eco-fw-v1.0.0"
#define DEVICE_ID "esp32-01"

// Wi-Fi + backend (edit these)
#define WIFI_SSID "YOUR_SSID"
#define WIFI_PASS "YOUR_PASSWORD"
#define API_BASE "http://192.168.1.50:8000"
#define DEVICE_TOKEN "dev-token-change-me"

// Board capability: 1 = ESP32-CAM w/ OV2640, 0 = plain DevKit (no camera)
#define HAS_CAMERA 1

// Pins (ESP32-CAM default; adjust for your board)
#define SERVO_PIN 14
#define SERVO_SAFE_DEG 90
#define SERVO_MIN_DEG 20
#define SERVO_MAX_DEG 160
#define LOAD_DOUT_PIN 12
#define LOAD_SCK_PIN 13
#define LOAD_SCALE_FACTOR 2280.0f  // calibrate! see docs/CALIBRATION.md

// Timing
#define TELEMETRY_MS 10000
#define SORT_TIMEOUT_MS 5000
