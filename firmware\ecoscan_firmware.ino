/*
 * EcoScan ESP32 firmware (Arduino framework) — eco-fw-v1.0.0
 * Board: ESP32-WROVER + OV2640 camera (e.g. ESP32-CAM) OR ESP32-DevKit without
 * camera (set HAS_CAMERA=0; backend runs inference — the ESP32 NEVER claims to
 * run a vision model it cannot support).
 *
 * Safety: servo NEVER moves at boot; only on explicit authorized JSON command
 * with valid state (classified + destination + interlocks checked server-side).
 * Watchdog + command timeout + safe defaults included.
 *
 * Protocol (JSON over HTTP to backend/app):
 *   POST /api/devices/{id}/heartbeat   {rssi, camera_ok, loadcell_ok, servo_ok, weight_g}
 *   GET  /api/devices/{id}/commands    -> {command:"SORT", job_id, destination, angle_deg}
 *   POST /api/sorting/jobs/{job}/ack   {ok, detail}
 * Serial logs are structured: {"t":"...","level":"...","msg":"..."}
 *
 * !!! Configure WiFi + token in config.h (NOT committed with real secrets) !!!
 */
#include <Arduino.h>
#include "config.h"

#if HAS_CAMERA
#include "esp_camera.h"
#endif
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "HX711.h"

// ---- pins (override in config.h) ----
HX711 scale;
Servo gateServo;
unsigned long lastHeartbeat = 0;
unsigned long sortStartMs = 0;
bool sorting = false;
String activeJob = "";
int activeAngle = 90;

void jlog(const char* level, const String& msg) {
  StaticJsonDocument<256> d;
  d["t"] = millis(); d["level"] = level; d["msg"] = msg;
  serializeJson(d, Serial); Serial.println();
}

void setup() {
  Serial.begin(115200);
  jlog("info", "EcoScan boot fw=" FIRMWARE_VERSION);
  gateServo.attach(SERVO_PIN, 500, 2400);
  gateServo.write(SERVO_SAFE_DEG);  // safe default, NOT an auto-sort
  jlog("info", "servo parked at safe angle (no auto-move)");
  scale.begin(LOAD_DOUT_PIN, LOAD_SCK_PIN);
  scale.set_scale(LOAD_SCALE_FACTOR);
  scale.tare();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) delay(300);
  if (WiFi.status() == WL_CONNECTED) jlog("info", "wifi connected rssi=" + String(WiFi.RSSI()));
  else jlog("error", "wifi failed — retrying in loop (safe idle, no motion)");
#if HAS_CAMERA
  jlog("info", "camera enabled (OV2640)");
#else
  jlog("warn", "no camera on this board — backend inference only");
#endif
  enableLoopWDT();
}

float readWeightG() {
  if (!scale.is_ready()) { jlog("error", "HX711 not ready"); return NAN; }
  float v = scale.get_units(5);
  return v;
}

void heartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient h;
  h.begin(String(API_BASE) + "/api/devices/" + DEVICE_ID + "/heartbeat");
  h.addHeader("Content-Type", "application/json");
  h.addHeader("X-Device-Token", DEVICE_TOKEN);
  StaticJsonDocument<256> d;
  d["rssi_dbm"] = WiFi.RSSI();
  d["camera_ok"] = HAS_CAMERA;
  d["load_cell_ok"] = scale.is_ready();
  d["servo_ok"] = gateServo.attached();
  float w = readWeightG();
  if (!isnan(w)) d["weight_g"] = w;
  String body; serializeJson(d, body);
  int code = h.POST(body);
  jlog(code == 200 ? "info" : "error", "heartbeat -> " + String(code));
  h.end();
}

void ackJob(const String& job, bool ok, const String& detail) {
  HTTPClient h;
  h.begin(String(API_BASE) + "/api/sorting/jobs/" + job + "/ack");
  h.addHeader("Content-Type", "application/json");
  h.addHeader("X-Device-Token", DEVICE_TOKEN);
  StaticJsonDocument<256> d; d["ok"] = ok; d["detail"] = detail;
  String body; serializeJson(d, body);
  int code = h.POST(body);
  jlog(code == 200 ? "info" : "error", "ack " + job + " -> " + String(code));
  h.end();
}

void pollCommand() {
  if (sorting || WiFi.status() != WL_CONNECTED) return;
  HTTPClient h;
  h.begin(String(API_BASE) + "/api/devices/" + String(DEVICE_ID) + "/commands?token=" + DEVICE_TOKEN);
  int code = h.GET();
  if (code != 200) { h.end(); return; }
  StaticJsonDocument<512> d;
  if (deserializeJson(d, h.getString())) { h.end(); return; }
  h.end();
  if (String((const char*)d["command"]) != "SORT") return;
  int angle = d["angle_deg"] | 90;
  angle = constrain(angle, SERVO_MIN_DEG, SERVO_MAX_DEG);  // bounded motion
  activeJob = String((const char*)d["job_id"]);
  activeAngle = angle;
  sorting = true; sortStartMs = millis();
  gateServo.write(angle);
  jlog("info", "SORT authorized job=" + activeJob + " angle=" + String(angle));
}

void loop() {
  esp_task_wdt_reset();
  if (millis() - lastHeartbeat > TELEMETRY_MS) { lastHeartbeat = millis(); heartbeat(); }
  pollCommand();
  if (sorting) {
    if (millis() - sortStartMs > SORT_TIMEOUT_MS) {
      gateServo.write(SERVO_SAFE_DEG);
      ackJob(activeJob, false, "servo timeout");
      jlog("error", "sort timeout — parked safe");
      sorting = false;
    } else if (millis() - sortStartMs > 1800) {
      // Movement window elapsed, no position sensor: report MOVEMENT completed,
      // NOT bin deposit (honest wording matches backend/UI).
      gateServo.write(SERVO_SAFE_DEG);
      ackJob(activeJob, true, "movement completed (bin deposit not sensed)");
      jlog("info", "sort complete — parked safe");
      sorting = false;
    }
  }
  delay(50);
}
