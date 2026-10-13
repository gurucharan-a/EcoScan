/** POST /api/ecoscan/scans/[id]/recommend — transparent rule output, versioned. */
import { ApiError, audit, needDb, prisma, raiseAlert, route, str } from "../../_db.js";
import { encodeRec, ruleKind } from "../../_rules.js";

export default route(async (req) => {
  if (req.method !== "POST") throw new ApiError("METHOD", "Use POST.", 405);
  needDb();
  const id = str(req.query.id);
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) throw new ApiError("NOT_FOUND", "Scan not found.", 404);
  const cat = scan.confirmedCategory ?? scan.category;
  const [kind, dest] = ruleKind({ category: cat, confidence: scan.confidence, condition: scan.operatingCondition, swollen: scan.batterySwollen });
  const updated = await prisma.scan.update({
    where: { id }, data: { recommendation: encodeRec(kind, dest), sortDestination: dest },
  });
  if (kind === "HAZARDOUS") {
    await raiseAlert("critical", "Hazardous item detected", `${scan.code} routed to ${dest}.`, id);
  }
  await audit("system", "scan.recommend", "scan", id, { kind });
  return updated;
});
