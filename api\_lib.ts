/**
 * Shared backend foundation for all /api functions (Vercel Node runtime).
 * Prisma singleton, auth (bcrypt + JWT), RBAC, JSON envelope, realtime
 * events, SLA evaluation, and the DB→client snapshot mapper.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { assertTransition, can } from "../../src/lib/stateMachine";
import { slaElapsedRatio } from "../../src/lib/geo";

export { assertTransition, can, slaElapsedRatio };

// ---------- Vercel-compatible handler types (no extra dependency) ----------
export interface VReq {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}
export interface VRes {
  status: (code: number) => VRes;
  json: (body: unknown) => void;
  setHeader: (k: string, v: string) => void;
}
export type Handler = (req: VReq, res: VRes) => void | Promise<void>;

// ---------- Prisma singleton (serverless-safe) ----------
const g = globalThis as unknown as { __sgPrisma?: PrismaClient };
export const prisma: PrismaClient =
  g.__sgPrisma ?? (g.__sgPrisma = new PrismaClient());

// ---------- envelope + errors ----------
export function ok(res: VRes, data: unknown, code = 200) {
  res.status(code).json({ success: true, data });
}
export function fail(res: VRes, code: string, message: string, http = 400) {
  res.status(http).json({ success: false, error: { code, message } });
}
export class ApiError extends Error {
  constructor(public code: string, message: string, public http = 400) {
    super(message);
  }
}
export function route(handler: (req: VReq, user: AuthUser | null) => Promise<unknown>) {
  return (async (req: VReq, res: VRes) => {
    try {
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.status(200).json({ ok: true });
        return;
      }
      const user = await authed(req);
      const data = await handler(req, user);
      res.status(200).json({ success: true, data });
    } catch (e) {
      if (e instanceof ApiError) fail(res, e.code, e.message, e.http);
      else {
        console.error("[api]", e instanceof Error ? e.message : e);
        fail(res, "INTERNAL", "Something went wrong. The operations team has been notified.", 500);
      }
    }
  }) as Handler;
}

// ---------- auth ----------
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  siteId: string | null;
  onboarded: boolean;
}

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new ApiError("CONFIG", "Server misconfigured: JWT_SECRET is not set.", 500);
  return s;
}

export async function authed(req: VReq): Promise<AuthUser | null> {
  const h = req.headers["authorization"];
  const token = (Array.isArray(h) ? h[0] : h)?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const p = jwt.verify(token, jwtSecret()) as { sub: string };
    const u = await prisma.user.findUnique({ where: { id: p.sub } });
    if (!u) return null;
    return { id: u.id, email: u.email, name: u.name, role: u.role, siteId: u.siteId, onboarded: u.onboarded };
  } catch {
    return null;
  }
}

export function requireAuth(user: AuthUser | null): AuthUser {
  if (!user) throw new ApiError("UNAUTHENTICATED", "Sign in to continue.", 401);
  return user;
}

export function requireRole(user: AuthUser, action: string): AuthUser {
  requireAuth(user);
  if (!can(user.role, action)) {
    throw new ApiError("FORBIDDEN", `Role ${user.role} may not perform ${action}.`, 403);
  }
  return user;
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 4) throw new ApiError("WEAK_PASSWORD", "Password must be at least 4 characters.", 400);
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: "12h" });
}

export function publicUser(u: { id: string; email: string; name: string; role: string; siteId: string | null; onboarded: boolean }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, siteId: u.siteId, onboarded: u.onboarded };
}

// ---------- realtime events ----------
export async function emit(type: string, payload: Record<string, unknown>) {
  await prisma.event.create({ data: { type, payload } });
}

// ---------- notifications ----------
export async function notify(toUserId: string | null, toRole: string | null, title: string, body: string) {
  await prisma.notification.create({ data: { toUserId, toRole, title, body } });
}

// ---------- SLA evaluation (idempotent; runs on state reads) ----------
export async function evaluateSla() {
  const open = await prisma.serviceRequest.findMany({
    where: { status: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] } },
  });
  for (const r of open) {
    const ratio = slaElapsedRatio(r.createdAt.toISOString(), r.slaDeadline.toISOString());
    if (ratio >= 1) {
      const dup = await prisma.exceptionFlag.findFirst({
        where: { requestId: r.id, type: "SLA_BREACH", resolved: false },
      });
      if (!dup) {
        await prisma.exceptionFlag.create({
          data: { requestId: r.id, type: "SLA_BREACH", message: `SLA breached for ${r.code} (deadline passed).` },
        });
        await notify(null, "OPS_MANAGER", `SLA BREACH — ${r.code}`, "Deadline passed. Reassign or escalate.");
        await emit("SLA_BREACHED", { requestId: r.id, code: r.code });
      }
    } else if (ratio >= 0.8 && !r.slaWarned) {
      await prisma.serviceRequest.update({ where: { id: r.id }, data: { slaWarned: true } });
      await notify(null, "OPS_MANAGER", `SLA at risk: ${r.code}`, `${Math.round(ratio * 100)}% of SLA elapsed.`);
      await emit("SLA_AT_RISK", { requestId: r.id, code: r.code });
    }
  }
}

// ---------- DB → client snapshot (mirrors services/store DB shape) ----------
const iso = (d: Date | string) => new Date(d).toISOString();

export async function snapshot() {
  const [sites, machines, techs, parts, requests, reservations, assignments, logs, attachments, exceptions, notifications, users, audit, settings] =
    await Promise.all([
      prisma.site.findMany(),
      prisma.machine.findMany(),
      prisma.technician.findMany(),
      prisma.partInventory.findMany(),
      prisma.serviceRequest.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.reservation.findMany(),
      prisma.assignment.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.taskLog.findMany({ orderBy: { at: "desc" }, take: 400 }),
      prisma.attachment.findMany({ orderBy: { at: "desc" }, take: 200 }),
      prisma.exceptionFlag.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.notification.findMany({ orderBy: { at: "desc" }, take: 100 }),
      prisma.user.findMany(),
      prisma.auditLog.findMany({ orderBy: { at: "desc" }, take: 400 }),
      prisma.setting.findMany(),
    ]);
  const sla = settings.find((s) => s.key === "slaHours")?.value as Record<string, number> | undefined;
  return {
    sites: sites.map((s) => ({ ...s })),
    machines: machines.map((m) => ({ ...m })),
    techs: techs.map((t) => ({ ...t, updatedAt: undefined })),
    parts: parts.map((p) => ({ ...p })),
    requests: requests.map((r) => ({
      ...r, slaDeadline: iso(r.slaDeadline), createdAt: iso(r.createdAt),
      requiredParts: r.requiredParts as { sku: string; qty: number }[],
      validationReport: (r.validationReport ?? undefined) as ServiceValidationReport | undefined,
    })),
    reservations: reservations.map((x) => ({ ...x, createdAt: iso(x.createdAt) })),
    assignments: assignments.map((a) => ({
      ...a, createdAt: iso(a.createdAt),
      breakdown: a.breakdown as { skillMatch: number; proximity: number; availability: number; workload: number; total: number },
      acceptedAt: a.acceptedAt ? iso(a.acceptedAt) : undefined,
    })),
    logs: logs.map((l) => ({ ...l, at: iso(l.at), kind: l.kind as "NOTE" | "STATUS" | "PHOTO" })),
    attachments: attachments.map((a) => ({ ...a, at: iso(a.at) })),
    exceptions: exceptions.map((e) => ({ ...e, createdAt: iso(e.createdAt), type: e.type as "TECH_DROPOUT" | "PART_UNAVAILABLE" | "SLA_BREACH" | "TECH_CONFLICT" | "RESOURCE_CONFLICT" })),
    notifications: notifications.map((n) => ({ ...n, at: iso(n.at) })),
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, siteId: u.siteId, password: "" })),
    audit: audit.map((a) => ({ ...a, at: iso(a.at) })),
    slaHours: sla ?? { P1: 4, P2: 24, P3: 72, P4: 168 },
  };
}

interface ServiceValidationReport {
  checks: { name: string; result: "pass" | "warn" | "fail"; message: string }[];
  overall: "pass" | "warn" | "fail";
  at: string;
}

// ---------- hash-chained audit ----------
export async function audit(actor: string, action: string, entity: string, entityId: string, payload: unknown) {
  const { chainHash } = await import("../../src/lib/geo");
  const last = await prisma.auditLog.findFirst({ orderBy: { at: "desc" } });
  const prev = last?.hash ?? "GENESIS";
  const hash = chainHash(prev, JSON.stringify({ actor, action, entity, entityId, payload }));
  await prisma.auditLog.create({ data: { actor, action, entity, entityId, payload: payload as Prisma.InputJsonValue, prevHash: prev, hash } });
}
