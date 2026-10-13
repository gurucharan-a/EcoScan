/** POST /api/ecoscan/scans/[id]/classify {category, confidence, provider?, simulated?} */
import { ApiError, audit, bodyOf, needDb, prisma, raiseAlert, route, str } from "../../_db";
import { assertTransition, CONF_THRESHOLD } from "../../_rules";

export default route(async (req) => {
  if (req.method !== "POST") throw new ApiError("METHOD", "Use POST.", 405);
  needDb();
  const id = str(req.query.id);
  const b = bodyOf(req);
  const category = String(b.category ?? "unknown");
  const confidence = Number(b.confidence ?? 0);
  if (!(confidence >= 0 && confidence <= 1)) throw new ApiError("INVALID", "confidence must be 0–1.", 400);
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) throw new ApiError("NOT_FOUND", "Scan not found.", 404);
  try { assertTransition(scan.status, "ANALYZING"); } catch (e) {
    throw new ApiError("BAD_TRANSITION", (e as Error).message, 400);
  }
  const needsReview = category === "unknown" || confidence < CONF_THRESHOLD;
  const next = needsReview ? "NEEDS_MANUAL_REVIEW" : "AWAITING_CONFIRMATION";
  const updated = await prisma.scan.update({
    where: { id },
    data: { predictedCategory: category, confidence, category, status: next },
  });
  if (needsReview) {
    await raiseAlert("warning", "Low classification confidence",
      `${scan.code}: ${category} at ${(confidence * 100).toFixed(1)}% — manual review required.`, id);
  }
  await audit("ai", "scan.classify", "scan", id, { category, confidence });
  return updated;
});
