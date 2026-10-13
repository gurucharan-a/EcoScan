// Typed client for the Prisma-Postgres API (api/ecoscan/* on Vercel).
// Same-origin by default (pgBase ""), or an absolute deployment URL in Settings.
// All responses use the { success, data } envelope; errors throw with .code.
import type {
  Alert, DeviceCategory, RecommendationKind, RecommendationResult,
  Scan, ScanStatus, SortDestination, SortingJob,
} from "@/ecoscan/types";

export class PgError extends Error {
  code: string;
  http: number;
  constructor(code: string, message: string, http: number) {
    super(message);
    this.code = code; this.http = http;
  }
}

async function call<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${base.replace(/\/$/, "")}/api/ecoscan/${path.replace(/^\//, "")}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  } catch {
    throw new PgError("NETWORK", `Cannot reach Postgres API at ${url}. Is the deployment up and DATABASE_URL set?`, 0);
  }
  let body: { success: boolean; data?: T; error?: { code: string; message: string } };
  try { body = await res.json(); } catch {
    throw new PgError("BAD_RESPONSE", `API returned non-JSON (${res.status}).`, res.status);
  }
  if (!body.success) throw new PgError(body.error?.code ?? "API_ERROR", body.error?.message ?? "API error.", res.status);
  return body.data as T;
}

export const pgHealth = (base: string) =>
  call<{ ok: boolean; database: string; model: string; rules: string; profiles: string }>(base, "health");

export interface PgSummary {
  totalScans: number; totalWeightG: number; awaitingReview: number;
  reuseRepair: number; recycle: number; hazardous: number;
  sortSuccessRate: number | null;
  byCategory: { name: string; count: number }[];
  recent: Record<string, unknown>[];
}
export const pgSummary = (base: string) => call<PgSummary>(base, "dashboard");

// ---------- mappers: Prisma row -> local Scan shape ----------
const KIND_EXPLAIN: Record<string, string> = {
  REUSE: "The item appears suitable for reuse after an appropriate functional inspection.",
  REPAIR: "Repair may be worthwhile — category is repairable and condition justifies bench assessment.",
  RECYCLE: "The item should go to an authorized e-waste recycling process for material recovery.",
  HAZARDOUS: "Requires special handling: hazardous materials or batteries suspected.",
  MANUAL_REVIEW: "Evidence is insufficient for safe automatic routing — manual review required.",
};

function parseRec(row: Record<string, unknown>): RecommendationResult | null {
  const raw = row.recommendation as string | null;
  if (!raw) return null;
  const [kind, dest, rule] = raw.split("|");
  return {
    kind: kind as RecommendationKind,
    explanation: KIND_EXPLAIN[kind] ?? kind,
    evidence: [`Server rule ${rule}: category '${row.category}' at ${((row.confidence as number) * 100).toFixed(1)}% confidence.`],
    uncertainty: ["Computed server-side from reported (not sensed-by-server) values."],
    ruleVersion: rule,
    destination: dest as SortDestination,
  };
}

export function toLocalScan(row: Record<string, unknown>): Scan {
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    category: row.category as DeviceCategory,
    predictedCategory: row.predictedCategory as DeviceCategory,
    confidence: row.confidence as number,
    modelVersion: row.modelVersion as string,
    inferenceSimulated: Boolean(row.inferenceSimulated),
    weightG: (row.weightG as number | null) ?? null,
    weightSimulated: Boolean(row.weightSimulated),
    imageDataUrl: null,
    imageName: null,
    brand: (row.brand as string) ?? undefined,
    model: (row.model as string) ?? undefined,
    visibleDamage: (row.visibleDamage as string) ?? "",
    operatingCondition: (row.operatingCondition as Scan["operatingCondition"]) ?? "untested",
    batteryPresent: Boolean(row.batteryPresent),
    batterySwollen: Boolean(row.batterySwollen),
    sensor: null,
    recommendation: parseRec(row),
    status: row.status as ScanStatus,
    sortDestination: (row.sortDestination as SortDestination | null) ?? null,
    sortJobId: null,
    confirmed: Boolean(row.confirmed),
    confirmedCategory: (row.confirmedCategory as DeviceCategory | null) ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    dataSources: ["postgres-api"],
  };
}

