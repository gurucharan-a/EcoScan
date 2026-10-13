// EcoScan store: persistent local database (localStorage) + explicit scan state
// machine + sorting job lifecycle + alerts + audit. API-identical to backend/app
// (FastAPI) endpoints so the frontend can swap transports via VITE_ECOSCAN_API_URL.
import { useSyncExternalStore } from "react";
import type {
  Alert, AuditEvent, Bin, DeviceCategory, EcoDB, EcoSettings,
  RecommendationKind, Scan, ScanStatus, SensorReading, SortDestination, SortingJob,
} from "@/ecoscan/types";
import { assertScanTransition } from "@/ecoscan/types";
import { MATERIAL_PROFILES } from "@/ecoscan/data/materialProfiles";
import { recommend, DEFAULT_DEST_MAP, RULE_VERSION } from "@/ecoscan/lib/recommendation";
import { MODEL_VERSION } from "@/ecoscan/lib/classifier";

const KEY = "ecoscan-db-v1";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
const now = () => new Date().toISOString();

function defaults(): EcoDB {
  return {
    version: 1,
    scans: [], jobs: [], events: [],
    devices: [{
      id: "esp32-01", name: "Scanner Chamber 01", board: "ESP32-WROVER + OV2640",
      firmware: "eco-fw-v1.0.0", online: false, lastSeen: null, rssiDbm: null,
      camera: "unknown", loadCell: "unknown", servo: "unknown",
      mode: "simulated", telemetry: [], errors: [],
    }],
    bins: [
      { id: "bin-reuse", name: "Reuse", material: "Tested reusables", capacityL: 60, itemCount: 0, totalWeightG: 0, fillEstimated: 0, status: "COLLECTING", location: "Station A", batchId: null },
      { id: "bin-repair", name: "Repair", material: "Bench queue", capacityL: 60, itemCount: 0, totalWeightG: 0, fillEstimated: 0, status: "COLLECTING", location: "Station A", batchId: null },
      { id: "bin-recycle", name: "Recycling", material: "Authorized recycler stream", capacityL: 120, itemCount: 0, totalWeightG: 0, fillEstimated: 0, status: "COLLECTING", location: "Station A", batchId: null },
      { id: "bin-haz", name: "Hazardous", material: "Batteries / damaged", capacityL: 30, itemCount: 0, totalWeightG: 0, fillEstimated: 0, status: "COLLECTING", location: "Fire-safe cabinet", batchId: null },
      { id: "bin-quar", name: "Quarantine", material: "Manual review", capacityL: 40, itemCount: 0, totalWeightG: 0, fillEstimated: 0, status: "COLLECTING", location: "Review shelf", batchId: null },
    ],
    alerts: [], audit: [],
    profiles: MATERIAL_PROFILES,
    settings: {
      confidenceThreshold: 0.6, autoSortAllowed: false,
      destMap: { ...DEFAULT_DEST_MAP },
      co2PerKg: 1.8,
      co2Source: "Illustrative planning factor (see Sustainability page).",
      materialValuePerKg: 140,
      mode: "demo", apiUrl: "", deviceTokenPresent: false,
    },
    seq: 0,
  };
}

function load(): EcoDB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { const d = defaults(); localStorage.setItem(KEY, JSON.stringify(d)); return d; }
    const db = { ...defaults(), ...(JSON.parse(raw) as EcoDB) };
    return db;
  } catch { return defaults(); }
}

let db: EcoDB = typeof localStorage !== "undefined" ? load() : defaults();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota */ }
  emit();
}
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getDB(): EcoDB { return db; }
export function useEco(): EcoDB {
  return useSyncExternalStore(subscribe, () => db, () => db);
}

