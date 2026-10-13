import { useSyncExternalStore } from "react";
import { bus } from "@/lib/eventBus";
import { chainHash, nowISO, slaElapsedRatio, uid } from "@/lib/geo";
import { validateRequest } from "@/lib/validation";
import { rankTechnicians } from "@/lib/allocation";
import { assertTransition, assertFresh } from "@/lib/stateMachine";
import { aiAdapter, notificationAdapter } from "@/adapters/impl";
import { MACHINES as SEED_M, PARTS as SEED_P, SITES as SEED_S, TECHNICIANS as SEED_T } from "@/data/seed";
import type {
  AppUser, Assignment, Attachment, AuditEntry, ExceptionFlag, ExceptionType,
  Machine, NotificationMsg, PartInventory, Reservation, ServiceRequest, Site, TaskLog, Technician,
} from "@/types";
import { PRIORITY_SLA_HOURS } from "@/types";

export interface DB {
  sites: Site[]; machines: Machine[]; techs: Technician[];
  parts: PartInventory[]; requests: ServiceRequest[];
  reservations: Reservation[]; assignments: Assignment[];
  logs: TaskLog[]; attachments: Attachment[];
  exceptions: ExceptionFlag[]; notifications: NotificationMsg[];
  audit: AuditEntry[]; users: AppUser[];
  /** Admin-configurable SLA resolution targets (hours) per priority. */
  slaHours?: Record<string, number>;
}

export const DEFAULT_SLA_HOURS: Record<string, number> = { P1: 4, P2: 24, P3: 72, P4: 168 };

const KEY = "servicegrid_db_v3";
let seq = 1040;

