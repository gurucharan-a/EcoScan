/**
 * Simulated machine telemetry (DEMO ONLY — clearly labeled in UI).
 * Deterministic pseudo-live readings: stable within a 5-minute bucket so
 * panels don't flicker, drifting slowly over time. Threshold breaches are
 * meant to be routed into the EXISTING emergency-request workflow via
 * store.iotAlert() — this module never creates requests itself.
 */

export interface TelemetryMetric {
  key: string;
  label: string;
  unit: string;
  value: number;
  warnAt: number;
  critAt: number;
  state: "NORMAL" | "WARNING" | "CRITICAL";
}

export interface TelemetryReading {
  machineId: string;
  at: string;
  simulated: true;
  metrics: TelemetryMetric[];
  overall: "NORMAL" | "WARNING" | "CRITICAL";
}

interface Spec {
  key: string;
  label: string;
  unit: string;
  base: number;
  amp: number;
  warnAt: number;
  critAt: number;
  decimals: number;
}

const SPECS: Spec[] = [
  { key: "temp", label: "Temperature", unit: "°C", base: 68, amp: 9, warnAt: 85, critAt: 100, decimals: 1 },
  { key: "vibration", label: "Vibration", unit: "mm/s", base: 2.4, amp: 1.1, warnAt: 4.5, critAt: 7.0, decimals: 1 },
  { key: "pressure", label: "Pressure", unit: "PSI", base: 78, amp: 8, warnAt: 95, critAt: 110, decimals: 0 },
  { key: "current", label: "Motor current", unit: "A", base: 13.1, amp: 1.8, warnAt: 16, critAt: 19, decimals: 1 },
];

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** Down machines read hot — the simulation reflects known equipment state. */
function stateBias(status: string): number {
  if (status === "DOWN") return 1.6;
  if (status === "DEGRADED") return 0.8;
  if (status === "MAINTENANCE") return 0.3;
  return 0;
}

export function readTelemetry(machineId: string, machineStatus = "OPERATIONAL", nowMs = Date.now()): TelemetryReading {
  const bucket = Math.floor(nowMs / 300000); // 5-minute stability window
  const bias = stateBias(machineStatus);
  const metrics = SPECS.map((s, i) => {
    const phase = hash01(`${machineId}:${s.key}`) * Math.PI * 2;
    const wave = Math.sin(nowMs / 3600000 / (2 + i) + phase);
    const jitter = (hash01(`${machineId}:${s.key}:${bucket}`) - 0.5) * s.amp * 0.6;
    const raw = s.base + wave * s.amp * 0.5 + jitter + bias * s.amp * 0.9;
    const value = Math.round(raw * Math.pow(10, s.decimals)) / Math.pow(10, s.decimals);
    const state: TelemetryMetric["state"] = value >= s.critAt ? "CRITICAL" : value >= s.warnAt ? "WARNING" : "NORMAL";
    return { key: s.key, label: s.label, unit: s.unit, value, warnAt: s.warnAt, critAt: s.critAt, state };
  });
  const overall = metrics.some((m) => m.state === "CRITICAL")
    ? "CRITICAL"
    : metrics.some((m) => m.state === "WARNING") ? "WARNING" : "NORMAL";
  return { machineId, at: new Date(nowMs).toISOString(), simulated: true, metrics, overall };
}