function audit(actor: string, action: string, entity: string, entityId: string, payload: unknown) {
  const e: AuditEvent = { id: uid("aud"), actor, action, entity, entityId, payload, at: now() };
  db.audit = [e, ...db.audit].slice(0, 500);
}
function alert(severity: Alert["severity"], title: string, body: string, extra?: Partial<Alert>) {
  const a: Alert = { id: uid("al"), severity, title, body, acked: false, resolved: false, at: now(), ...extra };
  db.alerts = [a, ...db.alerts].slice(0, 200);
  return a;
}
function nextCode(): string {
  db.seq += 1;
  return `EC-${String(db.seq).padStart(4, "0")}`;
}

// ---------- device / mode ----------
export function setMode(mode: "demo" | "hardware") {
  db.settings.mode = mode;
  const dev = db.devices[0];
  if (dev) dev.mode = mode === "demo" ? "simulated" : "hardware";
  audit("operator", "mode.change", "settings", "mode", { mode });
  save();
}
export function setDeviceOnline(online: boolean, telemetry?: Partial<SensorReading>) {
  const dev = db.devices[0];
  if (!dev) return;
  const was = dev.online;
  dev.online = online;
  dev.lastSeen = now();
  if (telemetry) {
    if (telemetry.rssiDbm != null) dev.rssiDbm = telemetry.rssiDbm;
    if (telemetry.cameraOk) dev.camera = "ok";
    if (telemetry.loadCellOk) dev.loadCell = "ok";
    if (telemetry.servoOk) dev.servo = "ok";
  }
  if (was && !online) {
    dev.errors.push({ msg: "Heartbeat lost — device offline", at: now() });
    alert("critical", "Device offline", `${dev.name} stopped sending heartbeats. Hardware actions are blocked.`, { deviceId: dev.id });
  }
  if (!was && online) alert("info", "Device online", `${dev.name} reconnected.`, { deviceId: dev.id });
  audit("device", "device.heartbeat", "device", dev.id, { online });
  save();
}

// ---------- scans ----------
export interface NewScanInput {
  name: string;
  imageDataUrl: string | null;
  imageName: string | null;
  weightG: number | null;
  weightSimulated: boolean;
  brand?: string; model?: string;
  visibleDamage?: string;
  operatingCondition?: Scan["operatingCondition"];
  batteryPresent?: boolean;
  batterySwollen?: boolean;
  deviceId?: string;
}

function duplicateCheck(imageName: string | null, weightG: number | null): Scan | null {
  if (!imageName && weightG == null) return null;
  return db.scans.find((s) =>
    (imageName && s.imageName === imageName) ||
    (weightG != null && s.weightG === weightG && Date.now() - new Date(s.createdAt).getTime() < 10 * 60 * 1000)
  ) ?? null;
}

export function createScan(input: NewScanInput): { scan: Scan; duplicateOf: Scan | null } {
  const code = nextCode();
  const scan: Scan = {
    id: uid("scan"), code,
    name: input.name || `Item ${code}`,
    category: "unknown", predictedCategory: "unknown", confidence: 0,
    modelVersion: MODEL_VERSION, inferenceSimulated: db.settings.mode === "demo",
    weightG: input.weightG, weightSimulated: input.weightSimulated,
    imageDataUrl: input.imageDataUrl, imageName: input.imageName,
    brand: input.brand, model: input.model,
    visibleDamage: input.visibleDamage ?? "",
    operatingCondition: input.operatingCondition ?? "untested",
    batteryPresent: input.batteryPresent ?? false,
    batterySwollen: input.batterySwollen ?? false,
    sensor: null, recommendation: null,
    status: "SCANNING", sortDestination: null, sortJobId: null,
    confirmed: false, confirmedCategory: null,
    createdAt: now(), updatedAt: now(),
    dataSources: ["user-upload", db.settings.mode === "demo" ? "simulated-sensors" : "device-telemetry"],
  };
  const dup = duplicateCheck(input.imageName, input.weightG);
  db.scans = [scan, ...db.scans];
  if (input.weightG != null && (input.weightG < 5 || input.weightG > 15000)) {
    alert("warning", "Unusual weight reading", `${code}: ${input.weightG} g is outside the typical 5 g – 15 kg chamber range. Check calibration.`, { scanId: scan.id });
  }
  audit("operator", "scan.create", "scan", scan.id, { code, weightG: input.weightG });
  save();
  return { scan, duplicateOf: dup };
}

