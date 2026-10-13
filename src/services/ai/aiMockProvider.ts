/**
 * MockAIProvider — deterministic offline stand-in for a real AI service.
 * Every response is derived from live SERVICEGRID data (machine, request,
 * history, technician stats), so each ticket gets a distinct, plausible answer.
 * No network calls. No API key. Replace with RealAIProvider later.
 */
import type { AIProvider, AISeverity, AIRisk } from "./aiTypes";

interface Profile {
  match: RegExp;
  issue: (m: string) => string;
  causes: string[];
  checks: string[];
  parts: string[];
  repair: [number, number];
  component: string;
  maintenanceAction: string;
}

const PROFILES: Profile[] = [
  {
    match: /conveyor|belt|roller/i,
    issue: (m) => `${m} drive motor / electrical fault`,
    causes: ["Motor overload trip", "Electrical connection fault", "Drive component failure", "Conveyor bearing resistance"],
    checks: ["Check motor power supply", "Inspect electrical connections", "Check motor temperature", "Inspect conveyor bearings", "Check PLC fault codes"],
    parts: ["CNV-RLR", "BELT-V88", "FUSE-10A"],
    repair: [60, 90],
    component: "Conveyor drive / bearing assembly",
    maintenanceAction: "Schedule preventive conveyor inspection.",
  },
  {
    match: /hydraulic|pressure|oil leak|cylinder|seal/i,
    issue: (m) => `${m} hydraulic pressure fault`,
    causes: ["Seal wear / oil leak", "Pump cavitation", "Contaminated hydraulic fluid", "Pressure relief valve drift"],
    checks: ["Inspect seals and fittings for leaks", "Check hydraulic oil level and ISO grade", "Read pump pressure at test port", "Inspect filter clogging indicator", "Verify relief valve setting"],
    parts: ["SEAL-KIT", "FLT-200", "OIL-ISO46"],
    repair: [90, 150],
    component: "Hydraulic pump / seal kit",
    maintenanceAction: "Schedule hydraulic fluid analysis and seal inspection.",
  },
  {
    match: /compressor|pneumatic|air pressure|air filter/i,
    issue: (m) => `${m} air delivery fault`,
    causes: ["Clogged air filter element", "Pneumatic valve leak", "Pressure switch miscalibration", "Compressor overheating"],
    checks: ["Inspect air filter element", "Leak-test pneumatic valves", "Verify pressure switch setpoints", "Check compressor oil and temperature", "Drain condensate traps"],
    parts: ["FLT-GA75", "VALVE-P4", "SNSR-T100"],
    repair: [45, 75],
    component: "Air filter / pneumatic valve train",
    maintenanceAction: "Schedule filter replacement and leak survey.",
  },
  {
    match: /vibration|bearing|spindle|noise/i,
    issue: (m) => `${m} bearing / vibration fault`,
    causes: ["Bearing wear (6205 class)", "Spindle imbalance", "Loose mounting / foundation", "Lubrication breakdown"],
    checks: ["Measure vibration spectrum", "Inspect bearing play and noise", "Check mounting bolt torque", "Verify lubrication schedule", "Review spindle load history"],
    parts: ["BRG-6205", "SNSR-T100"],
    repair: [75, 120],
    component: "Spindle bearing set",
    maintenanceAction: "Schedule vibration trending and bearing replacement.",
  },
  {
    match: /plc|calibration|robot|weld|arm/i,
    issue: (m) => `${m} control / calibration drift`,
    causes: ["Encoder / calibration drift", "PLC I/O module fault", "Program parameter deviation", "Servo drive tuning drift"],
    checks: ["Read PLC fault codes", "Verify encoder feedback", "Re-run calibration routine", "Inspect I/O module status LEDs", "Compare program parameters to baseline"],
    parts: ["PLC-IO8", "SNSR-T100"],
    repair: [60, 120],
    component: "PLC I/O / encoder assembly",
    maintenanceAction: "Schedule calibration verification and backup.",
  },
  {
    match: /cool|chill|temperature|temp/i,
    issue: (m) => `${m} cooling performance fault`,
    causes: ["Refrigerant undercharge", "Condenser fouling", "Temperature sensor drift", "Circulation pump wear"],
    checks: ["Verify temperature sensor reading", "Inspect condenser coils", "Check refrigerant pressures", "Verify pump flow rate", "Review cooling load trend"],
    parts: ["SNSR-T100", "FLT-200"],
    repair: [45, 90],
    component: "Cooling circuit / sensor loop",
    maintenanceAction: "Schedule coil cleaning and sensor calibration.",
  },
  {
    match: /electrical|fuse|motor|wiring|power|generator/i,
    issue: (m) => `${m} electrical fault`,
    causes: ["Blown protection fuse", "Wiring insulation breakdown", "Motor winding degradation", "Loose terminal connection"],
    checks: ["Megger-test motor windings", "Inspect fuse and breaker status", "Thermal-scan terminals", "Verify supply voltage balance", "Check earthing continuity"],
    parts: ["FUSE-10A", "SNSR-T100"],
    repair: [45, 90],
    component: "Motor / protection circuit",
    maintenanceAction: "Schedule thermography and insulation testing.",
  },
  {
    match: /boiler|pump|valve|mould|moulder|lathe|press|packaging/i,
    issue: (m) => `${m} mechanical wear fault`,
    causes: ["Component wear beyond tolerance", "Lubrication interval exceeded", "Fastener fatigue", "Alignment drift"],
    checks: ["Inspect wear surfaces", "Verify lubrication records", "Check alignment and clearances", "Review duty-cycle logs", "Torque-check critical fasteners"],
    parts: ["SEAL-KIT", "BRG-6205"],
    repair: [60, 120],
    component: "Mechanical wear assembly",
    maintenanceAction: "Schedule preventive mechanical inspection.",
  },
];