export function toLocalJob(row: Record<string, unknown>): SortingJob {
  return {
    id: row.id as string,
    scanId: row.scanId as string,
    destination: row.destination as SortDestination,
    status: row.status as SortingJob["status"],
    mode: row.mode as SortingJob["mode"],
    servoAngle: (row.servoAngle as number | null) ?? null,
    attempts: (row.attempts as number) ?? 0,
    lastError: (row.lastError as string | null) ?? null,
    ackAt: row.ackAt ? String(row.ackAt) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt ?? row.createdAt),
  };
}

export function toLocalAlert(row: Record<string, unknown>): Alert {
  return {
    id: row.id as string,
    severity: row.severity as Alert["severity"],
    title: row.title as string,
    body: row.body as string,
    scanId: (row.scanId as string) ?? undefined,
    acked: Boolean(row.acked),
    resolved: Boolean(row.resolved),
    at: String(row.at),
  };
}

// ---------- scan lifecycle ----------
export async function pgListScans(base: string, params: { q?: string; category?: string; status?: string; limit?: number }): Promise<Scan[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.status) qs.set("status", params.status);
  qs.set("limit", String(params.limit ?? 50));
  const data = await call<{ items: Record<string, unknown>[] }>(base, `scans?${qs}`);
  return data.items.map(toLocalScan);
}

export async function pgGetScan(base: string, id: string): Promise<{ scan: Scan; job: SortingJob | null }> {
  const row = await call<Record<string, unknown> & { jobs?: Record<string, unknown>[] }>(base, `scans/${id}`);
  return { scan: toLocalScan(row), job: row.jobs?.[0] ? toLocalJob(row.jobs[0]) : null };
}

export async function pgCreateScan(base: string, input: {
  name: string; imageName?: string | null; weightG: number | null; weightSimulated: boolean;
  brand?: string; model?: string; visibleDamage?: string; operatingCondition?: string;
  batteryPresent?: boolean; batterySwollen?: boolean;
}): Promise<Scan> {
  const row = await call<Record<string, unknown>>(base, "scans", {
    method: "POST",
    body: JSON.stringify({
      name: input.name, image_name: input.imageName, weight_g: input.weightG,
      weight_simulated: input.weightSimulated, brand: input.brand, model: input.model,
      visible_damage: input.visibleDamage, operating_condition: input.operatingCondition,
      battery_present: input.batteryPresent, battery_swollen: input.batterySwollen,
    }),
  });
  return toLocalScan(row);
}

export const pgClassify = async (base: string, id: string, category: string, confidence: number, simulated: boolean): Promise<Scan> =>
  toLocalScan(await call<Record<string, unknown>>(base, `scans/${id}/classify`, {
    method: "POST", body: JSON.stringify({ category, confidence, provider: simulated ? "mock" : "api", simulated }),
  }));

export const pgRecommend = async (base: string, id: string): Promise<Scan> =>
  toLocalScan(await call<Record<string, unknown>>(base, `scans/${id}/recommend`, { method: "POST" }));

export const pgConfirm = async (base: string, id: string, category?: string | null): Promise<Scan> =>
  toLocalScan(await call<Record<string, unknown>>(base, `scans/${id}/confirm`, {
    method: "POST", body: JSON.stringify({ category: category ?? null }),
  }));

export const pgSort = async (base: string, id: string, destination?: string): Promise<SortingJob> =>
  toLocalJob(await call<Record<string, unknown>>(base, `scans/${id}/sort`, {
    method: "POST", body: JSON.stringify({ destination: destination ?? null }),
  }));

export const pgGetJob = async (base: string, id: string): Promise<SortingJob> =>
  toLocalJob(await call<Record<string, unknown>>(base, `jobs/${id}`));

export const pgAlerts = async (base: string): Promise<Alert[]> =>
  (await call<{ items: Record<string, unknown>[] }>(base, "alerts")).items.map(toLocalAlert);

export const pgDevices = async (base: string): Promise<Record<string, unknown>[]> =>
  (await call<{ devices: Record<string, unknown>[] }>(base, "devices")).devices;