export function setScanStatus(id: string, to: ScanStatus) {
  const s = db.scans.find((x) => x.id === id);
  if (!s) throw new Error("Scan not found");
  assertScanTransition(s.status, to);
  s.status = to; s.updatedAt = now();
  audit("system", "scan.transition", "scan", id, { to });
  save();
}

export function applyClassification(id: string, category: DeviceCategory, confidence: number, provider: "mock" | "heuristic" | "onnx" | "api", simulated: boolean) {
  const s = db.scans.find((x) => x.id === id);
  if (!s) throw new Error("Scan not found");
  assertScanTransition(s.status, "ANALYZING");
  s.status = "ANALYZING";
  s.predictedCategory = category; s.confidence = confidence;
  s.modelVersion = MODEL_VERSION; s.inferenceSimulated = simulated;
  if (!s.confirmed) s.category = category;
  s.updatedAt = now();
  // ANALYZING -> next
  const threshold = db.settings.confidenceThreshold;
  if (category === "unknown" || confidence < threshold) {
    s.status = "NEEDS_MANUAL_REVIEW";
    alert("warning", "Low classification confidence", `${s.code}: ${category} at ${(confidence * 100).toFixed(1)}% — manual review required.`, { scanId: s.id });
  } else {
    s.status = "AWAITING_CONFIRMATION";
  }
  audit("ai", "scan.classify", "scan", id, { category, confidence, provider, simulated });
  save();
}

export function runRecommendation(id: string, extra?: { repairCostInr?: number | null; newPriceInr?: number | null }) {
  const s = db.scans.find((x) => x.id === id);
  if (!s) throw new Error("Scan not found");
  const rec = recommend({
    category: s.confirmedCategory ?? s.category,
    confidence: s.confidence,
    operatingCondition: s.operatingCondition,
    visibleDamage: s.visibleDamage,
    batteryPresent: s.batteryPresent,
    batterySwollen: s.batterySwollen,
    weightG: s.weightG,
    repairCostInr: extra?.repairCostInr ?? null,
    newPriceInr: extra?.newPriceInr ?? null,
  }, db.settings.confidenceThreshold, db.settings.destMap);
  s.recommendation = rec;
  s.sortDestination = rec.destination;
  if (rec.kind === "MANUAL_REVIEW" && s.status !== "NEEDS_MANUAL_REVIEW") {
    try { assertScanTransition(s.status, "NEEDS_MANUAL_REVIEW"); s.status = "NEEDS_MANUAL_REVIEW"; } catch { /* stay */ }
  }
  if (rec.kind === "HAZARDOUS") {
    alert("critical", "Hazardous item detected", `${s.code}: ${rec.explanation}`, { scanId: s.id });
  }
  s.updatedAt = now();
  audit("system", "scan.recommend", "scan", id, { kind: rec.kind, ruleVersion: RULE_VERSION });
  save();
  return rec;
}

export function confirmScan(id: string, category: DeviceCategory | null, updates?: Partial<Pick<Scan, "name" | "brand" | "model" | "visibleDamage" | "operatingCondition" | "batteryPresent" | "batterySwollen" | "weightG">>) {
  const s = db.scans.find((x) => x.id === id);
  if (!s) throw new Error("Scan not found");
  if (!["AWAITING_CONFIRMATION", "NEEDS_MANUAL_REVIEW"].includes(s.status)) {
    throw new Error(`Cannot confirm from state ${s.status}`);
  }
  const prev = s.category;
  if (updates) Object.assign(s, updates);
  if (category && category !== s.predictedCategory) {
    s.confirmedCategory = category; s.category = category; s.confidence = Math.max(s.confidence, db.settings.confidenceThreshold);
    audit("operator", "scan.reclassify", "scan", id, { from: prev, to: category });
  } else {
    s.confirmedCategory = s.confirmedCategory ?? s.predictedCategory;
    s.category = s.confirmedCategory;
  }
  s.confirmed = true;
  assertScanTransition(s.status, "READY_TO_SORT");
  s.status = "READY_TO_SORT";
  s.updatedAt = now();
  runRecommendation(id);
  audit("operator", "scan.confirm", "scan", id, { category: s.category });
  save();
}