function freshDB(): DB {
  const H = 1000 * 60 * 60;
  const ago = (h: number) => new Date(Date.now() - h * H).toISOString();
  const ahead = (h: number) => new Date(Date.now() + h * H).toISOString();
  const mk = (
    id: string, code: string, machineId: string, siteId: string, title: string, description: string,
    priority: ServiceRequest["priority"], status: ServiceRequest["status"],
    createdH: number, slaH: number, extra?: Partial<ServiceRequest>,
  ): ServiceRequest => ({
    id, code, machineId, siteId, title, description, priority,
    requiredSkills: [], requiredParts: [{ sku: "BELT-V88", qty: 1 }],
    status, slaDeadline: new Date(new Date(ago(createdH)).getTime() + slaH * H).toISOString(),
    createdBy: "u-cust", createdAt: ago(createdH),
    validationReport: { checks: [
      { name: "Machine registered", result: "pass", message: "Asset found in registry" },
      { name: "Warranty verified", result: "pass", message: "Contract active" },
      { name: "Site verified", result: "pass", message: "Customer authorized" },
      { name: "Skills identified", result: "pass", message: "Routing profile ready" },
      { name: "Parts available", result: status === "EXCEPTION" ? "fail" : "pass", message: status === "EXCEPTION" ? "Spare part unavailable" : "Stock confirmed" },
      { name: "SLA assigned", result: "pass", message: "Deadline computed" },
    ], overall: status === "EXCEPTION" ? "fail" : "pass", at: ago(createdH) },
    ...extra,
  });
  const requests: ServiceRequest[] = [
    mk("r-hero", "SR-1042", "m-104", "site-a", "Hydraulic pressure loss", "Hydraulic Press HP-200 pressure loss on line A.", "P1", "IN_PROGRESS", 2, 1.5),
    mk("r-1043", "SR-1043", "m-102", "site-b", "Spindle vibration above threshold", "CNC Milling Machine spindle vibration.", "P2", "ASSIGNED", 3, 8),
    mk("r-1044", "SR-1044", "m-103", "site-c", "Air pressure fluctuation", "Industrial Compressor air pressure fluctuation.", "P1", "PENDING_APPROVAL", 4, 6),
    mk("r-1045", "SR-1045", "m-104", "site-a", "Motor overheating", "Conveyor Belt System motor overheating.", "P2", "EXCEPTION", 5, 4),
    mk("r-1046", "SR-1046", "m-110", "site-b", "Cooling temperature deviation", "Cooling Unit CU-500 temperature deviation.", "P3", "CREATED", 5, 30),
    mk("r-1047", "SR-1047", "m-111", "site-c", "Welding arm calibration", "Robotic Welding Arm calibration drift.", "P2", "PENDING_VERIFICATION", 8, 24),
    mk("r-1048", "SR-1048", "m-101", "site-a", "Preventive maintenance", "Hydraulic Press HP-200 scheduled PM.", "P4", "CLOSED", 26, 24),
    mk("r-1050", "SR-1050", "m-101", "site-a", "Oil leak at main cylinder", "Hydraulic Press HP-200 oil leak.", "P2", "ASSIGNED", 2.5, 7),
    mk("r-1052", "SR-1052", "m-108", "site-b", "Bearing noise during operation", "Vibration Tester bearing noise.", "P3", "IN_PROGRESS", 1.5, 10),
    mk("r-1053", "SR-1053", "m-110", "site-c", "Air filter clogged", "Air filter FLT-GA75 out of stock path.", "P4", "EXCEPTION", 6, 5),
    mk("r-1041", "SR-1041", "m-104", "site-a", "Conveyor C-4 halted — motor trip suspected", "Line C-4 stopped mid-shift. Suspected drive motor overload.", "P1", "IN_PROGRESS", 1, 4, { requiredParts: [{ sku: "BELT-V88", qty: 2 }, { sku: "FUSE-10A", qty: 4 }], requiredSkills: ["electrical", "conveyor", "plc"] }),
    mk("r-1042b", "SR-1040", "m-102", "site-b", "CNC spindle vibration high", "Vibration above normal on spindle.", "P2", "VALIDATED", 2, 20, { requiredSkills: ["electrical", "plc"], requiredParts: [{ sku: "BRG-6205", qty: 2 }] }),
  ];
  void ahead; void ago;
  return {
    sites: SEED_S, machines: SEED_M, techs: SEED_T, parts: SEED_P,
    requests,
    reservations: [], assignments: [
      { id: "a-hero", requestId: "r-hero", technicianId: "t-01", score: 0.87, breakdown: { skillMatch: 1, proximity: 0.97, availability: 0.9, workload: 0.3, total: 0.87 }, explanation: "Tara Tech is the best fit: full skill match, 0.8km away, high availability.", active: true, createdAt: new Date().toISOString() },
    ],
    logs: [{ id: "l1", requestId: "r-hero", authorId: "t-01", authorName: "Tara Tech", text: "On site. Isolating drive motor; checking MCC fuses.", at: new Date().toISOString(), kind: "NOTE" }],
    attachments: [],
    exceptions: [
      { id: "ex-301", requestId: "r-1045", type: "TECH_DROPOUT", message: "Assigned technician is unavailable for the scheduled shift.", resolved: false, createdAt: ago(1), candidateId: "t-03", suggestion: "Best fallback: Sana Iqbal (score 0.91)" },
      { id: "ex-302", requestId: "r-1053", type: "PART_UNAVAILABLE", message: "Air filter FLT-GA75 is out of stock. SLA has breached.", resolved: false, createdAt: ago(2), suggestion: "Transfer stock from site-b → site-c" },
      { id: "ex-303", requestId: "r-hero", type: "SLA_BREACH", message: "Hydraulic press service exceeded its target deadline.", resolved: false, createdAt: ago(0.5) },
      { id: "ex-304", requestId: "r-1052", type: "SLA_BREACH", message: "Scheduling conflict: overlapping assignments for bearing job.", resolved: false, createdAt: ago(0.8) },
    ],
    notifications: [
      { id: "n1", title: "SR-1041 assigned", body: "Tara Tech assigned to Conveyor C-4 (P1).", at: new Date().toISOString() },
      { id: "n2", title: "SLA BREACH — SR-1042 exceeded its SLA", body: "Hydraulic press service exceeded deadline by 18 minutes.", at: ago(0.4) },
      { id: "n3", title: "TECHNICIAN DROPOUT — SR-1045", body: "Assigned technician unavailable. Automatic rerouting available.", at: ago(1) },
    ],
    audit: [], users: [
      { id: "u-cust", name: "Priya Customer", email: "customer@grid.io", role: "CUSTOMER", siteId: "site-a", password: "demo" },
      { id: "u-ops", name: "Omar Ops", email: "ops@grid.io", role: "OPS_MANAGER", password: "demo" },
      { id: "u-tech", name: "Tara Tech", email: "tech@grid.io", role: "TECHNICIAN", password: "demo" },
      { id: "u-admin", name: "Ada Admin", email: "admin@grid.io", role: "ADMIN", password: "demo" },
    ],
    slaHours: { ...DEFAULT_SLA_HOURS },
  };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as DB;
      seq = 1040 + db.requests.length + 10;
      if (!db.slaHours) db.slaHours = { ...DEFAULT_SLA_HOURS }; // migrate older saves
      return db;
    }
  } catch {}
  return freshDB();
}

