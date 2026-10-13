import { describe, expect, it } from "vitest";
import { recommend } from "@/ecoscan/lib/recommendation";
import { canScanTransition } from "@/ecoscan/types";
import { classifyImage } from "@/ecoscan/lib/classifier";
import { summarize, DEFAULT_FACTORS } from "@/ecoscan/lib/sustainability";
import { estimateComponents } from "@/ecoscan/lib/ecoUtils";

describe("recommendation engine (rules-v1.2.0)", () => {
  it("quarantines low-confidence predictions", () => {
    const r = recommend({ category: "mobile_phone", confidence: 0.3, operatingCondition: "powers_on", visibleDamage: "", batteryPresent: false, batterySwollen: false, weightG: 150, repairCostInr: null, newPriceInr: null });
    expect(r.kind).toBe("MANUAL_REVIEW");
    expect(r.destination).toBe("QUARANTINE");
  });
  it("routes swollen batteries to hazardous regardless of other signals", () => {
    const r = recommend({ category: "mobile_phone", confidence: 0.95, operatingCondition: "powers_on", visibleDamage: "", batteryPresent: true, batterySwollen: true, weightG: 150, repairCostInr: null, newPriceInr: null });
    expect(r.kind).toBe("HAZARDOUS");
    expect(r.destination).toBe("HAZARDOUS_BIN");
  });
  it("recommends reuse for working devices", () => {
    const r = recommend({ category: "remote_control", confidence: 0.9, operatingCondition: "powers_on", visibleDamage: "minor scuff", batteryPresent: false, batterySwollen: false, weightG: 82, repairCostInr: null, newPriceInr: null });
    expect(r.kind).toBe("REUSE");
  });
  it("recycles when repair costs exceed 60% of new", () => {
    const r = recommend({ category: "laptop", confidence: 0.9, operatingCondition: "dead", visibleDamage: "", batteryPresent: true, batterySwollen: false, weightG: 1800, repairCostInr: 30000, newPriceInr: 40000 });
    expect(r.kind).toBe("RECYCLE");
  });
  it("keeps rule version on every result", () => {
    const r = recommend({ category: "cable", confidence: 0.9, operatingCondition: "untested", visibleDamage: "", batteryPresent: false, batterySwollen: false, weightG: 100, repairCostInr: null, newPriceInr: null });
    expect(r.ruleVersion).toMatch(/^rules-/);
    expect(r.evidence.length).toBeGreaterThan(0);
  });
});

describe("scan state machine", () => {
  it("rejects illegal transitions", () => {
    expect(canScanTransition("IDLE", "SORT_COMPLETE")).toBe(false);
    expect(canScanTransition("READY_TO_SORT", "SORTING")).toBe(true);
    expect(canScanTransition("SORTING", "SORT_COMPLETE")).toBe(true);
  });
});

describe("mock classifier honesty", () => {
  it("returns unknown with low confidence for unrecognized names", async () => {
    const r = await classifyImage("data:,x", { fileName: "qxzv_blur.png" });
    expect(r.category).toBe("unknown");
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.simulated).toBe(true);
  });
  it("never claims to be a trained model", async () => {
    const r = await classifyImage("data:,x", { fileName: "phone_demo.jpg" });
    expect(r.provider).not.toBe("onnx");
    expect(r.simulated).toBe(true);
  });
});

describe("sustainability math", () => {
  it("computes diverted mass and CO2 with disclosed method", () => {
    const s = summarize([
      { category: "cable", weightG: 1000, recommendationKind: "RECYCLE" },
      { category: "unknown", weightG: 500, recommendationKind: "MANUAL_REVIEW" },
    ], DEFAULT_FACTORS);
    expect(s.totalMassKg).toBeCloseTo(1.5);
    expect(s.divertedKg).toBeCloseTo(1.0);
    expect(s.co2AvoidedKg).toBeCloseTo(1.8);
  });
});

describe("component estimates", () => {
  it("never fabricates mass for qualitative rows", () => {
    const rows = estimateComponents("remote_control", 100);
    const qual = rows.filter((r) => r.confidence === "qualitative");
    expect(qual.length).toBeGreaterThan(0);
    expect(qual.every((r) => r.estimatedMassG === null)).toBe(true);
    const massed = rows.filter((r) => r.estimatedMassG != null);
    const sum = massed.reduce((a, r) => a + (r.estimatedMassG ?? 0), 0);
    expect(sum).toBeGreaterThan(0);
    expect(sum).toBeLessThanOrEqual(100);
  });
});