export function updateScan(id: string, patch: Partial<Scan>, actor = "operator") {
  const s = db.scans.find((x) => x.id === id);
  if (!s) throw new Error("Scan not found");
  const consequential = ["category", "weightG", "operatingCondition"].some((k) => (patch as Record<string, unknown>)[k] !== undefined);
  if (consequential) audit(actor, "scan.edit", "scan", id, { patch });
  Object.assign(s, patch, { updatedAt: now() });
  save();
}

// ---------- sorting ----------
const SERVO_ANGLE: Record<SortDestination, number> = {
  REUSE_BIN: 30, REPAIR_BIN: 70, RECYCLE_BIN: 110, HAZARDOUS_BIN: 150, QUARANTINE: 90,
};

function guardSort(scan: Scan): string | null {
  const dev = db.devices[0];
  const simulated = db.settings.mode === "demo";
  if (!scan.confirmed || !scan.recommendation) return "Scan must be confirmed with a recommendation first.";
  if (!scan.sortDestination) return "No sort destination.";
  if (scan.batterySwollen && scan.sortDestination !== "HAZARDOUS_BIN" && scan.sortDestination !== "QUARANTINE")
    return "Safety interlock: swollen battery must go to Hazardous/Quarantine.";
  if ((scan.category === "unknown" || scan.confidence < db.settings.confidenceThreshold) && !scan.confirmedCategory)
    return "Safety interlock: unconfirmed low-confidence item cannot auto-sort.";
  if (!simulated && !dev?.online) return "Device offline — hardware sorting blocked.";
  if (!simulated && dev?.servo === "fault") return "Servo fault — resolve before sorting.";
  return null;
}

export function submitSortJob(scanId: string, destination?: SortDestination, actor = "operator"): SortingJob {
  const s = db.scans.find((x) => x.id === scanId);
  if (!s) throw new Error("Scan not found");
  const dest = destination ?? s.sortDestination;
  if (!dest) throw new Error("No destination selected");
  const blocked = guardSort({ ...s, sortDestination: dest });
  if (blocked) throw new Error(blocked);
  assertScanTransition(s.status, "SORTING");
  s.status = "SORTING"; s.sortDestination = dest; s.updatedAt = now();
  const simulated = db.settings.mode === "demo";
  const job: SortingJob = {
    id: uid("job"), scanId, destination: dest, status: "QUEUED",
    mode: simulated ? "simulated" : "hardware",
    servoAngle: SERVO_ANGLE[dest] ?? 90, attempts: 0, lastError: null,
    ackAt: null, createdAt: now(), updatedAt: now(),
  };
  s.sortJobId = job.id;
  db.jobs = [job, ...db.jobs];
  db.events.push({ id: uid("ev"), jobId: job.id, scanId, kind: "COMMAND_SENT", detail: `Sort → ${dest} @ ${job.servoAngle}° (${job.mode})`, at: now() });
  audit(actor, "sort.submit", "job", job.id, { scanId, dest, mode: job.mode });
  save();
  // Simulated actuator completes asynchronously; hardware waits for ESP32 ack via ackJob().
  if (simulated) {
    job.status = "SENT";
    setTimeout(() => {
      try { completeSimulatedJob(job.id); } catch { /* store may reset */ }
    }, 1600);
  }
  save();
  return job;
}

