import { describe, expect, it } from "vitest";
import { diagnoseFault, recommendTechnician, predictMaintenance, generateServiceSummary } from "./aiService";
import { answerAssistant, type AssistantDB } from "./assistant";

const db: AssistantDB = {
  sites: [{ id: "site-a", name: "Site A — Guindy Plant", code: "GND", lat: 13.0067, lng: 80.2206 }],
  machines: [{ id: "m-104", code: "M-104", name: "Conveyor Line C-4", siteId: "site-a", status: "DOWN" }],
  techs: [
    { id: "t-1", name: "Asha", siteId: "site-a", lat: 13.01, lng: 80.225, online: true, currentLoad: 0.2, skills: ["electrical", "conveyor", "plc"], availability: 0.9 },
    { id: "t-2", name: "Ravi", siteId: "site-a", lat: 13.0, lng: 80.21, online: false, currentLoad: 0.1, skills: ["electrical"], availability: 0.9 },
  ],
  requests: [
    { id: "r-1", code: "SR-1042", machineId: "m-104", siteId: "site-a", title: "Conveyor stopped, motor noise", priority: "P1", status: "IN_PROGRESS", createdAt: new Date(Date.now() - 4 * 3600000).toISOString(), slaDeadline: new Date(Date.now() + 3600000).toISOString() },
  ],
  assignments: [{ requestId: "r-1", technicianId: "t-1", active: true }],
  parts: [{ sku: "BELT-V88", qty: 0, reservedQty: 0, siteId: "site-a" }],
  exceptions: [{ requestId: "r-1", type: "SLA_BREACH", message: "late", resolved: false }],
};

describe("mock AI", () => {
  it("diagnoses conveyor faults deterministically", () => {
    const a = diagnoseFault({ requestCode: "SR-1", title: "Conveyor stopped", description: "motor noise", priority: "P1", machineCode: "M-104", machineName: "Conveyor Line C-4", machineStatus: "DOWN", skills: ["conveyor"], requiredParts: [] });
    const b = diagnoseFault({ requestCode: "SR-1", title: "Conveyor stopped", description: "motor noise", priority: "P1", machineCode: "M-104", machineName: "Conveyor Line C-4", machineStatus: "DOWN", skills: ["conveyor"], requiredParts: [] });
    expect(a).toEqual(b);
    expect(a.likelyIssue).toMatch(/conveyor/i);
    expect(a.severity).toBe("Critical");
    expect(a.confidence).toBeGreaterThanOrEqual(84);
  });
  it("recommends the best-ranked technician without assigning", () => {
    const rec = recommendTechnician({
      requestCode: "SR-1", requiredSkills: ["electrical"],
      candidates: [
        { techId: "t-2", name: "Ravi", skills: ["electrical"], certifications: [], online: false, availability: 0.9, workload: 0.1, score: 0.5, skillMatch: 1, completedJobs: 0 },
        { techId: "t-1", name: "Asha", skills: ["electrical", "plc"], certifications: ["PLC-L2"], online: true, availability: 0.9, workload: 0.2, score: 0.9, skillMatch: 1, completedJobs: 3 },
      ],
      etaByTechId: { "t-1": { mins: 12, km: 4.2 } },
    });
    expect(rec?.recommendedTechId).toBe("t-1");
    expect(rec?.etaMin).toBe(12);
  });
  it("flags down machines as high risk", () => {
    const p = predictMaintenance({ machineId: "m-104", machineName: "Conveyor", machineStatus: "DOWN", skills: [], history: [{ status: "IN_PROGRESS", priority: "P1", createdAt: new Date().toISOString() }] });
    expect(["HIGH", "CRITICAL", "MEDIUM-HIGH"]).toContain(p.risk);
  });
  it("summarizes notes without mutating", () => {
    const s = generateServiceSummary({ requestCode: "SR-1", title: "T", description: "D", priority: "P1", machineName: "M", notes: ["Checked motor"], parts: [{ sku: "X", qty: 1 }], assignedTechName: "Asha", createdAt: new Date(Date.now() - 7200000).toISOString() });
    expect(s.downtime).toMatch(/2h/);
    expect(s.partsUsed).toEqual(["X × 1"]);
  });
});

describe("assistant", () => {
  it("reports request status with blockers", () => {
    expect(answerAssistant("Why is SR-1042 delayed?", db)).toMatch(/IN PROGRESS|late/);
  });
  it("lists at-risk and breached codes", () => {
    expect(answerAssistant("Which requests are at risk?", db)).toMatch(/SR-1042/);
  });
  it("ranks techs near a named site", () => {
    expect(answerAssistant("Which technicians are available near Guindy?", db)).toMatch(/Asha/);
  });
  it("names the worst machine and missing stock", () => {
    expect(answerAssistant("Which machine has the most failures?", db)).toMatch(/M-104/);
    expect(answerAssistant("Which resources are unavailable?", db)).toMatch(/BELT-V88/);
  });
  it("never invents unknown records", () => {
    expect(answerAssistant("status of SR-9999?", db)).toMatch(/can't find/);
  });
});
