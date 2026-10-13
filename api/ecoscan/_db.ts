import process from "node:process";
/**
 * Shared foundation for /api/ecoscan/* (Vercel Node runtime + Prisma Postgres).
 * - Prisma singleton (serverless-safe)
 * - JSON envelope { success, data } / { success:false, error }
 * - 503 guard when DATABASE_URL is not configured (honest, never faked)
 * - Device-token guard for hardware routes (DEVICE_TOKEN env, never committed)
 */
import { PrismaClient } from "@prisma/client";

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

const g = globalThis as unknown as { __ecoPrisma?: PrismaClient };
export const prisma: PrismaClient =
  g.__ecoPrisma ?? (g.__ecoPrisma = new PrismaClient());

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

/** Throws 503 when no Postgres is configured — routes stay honest offline. */
export function needDb() {
  if (!process.env.DATABASE_URL) {
    throw new ApiError(
      "NO_DATABASE",
      "Postgres is not configured (DATABASE_URL missing). Set it in Vercel env vars and redeploy — see docs/DATABASE.md.",
      503,
    );
  }
}

export function needToken(req: VReq) {
  const expected = process.env.DEVICE_TOKEN;
  if (!expected) throw new ApiError("CONFIG", "Server misconfigured: DEVICE_TOKEN is not set.", 500);
  const h = req.headers["x-device-token"];
  const got = Array.isArray(h) ? h[0] : h;
  if (got !== expected) throw new ApiError("UNAUTHENTICATED", "Invalid X-Device-Token.", 401);
}

export function bodyOf(req: VReq): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === "string") {
    try { return JSON.parse(b) as Record<string, unknown>; } catch { return {}; }
  }
  return b as Record<string, unknown>;
}

export function str(q: string | string[] | undefined): string {
  return Array.isArray(q) ? (q[0] ?? "") : (q ?? "");
}

export function route(handler: (req: VReq) => Promise<unknown>) {
  return (async (req: VReq, res: VRes) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Token");
        res.status(200).json({ ok: true });
        return;
      }
      const data = await handler(req);
      ok(res, data);
    } catch (e) {
      if (e instanceof ApiError) fail(res, e.code, e.message, e.http);
      else {
        console.error("[ecoscan-api]", e instanceof Error ? e.message : e);
        fail(res, "INTERNAL", "Something went wrong.", 500);
      }
    }
  }) as Handler;
}

export async function audit(actor: string, action: string, entity: string, entityId: string, payload: unknown) {
  await prisma.auditEvent.create({
    data: { actor, action, entity, entityId, payload: payload as object },
  });
}

export async function raiseAlert(severity: string, title: string, body: string, scanId?: string) {
  await prisma.alert.create({ data: { severity, title, body, scanId } });
}

/** Ensure the default chamber device row exists (idempotent). */
export async function ensureDevice() {
  return prisma.device.upsert({
    where: { id: "esp32-01" },
    update: {},
    create: { id: "esp32-01", name: "Scanner Chamber 01", board: "ESP32-WROVER + OV2640", firmware: "eco-fw-v1.0.0" },
  });
}
