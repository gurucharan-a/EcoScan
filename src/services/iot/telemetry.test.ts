import { describe, expect, it } from "vitest";
import { readTelemetry } from "./telemetry";

describe("simulated telemetry", () => {
  it("is deterministic within a 5-minute bucket", () => {
    const now = 1700000000000;
    const a = readTelemetry("m-104", "OPERATIONAL", now);
    const b = readTelemetry("m-104", "OPERATIONAL", now + 60000);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.simulated).toBe(true);
    expect(a.metrics.map((m) => m.key)).toEqual(["temp", "vibration", "pressure", "current"]);
  });
  it("DOWN machines read hotter than operational ones", () => {
    const now = 1700000000000;
    const down = readTelemetry("m-104", "DOWN", now);
    const ok = readTelemetry("m-104", "OPERATIONAL", now);
    const temp = (r: typeof down) => r.metrics.find((m) => m.key === "temp")!.value;
    expect(temp(down)).toBeGreaterThan(temp(ok));
  });
  it("labels threshold breaches without side effects", () => {
    const now = 1700000000000;
    const r = readTelemetry("m-104", "DOWN", now);
    expect(["NORMAL", "WARNING", "CRITICAL"]).toContain(r.overall);
    for (const m of r.metrics) {
      expect(m.state).toBe(m.value >= m.critAt ? "CRITICAL" : m.value >= m.warnAt ? "WARNING" : "NORMAL");
    }
  });
});