export function completeSimulatedJob(jobId: string) {
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job || job.status === "COMPLETED" || job.status === "FAILED") return;
  // Deterministic: 92% success; repeatable per job id hash
  let h = 0; for (const c of jobId) h = (h * 31 + c.charCodeAt(0)) % 100;
  const ok = h < 92;
  const scan = db.scans.find((s) => s.id === job.scanId);
  job.attempts += 1; job.ackAt = now(); job.updatedAt = now();
  if (ok) {
    job.status = "COMPLETED";
    db.events.push({ id: uid("ev"), jobId, scanId: job.scanId, kind: "ACK_COMPLETE", detail: `Simulated actuator reached ${job.servoAngle}° — movement completed (bin deposit NOT sensed).`, at: now() });
    if (scan) {
      try { scan.status = "SORT_COMPLETE"; } catch { scan.status = "SORT_COMPLETE"; }
      scan.updatedAt = now();
      creditBin(scan);
    }
  } else {
    job.status = "FAILED"; job.lastError = "Simulated servo stall (timeout 5 s)";
    db.events.push({ id: uid("ev"), jobId, scanId: job.scanId, kind: "FAILED", detail: job.lastError, at: now() });
    if (scan) scan.status = "FAILED";
    alert("warning", "Sorting failed", `Job ${jobId.slice(-6)} stalled — retry available (max 3).`, { scanId: job.scanId });
  }
  audit("system", "sort.ack", "job", jobId, { status: job.status });
  save();
}

// Hardware path: ESP32 POSTs ack → ackJob(jobId, ok, detail)
export function ackJob(jobId: string, ok: boolean, detail = "") {
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error("Job not found");
  if (job.status === "COMPLETED") throw new Error("Duplicate ack — job already completed");
  const scan = db.scans.find((s) => s.id === job.scanId);
  job.ackAt = now(); job.updatedAt = now();
  if (ok) {
    job.status = "COMPLETED";
    db.events.push({ id: uid("ev"), jobId, scanId: job.scanId, kind: "ACK_COMPLETE", detail: detail || "ESP32 acknowledged movement complete.", at: now() });
    if (scan) { scan.status = "SORT_COMPLETE"; scan.updatedAt = now(); creditBin(scan); }
  } else {
    job.attempts += 1;
    job.status = job.attempts >= 3 ? "FAILED" : "SENT";
    job.lastError = detail || "ESP32 reported failure";
    db.events.push({ id: uid("ev"), jobId, scanId: job.scanId, kind: "FAILED", detail: job.lastError, at: now() });
    if (job.status === "FAILED" && scan) scan.status = "FAILED";
    alert("warning", "Sorting failed", detail || "Actuator reported failure.", { scanId: job.scanId });
  }
  audit("device", "sort.ack", "job", jobId, { ok, detail });
  save();
  return job;
}

export function retryJob(jobId: string) {
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error("Job not found");
  if (job.status !== "FAILED" && job.status !== "TIMEOUT") throw new Error("Only failed jobs can retry");
  if (job.attempts >= 3) throw new Error("Retry limit reached (3). Resolve manually.");
  const scan = db.scans.find((s) => s.id === job.scanId);
  job.status = "SENT"; job.lastError = null; job.updatedAt = now();
  if (scan) { try { scan.status = "SORTING"; } catch { scan.status = "SORTING"; } }
  db.events.push({ id: uid("ev"), jobId, scanId: job.scanId, kind: "RETRY", detail: `Attempt ${job.attempts + 1}`, at: now() });
  audit("operator", "sort.retry", "job", jobId, {});
  if (job.mode === "simulated") setTimeout(() => { try { completeSimulatedJob(job.id); } catch { /*noop*/ } }, 1600);
  save();
}

