/** POST /api/ecoscan/scans/[id]/confirm {category?} — confirm (or correct) then recommend. */
import { ApiError, audit, bodyOf, needDb, prisma, route, str } from "../../_db";
import { assertTransition, encodeRec, ruleKind } from "../../_rules";

export default route(async (req) => {
  if (req.method !== "POST") throw new ApiError("METHOD", "Use POST.", 405);
  needDb();
  const id = str(req.query.id);
  const b = bodyOf(req);
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) throw new ApiError("NOT_FOUND", "Scan not found.", 404);
  if (scan.status !== "AWAITING_CONFIRMATION" && scan.status !== "NEEDS_MANUAL_REVIEW") {
    throw new ApiError("BAD_STATE", `Cannot confirm from state ${scan.status}.`, 400);
  }
  const cat = typeof b.category === "string" && b.category ? b.category : scan.predictedCategory;
  if (cat !== scan.predictedCategory) {
    await audit("operator", "scan.reclassify", "scan", id, { from: scan.category, to: cat });
  }
  try { assertTransition(scan.status, "READY_TO_SORT"); } catch (e) {
    throw new ApiError("BAD_TRANSITION", (e as Error).message, 400);
  }
  const [kind, dest] = ruleKind({ category: cat, confidence: scan.confidence, condition: scan.operatingCondition, swollen: scan.batterySwollen });
  const updated = await prisma.scan.update({
    where: { id },
    data: {
      category: cat, confirmed: true, confirmedCategory: cat,
      status: "READY_TO_SORT", recommendation: encodeRec(kind, dest), sortDestination: dest,
    },
  });
  await audit("operator", "scan.confirm", "scan", id, { category: cat, kind });
  return updated;
});