let db: DB = load();
const listeners = new Set<() => void>();
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  listeners.forEach((l) => l());
  bus.emit("StoreChanged", { at: nowISO() });
}
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useDB(): DB {
  useSyncExternalStore(subscribe, () => db);
  return db;
}

// ---- audit (hash-chained) ----
function audit(actor: string, action: string, entity: string, entityId: string, payload: unknown) {
  const prev = db.audit.length ? db.audit[db.audit.length - 1].hash : "GENESIS";
  const body = JSON.stringify({ actor, action, entity, entityId, payload });
  const hash = chainHash(prev, body);
  db.audit.push({ id: uid("audit"), actor, action, entity, entityId, payload, prevHash: prev, hash, at: nowISO() });
}
export function verifyChain(): { ok: boolean; badIndex: number } {
  for (let i = 0; i < db.audit.length; i++) {
    const e = db.audit[i];
    const expectPrev = i === 0 ? "GENESIS" : db.audit[i - 1].hash;
    if (e.prevHash !== expectPrev) return { ok: false, badIndex: i };
    if (chainHash(e.prevHash, JSON.stringify({ actor: e.actor, action: e.action, entity: e.entity, entityId: e.entityId, payload: e.payload })) !== e.hash)
      return { ok: false, badIndex: i };
  }
  return { ok: true, badIndex: -1 };
}