function creditBin(scan: Scan) {
  const map: Record<string, string> = {
    REUSE_BIN: "bin-reuse", REPAIR_BIN: "bin-repair", RECYCLE_BIN: "bin-recycle",
    HAZARDOUS_BIN: "bin-haz", QUARANTINE: "bin-quar",
  };
  const bin = db.bins.find((b) => b.id === map[scan.sortDestination ?? ""]);
  if (!bin) return;
  bin.itemCount += 1;
  bin.totalWeightG += scan.weightG ?? 0;
  bin.fillEstimated = Math.min(1, bin.itemCount / 25 + bin.totalWeightG / 20000);
  if (bin.fillEstimated >= 0.85 && bin.status === "COLLECTING") {
    bin.status = "NEAR_CAPACITY";
    alert("warning", "Bin nearing capacity", `${bin.name} is ~${Math.round(bin.fillEstimated * 100)}% full (estimate from recorded items).`, {});
  } else if (bin.fillEstimated >= 0.6 && bin.status === "COLLECTING") {
    bin.status = "NEAR_CAPACITY";
  }
}

// ---------- alerts / bins / settings ----------
export function ackAlert(id: string, resolved = false) {
  const a = db.alerts.find((x) => x.id === id);
  if (!a) return;
  a.acked = true; if (resolved) a.resolved = true;
  audit("operator", "alert.ack", "alert", id, { resolved });
  save();
}

export function updateBin(id: string, patch: Partial<Bin>) {
  const b = db.bins.find((x) => x.id === id);
  if (!b) throw new Error("Bin not found");
  Object.assign(b, patch);
  audit("operator", "bin.update", "bin", id, { patch });
  save();
}

export function updateSettings(patch: Partial<EcoSettings>) {
  if (patch.confidenceThreshold != null && (patch.confidenceThreshold < 0.1 || patch.confidenceThreshold > 0.95)) {
    throw new Error("Confidence threshold must be 0.10–0.95");
  }
  Object.assign(db.settings, patch);
  audit("operator", "settings.update", "settings", "global", { patch });
  save();
}

export function deleteScan(id: string) {
  const i = db.scans.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("Scan not found");
  const [gone] = db.scans.splice(i, 1);
  audit("operator", "scan.delete", "scan", id, { code: gone.code });
  save();
}

export function resetDemo() {
  const keepSettings = db.settings;
  db = { ...defaults(), settings: keepSettings };
  try { localStorage.removeItem(KEY); } catch { /*noop*/ }
  save();
}

