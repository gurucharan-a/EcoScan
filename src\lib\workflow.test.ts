import { describe, expect, it } from "vitest";
import { canTransition, assertFresh } from "./stateMachine";
import { slaElapsedRatio, isOnSite } from "./geo";
import { scoreTechnician, rankTechnicians } from "./allocation";
import { validateRequest } from "./validation";
import type { Machine, ServiceRequest, Technician } from "@/types";

const site = { id: "site-a", name: "Site A", code: "GND", lat: 13.0067, lng: 80.2206, address: "x" };

function tech(over: Partial<Technician> = {}): Technician {
  return {
    id: "t-x", userId: "u", name: "T", siteId: "site-a",
    skills: ["electrical"], certifications: [], lat: 13.01, lng: 80.225,
    online: true, currentLoad: 0.2, availability: 0.9, ...over,
  };
}

function req(over: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: "r-x", code: "SR-1", machineId: "m-104", siteId: "site-a",
    title: "t", description: "d", priority: "P2",
    requiredSkills: ["electrical"], requiredParts: [],
    status: "APPROVED", slaDeadline: new Date().toISOString(),
    createdBy: "u", createdAt: new Date().toISOString(), ...over,
  };
}

describe("state machine", () => {
  it("allows the core lifecycle", () => {
    expect(canTransition("CREATED", "VALIDATED")).toBe(true);
    expect(canTransition("PENDING_APPROVAL", "APPROVED")).toBe(true);
    expect(canTransition("ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("PENDING_VERIFICATION", "CLOSED")).toBe(true);
  });
  it("supports reject / cancel / resubmit / reopen", () => {
    expect(canTransition("PENDING_APPROVAL", "REJECTED")).toBe(true);
    expect(canTransition("REJECTED", "PENDING_APPROVAL")).toBe(true);
    expect(canTransition("ASSIGNED", "CANCELLED")).toBe(true);
    expect(canTransition("CANCELLED", "CREATED")).toBe(true);
  });
  it("rejects illegal jumps", () => {
    expect(canTransition("CREATED", "CLOSED")).toBe(false);
    expect(canTransition("CLOSED", "IN_PROGRESS")).toBe(false);
  });
  it("optimistic lock passes fresh revs and rejects stale ones", () => {
    expect(() => assertFresh(3, undefined, "SR-1")).not.toThrow();
    expect(() => assertFresh(3, 3, "SR-1")).not.toThrow();
    expect(() => assertFresh(4, 3, "SR-1")).toThrow(/changed underneath/);
    expect(() => assertFresh(undefined, 0, "SR-1")).not.toThrow();
  });
});

describe("sla + geofence math", () => {
  it("elapsed ratio passes 1.0 after deadline", () => {
    const created = new Date(Date.now() - 5 * 3600000).toISOString();
    const deadline = new Date(Date.now() - 3600000).toISOString();
    expect(slaElapsedRatio(created, deadline)).toBeGreaterThanOrEqual(1);
  });
  it("detects site presence inside the 3.2km fence", () => {
    expect(isOnSite(13.0067, 80.2206, 13.0067, 80.2206)).toBe(true);
    expect(isOnSite(14.0, 81.0, 13.0067, 80.2206)).toBe(false);
  });
});

describe("allocation", () => {
  it("prefers full skill match; offline techs score zero availability", () => {
    const r = req({ requiredSkills: ["electrical", "plc"] });
    const skilled = tech({ id: "skilled", skills: ["electrical", "plc"] });
    const partial = tech({ id: "partial", skills: ["electrical"] });
    expect(scoreTechnician(skilled, r, site).total).toBeGreaterThan(scoreTechnician(partial, r, site).total);
    const ranked = rankTechnicians(r, [partial, skilled], site);
    expect(ranked[0].tech.id).toBe("skilled");
    // the store's rank() gates candidates on online; the engine zeroes their availability
    expect(scoreTechnician(tech({ online: false }), r, site).availability).toBe(0);
  });
  it("ranks best first", () => {
    const r = req({ requiredSkills: ["electrical"] });
    const ranked = rankTechnicians(r, [tech({ currentLoad: 0.9 }), tech({ currentLoad: 0.1 })], site);
    expect(ranked[0].tech.currentLoad).toBe(0.1);
  });
});

describe("validation", () => {
  it("fails unknown machines and passes healthy ones", () => {
    expect(validateRequest({ requiredParts: [], inventory: [] }).overall).toBe("fail");
    const ok = validateRequest({
      machine: { id: "m", code: "M-1", name: "N", siteId: "site-a", status: "OPERATIONAL", eligible: true, warrantyActive: true, contractActive: true, skills: ["electrical"] },
      site, priority: "P2", requiredParts: [], inventory: [],
    });
    expect(ok.overall).toBe("pass");
  });
  it("warns on partial stock and fails on zero stock", () => {
    const machine: Machine = { id: "m", code: "M-1", name: "N", siteId: "site-a", status: "OPERATIONAL", eligible: true, warrantyActive: true, contractActive: true, skills: ["electrical"] };
    const partial = validateRequest({
      machine, site, priority: "P2",
      requiredParts: [{ sku: "X", qty: 2 }],
      inventory: [{ id: "p", sku: "X", name: "X", qty: 1, reservedQty: 0, siteId: "site-a", unitCost: 1 }],
    });
    expect(partial.overall).toBe("warn");
    const empty = validateRequest({
      machine, site, priority: "P2",
      requiredParts: [{ sku: "X", qty: 2 }],
      inventory: [{ id: "p", sku: "X", name: "X", qty: 0, reservedQty: 0, siteId: "site-a", unitCost: 1 }],
    });
    expect(empty.overall).toBe("fail");
  });
});