const GENERIC: Profile = {
  match: /.*/i,
  issue: (m) => `${m} functional fault`,
  causes: ["Component wear", "Electrical supply anomaly", "Control parameter drift", "Environmental stress"],
  checks: ["Reproduce and isolate the fault", "Check power and connections", "Review recent service history", "Inspect wear components", "Verify control setpoints"],
  parts: ["SNSR-T100"],
  repair: [45, 90],
  component: "General service assembly",
  maintenanceAction: "Schedule routine preventive inspection.",
};

function pickProfile(hay: string): Profile {
  return PROFILES.find((p) => p.match.test(hay)) ?? GENERIC;
}

/** Deterministic 0..1 hash for stable mock confidence values. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function severityFor(priority: string): AISeverity {
  if (priority === "P1") return "Critical";
  if (priority === "P2") return "High";
  if (priority === "P3") return "Medium";
  return "Low";
}

function fmtDowntime(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export const MockAIProvider: AIProvider = {
  id: "mock",

  diagnose(input) {
    const hay = `${input.title} ${input.description} ${input.skills.join(" ")} ${input.machineName}`;
    const p = pickProfile(hay);
    const parts = [...input.requiredParts.map((x) => x.sku)];
    for (const sku of p.parts) if (!parts.includes(sku) && parts.length < 4) parts.push(sku);
    const conf = 84 + Math.round(hash01(input.requestCode + input.machineCode) * 12); // 84-96
    return {
      requestCode: input.requestCode,
      machineCode: input.machineCode,
      likelyIssue: p.issue(input.machineName),
      confidence: conf,
      severity: severityFor(input.priority),
      causes: p.causes,
      checks: p.checks,
      parts,
      repairMins: p.repair,
    };
  },

  recommend(input) {
    if (input.candidates.length === 0) return null;
    const sorted = [...input.candidates].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const alt = sorted[1] ?? null;
    const eta = input.etaByTechId[top.techId] ?? null;
    const why: string[] = [
      `${Math.round(top.skillMatch * 100)}% skill compatibility${input.requiredSkills.length ? ` (${input.requiredSkills.slice(0, 3).join(", ")})` : ""}`,
    ];
    if (top.certifications.length > 0) why.push(`${top.certifications[0]} certified`);
    why.push(top.online ? "Currently online" : "Currently offline — dispatch may need confirmation");
    why.push(top.workload < 0.4 ? `Low workload (${Math.round(top.workload * 100)}%)` : `Workload ${Math.round(top.workload * 100)}% — monitor for overload`);
    if (top.completedJobs > 0) why.push(`${top.completedJobs} prior jobs on record`);
    else why.push("Fresh capacity — available for immediate dispatch");
    if (eta) why.push(`Estimated arrival: ${eta.mins} min by road (${eta.km.toFixed(1)} km)`);
    why.push("Best combined allocation score in the existing ranking");
    const conf = 88 + Math.round(hash01(input.requestCode + top.techId) * 8); // 88-96
    return {
      requestCode: input.requestCode,
      recommendedTechId: top.techId,
      recommendedName: top.name,
      why,
      confidence: conf,
      alternativeTechId: alt ? alt.techId : null,
      alternativeName: alt ? alt.name : null,
      etaMin: eta ? eta.mins : null,
      distanceKm: eta ? Math.round(eta.km * 10) / 10 : null,
      skillPct: Math.round(top.skillMatch * 100),
    };
  },

  predict(input) {
    const open = input.history.filter((h) => !["CLOSED"].includes(h.status));
    const p1 = input.history.filter((h) => h.priority === "P1").length;
    const recent = input.history.filter((h) => Date.now() - new Date(h.createdAt).getTime() < 7 * 86400000).length;
    let risk = 8 + open.length * 12 + p1 * 8 + recent * 6;
    if (input.machineStatus === "DOWN") risk += 30;
    else if (input.machineStatus === "DEGRADED") risk += 15;
    else if (input.machineStatus === "MAINTENANCE") risk += 8;
    risk = Math.min(97, risk);
    const health = Math.max(3, 100 - risk);
    const band: AIRisk = risk >= 75 ? "CRITICAL" : risk >= 55 ? "HIGH" : risk >= 35 ? "MEDIUM-HIGH" : risk >= 18 ? "MEDIUM" : "LOW";
    const windowDays = band === "CRITICAL" ? 7 : band === "HIGH" ? 10 : band === "MEDIUM-HIGH" ? 14 : band === "MEDIUM" ? 30 : 90;
    const hay = `${input.machineName} ${input.skills.join(" ")}`;
    const p = pickProfile(hay);
    const reasoning: string[] = [];
    if (input.history.length > 0) reasoning.push(`${input.history.length} service event${input.history.length === 1 ? "" : "s"} on record`);
    if (open.length > 0) reasoning.push(`${open.length} open request${open.length === 1 ? "" : "s"} outstanding`);
    if (p1 > 0) reasoning.push(`${p1} critical-priority event${p1 === 1 ? "" : "s"} in history`);
    if (recent > 0) reasoning.push(`${recent} event${recent === 1 ? "" : "s"} in the last 7 days — rising frequency`);
    if (input.machineStatus !== "OPERATIONAL") reasoning.push(`Equipment currently ${input.machineStatus}`);
    if (reasoning.length === 0) reasoning.push("No adverse service history — routine interval applies");
    reasoning.push("Component service interval approaching");
    return {
      machineId: input.machineId,
      machineName: input.machineName,
      healthScore: health,
      risk: band,
      windowDays,
      windowLabel: band === "LOW" ? "Routine window (90 days)" : `Within ${windowDays} days`,
      likelyComponent: p.component,
      reasoning,
      action: p.maintenanceAction,
    };
  },

  summarize(input) {
    const hay = `${input.title} ${input.description} ${input.notes.join(" ")}`;
    const p = pickProfile(hay);
    const first = input.notes[0] ?? input.description;
    return {
      requestCode: input.requestCode,
      issue: input.title.length > 90 ? input.title.slice(0, 90) + "…" : input.title,
      rootCause: p.causes[0],
      actionTaken: first.length > 140 ? first.slice(0, 140) + "…" : first,
      partsUsed: input.parts.map((x) => `${x.sku} × ${x.qty}`),
      downtime: fmtDowntime(Date.now() - new Date(input.createdAt).getTime()),
      condition: input.machineStatus === "OPERATIONAL" ? "Operational" : input.machineStatus ? `Attention — ${input.machineStatus}` : "Unverified",
      recommendation: p.maintenanceAction,
    };
  },
};
