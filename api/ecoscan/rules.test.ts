import { describe, expect, it } from "vitest";
import { assertTransition, decodeRec, encodeRec, FLOW, ruleKind, SERVO_ANGLE } from "./_rules.js";

describe("server rule engine parity (api/ecoscan/_rules.ts)", () => {
  it("matches the frontend engine on key cases", () => {
    expect(ruleKind({ category: "unknown", confidence: 0.9, condition: "powers_on", swollen: false })[0]).toBe("MANUAL_REVIEW");
    expect(ruleKind({ category: "mobile_phone", confidence: 0.3, condition: "powers_on", swollen: false })[0]).toBe("MANUAL_REVIEW");
    expect(ruleKind({ category: "mobile_phone", confidence: 0.95, condition: "powers_on", swollen: true })[0]).toBe("HAZARDOUS");
    expect(ruleKind({ category: "battery", confidence: 0.9, condition: "untested", swollen: false })).toEqual(["HAZARDOUS", "HAZARDOUS_BIN"]);
    expect(ruleKind({ category: "remote_control", confidence: 0.9, condition: "powers_on", swollen: false })[0]).toBe("REUSE");
    expect(ruleKind({ category: "cable", confidence: 0.9, condition: "untested", swollen: false })[0]).toBe("RECYCLE");
  });
  it("encodes/decodes recommendations with rule version", () => {
    const enc = encodeRec("REUSE", "REUSE_BIN");
    expect(enc).toMatch(/^REUSE\|REUSE_BIN\|rules-/);
    expect(decodeRec(enc)).toEqual({ kind: "REUSE", dest: "REUSE_BIN", rule: expect.stringMatching(/^rules-/) });
    expect(decodeRec(null)).toBeNull();
  });
  it("enforces the scan state machine", () => {
    expect(() => assertTransition("READY_TO_SORT", "SORTING")).not.toThrow();
    expect(() => assertTransition("IDLE", "SORT_COMPLETE")).toThrow();
    expect(FLOW.SORTING).toContain("SORT_COMPLETE");
  });
  it("maps every destination to a bounded servo angle", () => {
    for (const d of ["REUSE_BIN", "REPAIR_BIN", "RECYCLE_BIN", "HAZARDOUS_BIN", "QUARANTINE"]) {
      expect(SERVO_ANGLE[d]).toBeGreaterThanOrEqual(20);
      expect(SERVO_ANGLE[d]).toBeLessThanOrEqual(160);
    }
  });
});