// ---- workflow actions (enforce state machine + RBAC at call sites) ----
export const store = {
  reset() { localStorage.removeItem(KEY); db = freshDB(); audit("system", "DEMO_RESET", "db", "all", {}); persist(); },
  get db() { return db; },

  createRequest(input: { machineId: string; title: string; description: string; priority: "P1"|"P2"|"P3"|"P4"; requiredParts: { sku: string; qty: number }[]; slaDeadline?: string }, actorId: string) {
    const m = db.machines.find((x) => x.id === input.machineId);
    const site = db.sites.find((s) => s.id === m?.siteId);
    const report = validateRequest({ machine: m, site, priority: input.priority, requiredParts: input.requiredParts, inventory: db.parts });
    const hours = (db.slaHours ?? DEFAULT_SLA_HOURS)[input.priority] ?? PRIORITY_SLA_HOURS[input.priority];
    const code = `SR-${seq++}`;
    const req: ServiceRequest = {
      id: uid("r"), code, machineId: input.machineId, siteId: m?.siteId ?? site?.id ?? "site-a",
      title: input.title, description: input.description, priority: input.priority,
      requiredSkills: m?.skills ?? [], requiredParts: input.requiredParts,
      status: "CREATED", slaDeadline: input.slaDeadline ?? new Date(Date.now() + hours * 3600 * 1000).toISOString(),
      createdBy: actorId, createdAt: nowISO(), validationReport: report, rev: 0,
    };
    db.requests.unshift(req);
    audit(actorId, "CREATE", "ServiceRequest", req.id, { code, report: report.overall });
    bus.emit("RequestCreated", { requestId: req.id, code });
    // CREATED -> VALIDATED -> PENDING_APPROVAL (auto for P1 under threshold: warn/pass auto-approves to APPROVED)
    this.setStatus(req.id, "VALIDATED", actorId, { silent: true });
    this.setStatus(req.id, "PENDING_APPROVAL", actorId, { silent: true });
    if (input.priority === "P1" && report.overall !== "fail") this.approve(req.id, actorId, true);
    notificationAdapter.notify("ops", "New request " + code, `${input.title} [${input.priority}] — validation ${report.overall}`);
    persist();
    return req;
  },

  setStatus(requestId: string, to: ServiceRequest["status"], actorId: string, opts?: { silent?: boolean; expectedRev?: number }) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) throw new Error("Request not found");
    assertFresh(r.rev, opts?.expectedRev, r.code);
    assertTransition(r.status, to);
    const from = r.status;
    r.status = to;
    r.rev = (r.rev ?? 0) + 1;
    db.logs.unshift({ id: uid("log"), requestId, authorId: actorId, authorName: db.users.find((u) => u.id === actorId)?.name ?? actorId, text: `Status ${from} → ${to}`, at: nowISO(), kind: "STATUS" });
    audit(actorId, "STATUS", "ServiceRequest", requestId, { from, to });
    bus.emit("StatusChanged", { requestId, from, to });
    if (to === "CLOSED") {
      bus.emit("RequestClosed", { requestId });
      this.consumeReservations(requestId, actorId);
    }
    if (!opts?.silent) persist();
  },

  /** Reservation → consumption on close: decrement stock, free the hold. */
  consumeReservations(requestId: string, actorId: string) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) return;
    const pending = db.reservations.filter((x) => x.requestId === requestId && !x.consumed);
    if (pending.length === 0) return;
    for (const res of pending) {
      const p = db.parts.find((pp) => pp.sku === res.sku && pp.siteId === res.siteId);
      if (p) {
        p.reservedQty = Math.max(0, p.reservedQty - res.qty);
        p.qty = Math.max(0, p.qty - res.qty);
        if (p.qty - p.reservedQty < 3) {
          db.notifications.unshift({ id: uid("n"), title: `Low stock: ${p.sku}`, body: `${p.qty - p.reservedQty} free at ${p.siteId} after ${r.code}.`, at: nowISO() });
        }
      }
      res.consumed = true;
    }
    audit(actorId, "PART_CONSUMED", "ServiceRequest", requestId, { items: pending.map((x) => `${x.sku}×${x.qty}`) });
    bus.emit("PartsConsumed", { requestId });
  },

  approve(requestId: string, actorId: string, auto = false) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) throw new Error("not found");
    if (r.status === "PENDING_APPROVAL") this.setStatus(requestId, "APPROVED", actorId, { silent: true });
    else if (r.status !== "APPROVED") throw new Error(`Cannot approve from ${r.status}`);
    audit(actorId, auto ? "AUTO_APPROVE" : "APPROVE", "ServiceRequest", requestId, {});
    bus.emit("RequestApproved", { requestId, auto });
    persist();
  },

  reject(requestId: string, actorId: string, reason: string) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) throw new Error("not found");
    if (r.status !== "PENDING_APPROVAL") throw new Error(`Cannot reject from ${r.status}`);
    this.setStatus(requestId, "REJECTED", actorId, { silent: true });
    this.addLog(requestId, actorId, `Rejected: ${reason || "no reason given"}`, "NOTE");
    db.notifications.unshift({ id: uid("n"), title: `Request rejected: ${r.code}`, body: reason || "Sent back by approver.", at: nowISO() });
    audit(actorId, "REJECT", "ServiceRequest", requestId, { reason });
    bus.emit("RequestRejected", { requestId, reason });
    persist();
  },

  cancel(requestId: string, actorId: string, reason: string) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) throw new Error("not found");
    if (!["CREATED", "VALIDATED", "PENDING_APPROVAL", "APPROVED", "ASSIGNED"].includes(r.status))
      throw new Error(`Cannot cancel from ${r.status}`);
    // release any held reservations + assignments
    db.reservations.filter((x) => x.requestId === requestId && !x.consumed).forEach((res) => {
      const p = db.parts.find((pp) => pp.sku === res.sku && pp.siteId === res.siteId);
      if (p) p.reservedQty = Math.max(0, p.reservedQty - res.qty);
    });
    db.reservations = db.reservations.filter((x) => x.requestId !== requestId || x.consumed);
    db.assignments.forEach((a) => { if (a.requestId === requestId) a.active = false; });
    this.setStatus(requestId, "CANCELLED", actorId, { silent: true });
    this.addLog(requestId, actorId, `Cancelled: ${reason || "no reason given"}`, "NOTE");
    db.notifications.unshift({ id: uid("n"), title: `Request cancelled: ${r.code}`, body: reason || "Cancelled by operations.", at: nowISO() });
    audit(actorId, "CANCEL", "ServiceRequest", requestId, { reason });
    bus.emit("RequestCancelled", { requestId, reason });
    persist();
  },

  /** REJECTED → back to the approval queue. */
  resubmit(requestId: string, actorId: string) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) throw new Error("not found");
    if (r.status !== "REJECTED") throw new Error(`Cannot resubmit from ${r.status}`);
    this.setStatus(requestId, "PENDING_APPROVAL", actorId);
  },

  /** CANCELLED → back to draft for a fresh lifecycle. */
  reopenDraft(requestId: string, actorId: string) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) throw new Error("not found");
    if (r.status !== "CANCELLED") throw new Error(`Cannot reopen from ${r.status}`);
    this.setStatus(requestId, "CREATED", actorId);
  },

  /** Push the SLA deadline out by N hours (reschedule). */
  reschedule(requestId: string, actorId: string, addHours: number) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) throw new Error("not found");
    if (r.status === "CLOSED" || r.status === "CANCELLED" || r.status === "REJECTED")
      throw new Error(`Cannot reschedule from ${r.status}`);
    const from = r.slaDeadline;
    r.slaDeadline = new Date(new Date(r.slaDeadline).getTime() + addHours * 3600000).toISOString();
    r.rev = (r.rev ?? 0) + 1;
    this.addLog(requestId, actorId, `Rescheduled: SLA +${addHours}h`, "NOTE");
    db.notifications.unshift({ id: uid("n"), title: `Rescheduled: ${r.code}`, body: `SLA extended by ${addHours}h.`, at: nowISO() });
    audit(actorId, "RESCHEDULE", "ServiceRequest", requestId, { from, to: r.slaDeadline });
    bus.emit("RequestRescheduled", { requestId, addHours });
    persist();
  },

  /** Escalate: bump priority one level (audit + notify, deadline unchanged). */
  escalate(requestId: string, actorId: string) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) throw new Error("not found");
    const order = ["P4", "P3", "P2", "P1"] as const;
    const next = order[Math.min(order.length - 1, order.indexOf(r.priority) + 1)];
    if (next === r.priority) throw new Error(`${r.code} is already top priority`);
    const from = r.priority;
    r.priority = next;
    r.rev = (r.rev ?? 0) + 1;
    this.addLog(requestId, actorId, `Escalated: ${from} → ${next}`, "NOTE");
    db.notifications.unshift({ id: uid("n"), title: `Escalated: ${r.code}`, body: `Priority ${from} → ${next}.`, at: nowISO() });
    audit(actorId, "ESCALATE", "ServiceRequest", requestId, { from, to: next });
    bus.emit("RequestEscalated", { requestId, from, to: next });
    persist();
  },

  slaHoursFor(priority: string): number {
    return (db.slaHours ?? DEFAULT_SLA_HOURS)[priority] ?? DEFAULT_SLA_HOURS[priority] ?? 24;
  },

  updateSlaHours(hours: Record<string, number>, actorId: string) {
    for (const [k, v] of Object.entries(hours)) {
      if (!["P1", "P2", "P3", "P4"].includes(k) || !(v > 0) || v > 720) throw new Error(`Invalid SLA rule ${k}=${v}`);
    }
    db.slaHours = { ...DEFAULT_SLA_HOURS, ...hours };
    audit(actorId, "SLA_RULES", "Settings", "slaHours", hours);
    persist();
  },

  rank(requestId: string, excludeIds: string[] = []) {
    const r = db.requests.find((x) => x.id === requestId)!;
    const site = db.sites.find((s) => s.id === r.siteId);
    return rankTechnicians(r, db.techs.filter((t) => t.online), site, excludeIds);
  },

  // atomic reservation: check-then-reserve in one pass, no oversell
  assign(requestId: string, techId: string, actorId: string) {
    const r = db.requests.find((x) => x.id === requestId)!;
    const tech = db.techs.find((t) => t.id === techId)!;
    // conflict detection (advisory — assignment still proceeds, exception is raised for resolution)
    const clashes = db.assignments.filter((a) =>
      a.active && a.technicianId === techId && a.requestId !== requestId &&
      ["ASSIGNED", "IN_PROGRESS"].includes(db.requests.find((x) => x.id === a.requestId)?.status ?? "")
    );
    if (clashes.length > 0) {
      const codes = clashes.map((a) => db.requests.find((x) => x.id === a.requestId)?.code ?? a.requestId).join(", ");
      this.raiseException(requestId, "TECH_CONFLICT", `${tech.name} is already active on ${codes}. Consider reassigning one of them.`, actorId);
    }
    // parts check
    for (const rp of r.requiredParts) {
      const free = db.parts.filter((p) => p.sku === rp.sku).reduce((s, p) => s + (p.qty - p.reservedQty), 0);
      if (free < rp.qty) {
        this.raiseException(requestId, "PART_UNAVAILABLE", `${rp.sku}: need ${rp.qty}, only ${free} free.`, actorId);
        throw new Error(`Insufficient ${rp.sku}`);
      }
    }
    // reserve (prefer same-site stock)
    for (const rp of r.requiredParts) {
      let need = rp.qty;
      const cands = db.parts.filter((p) => p.sku === rp.sku && p.qty - p.reservedQty > 0)
        .sort((a, b) => (a.siteId === r.siteId ? -1 : 1) - (b.siteId === r.siteId ? -1 : 1));
      for (const c of cands) {
        if (need <= 0) break;
        const take = Math.min(need, c.qty - c.reservedQty);
        c.reservedQty += take; need -= take;
        db.reservations.push({ id: uid("res"), requestId, sku: rp.sku, siteId: c.siteId, qty: take, createdAt: nowISO() });
      }
    }
    db.assignments.forEach((a) => { if (a.requestId === requestId) a.active = false; });
    const site = db.sites.find((s) => s.id === r.siteId);
    const ranked = rankTechnicians(r, [tech], site);
    const bd = ranked[0]?.breakdown ?? { skillMatch: 0, proximity: 0, availability: 0, workload: 0, total: 0 };
    aiAdapter.explainAssignment(tech.name, bd as any, r.code).then((explanation) => {
      const a = db.assignments.find((x) => x.requestId === requestId && x.active);
      if (a) { a.explanation = explanation; persist(); }
    });
    const a: Assignment = { id: uid("a"), requestId, technicianId: techId, score: bd.total, breakdown: bd, explanation: `${tech.name} assigned (score ${bd.total}).`, active: true, createdAt: nowISO() };
    db.assignments.unshift(a);
    tech.currentLoad = Math.min(1, tech.currentLoad + 0.15);
    r.rev = (r.rev ?? 0) + 1;
    if (r.status === "APPROVED" || r.status === "EXCEPTION") this.setStatus(requestId, "ASSIGNED", actorId, { silent: true });
    audit(actorId, "ASSIGN", "Assignment", a.id, { techId, score: bd.total });
    bus.emit("TechnicianAssigned", { requestId, techId, score: bd.total });
    notificationAdapter.notify(techId, `New job ${r.code}`, `${r.title} — accept in Technician view.`);
    persist();
    return a;
  },

  async reassign(requestId: string, actorId: string) {
    const failed = db.assignments.find((a) => a.requestId === requestId && a.active);
    const exclude = failed ? [failed.technicianId] : [];
    if (failed) failed.active = false;
    const ranked = this.rank(requestId, exclude);
    if (!ranked.length) throw new Error("No available technicians");
    // release old reservations for atomic re-reserve
    db.reservations.filter((x) => x.requestId === requestId).forEach((res) => {
      const p = db.parts.find((pp) => pp.sku === res.sku && pp.siteId === res.siteId);
      if (p) p.reservedQty = Math.max(0, p.reservedQty - res.qty);
    });
    db.reservations = db.reservations.filter((x) => x.requestId !== requestId);
    return this.assign(requestId, ranked[0].tech.id, actorId);
  },

  raiseException(requestId: string, type: ExceptionType, message: string, actorId: string, extra?: { candidateId?: string; suggestion?: string }) {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r) throw new Error("not found");
    const ex: ExceptionFlag = { id: uid("ex"), requestId, type, message, resolved: false, createdAt: nowISO(), candidateId: extra?.candidateId, suggestion: extra?.suggestion };
    // nearest-site transfer suggestion for parts
    if (type === "PART_UNAVAILABLE" && !ex.suggestion) {
      const site = db.sites.find((s) => s.id === r.siteId);
      const other = db.parts.filter((p) => p.siteId !== r.siteId && p.qty - p.reservedQty > 0).slice(0, 2);
      ex.suggestion = other.length ? `Transfer ${other.map((o) => `${o.sku}×${o.qty - o.reservedQty} from ${o.siteId}`).join(", ")} → ${site?.code}` : "No stock at nearby sites — raise PO.";
    }
    // one-click candidate: best excluding failed
    if (!ex.candidateId) {
      const failedTech = db.assignments.find((a) => a.requestId === requestId && a.active)?.technicianId;
      const ranked = this.rank(requestId, failedTech ? [failedTech] : []);
      if (ranked[0]) { ex.candidateId = ranked[0].tech.id; ex.suggestion = (ex.suggestion ? ex.suggestion + " • " : "") + `Best fallback: ${ranked[0].tech.name} (score ${ranked[0].breakdown.total})`; }
    }
    db.exceptions.unshift(ex);
    db.notifications.unshift({ id: uid("n"), title: `Exception: ${type}`, body: `${r.code}: ${message}`, at: nowISO() });
    if (r.status !== "EXCEPTION") {
      try { this.setStatus(requestId, "EXCEPTION", actorId, { silent: true }); } catch {}
    }
    audit(actorId, "EXCEPTION", "ExceptionFlag", ex.id, { type, message });
    bus.emit("ExceptionRaised", { requestId, type, message });
    notificationAdapter.notify("ops", `Exception ${type}`, `${r.code}: ${message}`);
    persist();
    return ex;
  },

  resolveException(exId: string, actorId: string) {
    const ex = db.exceptions.find((e) => e.id === exId);
    if (!ex) return;
    ex.resolved = true; ex.resolvedBy = actorId;
    audit(actorId, "EXCEPTION_RESOLVE", "ExceptionFlag", exId, {});
    persist();
  },

  // ---- demo controls (produce the REAL exception flow) ----
  dropoutTech(requestId: string, actorId: string) {
    const a = db.assignments.find((x) => x.requestId === requestId && x.active);
    if (a) { const t = db.techs.find((t) => t.id === a.technicianId); if (t) t.online = false; }
    return this.raiseException(requestId, "TECH_DROPOUT", `Assigned technician went offline.`, actorId);
  },
  depletePart(requestId: string, actorId: string) {
    const r = db.requests.find((x) => x.id === requestId)!;
    const sku = r.requiredParts[0]?.sku ?? "BELT-V88";
    db.parts.filter((p) => p.sku === sku).forEach((p) => { p.qty = p.reservedQty; }); // zero free stock
    return this.raiseException(requestId, "PART_UNAVAILABLE", `Reserved ${sku} falls short after stock recount.`, actorId);
  },
  fastForwardSLA(requestId: string, actorId: string) {
    const r = db.requests.find((x) => x.id === requestId)!;
    r.slaDeadline = new Date(Date.now() - 1000 * 60 * 5).toISOString();
    return this.raiseException(requestId, "SLA_BREACH", `SLA breached for ${r.code} (deadline passed).`, actorId);
  },
  iotAlert(machineCode: string, actorId: string) {
    const m = db.machines.find((x) => x.code === machineCode) ?? db.machines[3];
    const req = this.createRequest({ machineId: m.id, title: `IoT: threshold breach on ${m.code}`, description: "Telemetry vibration=128 > threshold 100. Auto-created P1.", priority: "P1", requiredParts: [] }, actorId);
    return req;
  },

  addLog(requestId: string, authorId: string, text: string, kind: TaskLog["kind"] = "NOTE") {
    const u = db.users.find((x) => x.id === authorId);
    db.logs.unshift({ id: uid("log"), requestId, authorId, authorName: u?.name ?? authorId, text, at: nowISO(), kind });
    audit(authorId, "TASKLOG", "TaskLog", requestId, { kind, text: text.slice(0, 140) });
    persist();
  },
  addAttachment(requestId: string, actorId: string, name: string, url: string, note?: string) {
    db.attachments.unshift({ id: uid("att"), requestId, name, url, note, at: nowISO() });
    audit(actorId, "ATTACH", "Attachment", requestId, { name });
    persist();
  },

  // background SLA job — call on interval; warns at 80%, flags at 100%
  slaTick(actorId = "system") {
    let changed = false;
    for (const r of db.requests) {
      if (["CLOSED"].includes(r.status)) continue;
      const ratio = slaElapsedRatio(r.createdAt, r.slaDeadline);
      if (ratio >= 1 && !db.exceptions.some((e) => e.requestId === r.id && e.type === "SLA_BREACH" && !e.resolved)) {
        this.raiseException(r.id, "SLA_BREACH", `SLA breached for ${r.code}.`, actorId); changed = true;
      } else if (ratio >= 0.8 && !r.slaWarned) {
        r.slaWarned = true;
        db.notifications.unshift({ id: uid("n"), title: `SLA at risk: ${r.code}`, body: `${Math.round(ratio * 100)}% of SLA elapsed.`, at: nowISO() });
        changed = true;
      }
    }
    if (changed) persist();
  },
};

setInterval(() => { try { store.slaTick(); } catch {} }, 15000);
