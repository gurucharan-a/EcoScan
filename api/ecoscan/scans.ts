/**
 * GET  /api/ecoscan/scans?q=&category=&status=&limit=&offset= — filtered history
 * POST /api/ecoscan/scans — create a scan (status SCANNING)
 */
import { ApiError, audit, bodyOf, needDb, prisma, route, str, type VReq } from "./_db.js";
import type { Prisma } from "@prisma/client";
import { MODEL_VERSION } from "./_rules.js";

async function list(req: VReq) {
  needDb();
  const q = str(req.query.q).toLowerCase();
  const category = str(req.query.category);
  const status = str(req.query.status);
  const limit = Math.min(100, Math.max(1, Number(str(req.query.limit)) || 50));
  const offset = Math.max(0, Number(str(req.query.offset)) || 0);
  const where: Prisma.ScanWhereInput = {};
  if (category) where.category = category;
  if (status) where.status = status;
  let items = await prisma.scan.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset });
  if (q) {
    items = items.filter((s) => (s.name + s.code + s.id + s.category).toLowerCase().includes(q));
  }
  return { items, count: items.length };
}

async function create(req: VReq) {
  needDb();
  const b = bodyOf(req);
  const name = String(b.name ?? "").trim().slice(0, 120);
  if (!name) throw new ApiError("INVALID", "Item name is required.", 400);
  const weightG = b.weight_g == null || b.weight_g === "" ? null : Number(b.weight_g);
  if (weightG != null && !(weightG >= 0 && weightG <= 20000)) {
    throw new ApiError("INVALID", "weight_g must be 0–20000.", 400);
  }
  const n = await prisma.scan.count();
  const code = `EC-${String(n + 1).padStart(4, "0")}`;
  const scan = await prisma.scan.create({
    data: {
      code, name,
      category: "unknown", predictedCategory: "unknown", confidence: 0,
      modelVersion: MODEL_VERSION, inferenceSimulated: true,
      weightG, weightSimulated: Boolean(b.weight_simulated ?? true),
      imageUrl: typeof b.image_url === "string" ? String(b.image_url).slice(0, 500) : null,
      brand: typeof b.brand === "string" ? b.brand : null,
      model: typeof b.model === "string" ? b.model : null,
      visibleDamage: String(b.visible_damage ?? ""),
      operatingCondition: String(b.operating_condition ?? "untested"),
      batteryPresent: Boolean(b.battery_present),
      batterySwollen: Boolean(b.battery_swollen),
      status: "SCANNING",
    },
  });
  if (weightG != null && (weightG < 5 || weightG > 15000)) {
    await prisma.alert.create({
      data: { severity: "warning", title: "Unusual weight reading", body: `${code}: ${weightG} g outside 5 g – 15 kg. Check calibration.`, scanId: scan.id },
    });
  }
  await audit("operator", "scan.create", "scan", scan.id, { code, weightG });
  return scan;
}

export default route(async (req) => {
  if (req.method === "GET") return list(req);
  if (req.method === "POST") return create(req);
  throw new ApiError("METHOD", "Use GET or POST.", 405);
});