export function seedDemo() {
  if (db.scans.length > 0) return;
  const demo: { name: string; cat: DeviceCategory; conf: number; w: number; cond: Scan["operatingCondition"]; rec: RecommendationKind; dest: SortDestination }[] = [
    { name: "Nokia feature phone", cat: "mobile_phone", conf: 0.91, w: 96, cond: "dead", rec: "REPAIR", dest: "REPAIR_BIN" },
    { name: "TV remote (no batteries)", cat: "remote_control", conf: 0.88, w: 82, cond: "powers_on", rec: "REUSE", dest: "REUSE_BIN" },
    { name: "USB cable bundle", cat: "cable", conf: 0.83, w: 145, cond: "untested", rec: "RECYCLE", dest: "RECYCLE_BIN" },
    { name: "Swollen power bank", cat: "battery", conf: 0.94, w: 210, cond: "dead", rec: "HAZARDOUS", dest: "HAZARDOUS_BIN" },
    { name: "Blurry desk item", cat: "unknown", conf: 0.31, w: 120, cond: "untested", rec: "MANUAL_REVIEW", dest: "QUARANTINE" },
  ];
  const daysAgo = [6, 5, 3, 1, 0];
  demo.forEach((d, i) => {
    const code = nextCode();
    const at = new Date(Date.now() - daysAgo[i] * 864e5).toISOString();
    db.scans.push({
      id: uid("scan"), code, name: d.name, category: d.cat, predictedCategory: d.cat,
      confidence: d.conf, modelVersion: MODEL_VERSION, inferenceSimulated: true,
      weightG: d.w, weightSimulated: true, imageDataUrl: null, imageName: `${d.cat}_demo.jpg`,
      visibleDamage: i === 3 ? "Swollen pouch, warm to touch" : i === 0 ? "Cracked screen" : "",
      operatingCondition: d.cond, batteryPresent: ["mobile_phone", "battery"].includes(d.cat),
      batterySwollen: i === 3, sensor: null,
      recommendation: { kind: d.rec, explanation: "Seeded demo record — clearly labeled sample data.", evidence: ["seeded"], uncertainty: [], ruleVersion: RULE_VERSION, destination: d.dest },
      status: i === 4 ? "NEEDS_MANUAL_REVIEW" : "SORT_COMPLETE",
      sortDestination: d.dest, sortJobId: null, confirmed: true, confirmedCategory: d.cat,
      createdAt: at, updatedAt: at, dataSources: ["demo-seed"],
    });
    if (i !== 4) {
      const map: Record<string, string> = { REUSE_BIN: "bin-reuse", REPAIR_BIN: "bin-repair", RECYCLE_BIN: "bin-recycle", HAZARDOUS_BIN: "bin-haz", QUARANTINE: "bin-quar" };
      const bin = db.bins.find((b) => b.id === map[d.dest]);
      if (bin) { bin.itemCount += 1; bin.totalWeightG += d.w; bin.fillEstimated = Math.min(1, bin.itemCount / 25 + bin.totalWeightG / 20000); }
    }
  });
  alert("info", "Demo data loaded", "5 clearly-labeled sample scans were added for exhibition.", {});
  audit("system", "demo.seed", "db", "seed", { count: 5 });
  save();
}

// ---------- dashboard aggregates (always from stored data) ----------
export interface DashboardSummary {
  totalScans: number; totalWeightG: number; awaitingReview: number;
  reuseRepair: number; recycle: number; hazardous: number;
  sortSuccessRate: number | null; deviceOnline: boolean; mode: string;
  byCategory: { name: string; count: number }[];
  last7d: { day: string; count: number; weightG: number }[];
  recent: Scan[];
}

export function dashboard(): DashboardSummary {
  const scans = db.scans;
  const totalWeightG = scans.reduce((a, s) => a + (s.weightG ?? 0), 0);
  const awaitingReview = scans.filter((s) => s.status === "NEEDS_MANUAL_REVIEW" || s.status === "AWAITING_CONFIRMATION").length;
  const reuseRepair = scans.filter((s) => s.recommendation?.kind === "REUSE" || s.recommendation?.kind === "REPAIR").length;
  const recycle = scans.filter((s) => s.recommendation?.kind === "RECYCLE").length;
  const hazardous = scans.filter((s) => s.recommendation?.kind === "HAZARDOUS").length;
  const done = db.jobs.filter((j) => j.status === "COMPLETED" || j.status === "FAILED");
  const sortSuccessRate = done.length === 0 ? null : Math.round((done.filter((j) => j.status === "COMPLETED").length / done.length) * 1000) / 10;
  const byCat = new Map<string, number>();
  scans.forEach((s) => byCat.set(s.category, (byCat.get(s.category) ?? 0) + 1));
  const last7d = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * 864e5);
    const key = d.toISOString().slice(0, 10);
    const day = scans.filter((s) => s.createdAt.slice(0, 10) === key);
    return { day: d.toLocaleDateString("en-GB", { weekday: "short" }), count: day.length, weightG: day.reduce((a, s) => a + (s.weightG ?? 0), 0) };
  });
  return {
    totalScans: scans.length, totalWeightG, awaitingReview, reuseRepair, recycle, hazardous,
    sortSuccessRate, deviceOnline: db.devices[0]?.online ?? false, mode: db.settings.mode,
    byCategory: [...byCat.entries()].map(([name, count]) => ({ name, count })),
    last7d, recent: scans.slice(0, 6),
  };
}
