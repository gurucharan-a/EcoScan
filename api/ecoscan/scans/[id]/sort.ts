/** POST /api/ecoscan/scans/[id]/sort {destination?} — authorize a sorting job (interlocks enforced). */
import { ApiError, audit, bodyOf, needDb, prisma, route, str } from "../../_db";
import { assertTransition, SERVO_ANGLE } from "../../_rules";

export default route(async (req) => {
  if (req.method !== "POST") throw new ApiError("METHOD", "Use POST.", 405);
  needDb();
  const id = str(req.query.id);
  const b = bodyOf(req);
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) throw new ApiError("NOT_FOUND", "Scan not found.", 404);
  const dest = typeof b.destination === "string" && b.destination ? b.destination : scan.sortDestination;
  if (!dest) throw new ApiError("INVALID", "No destination selected.", 400);
  if (!scan.confirmed) throw new ApiError("BAD_STATE", "Scan must be confirmed first.", 400);
  if (scan.batterySwollen && dest !== "HAZARDOUS_BIN" && dest !== "QUARANTINE") {
    throw new ApiError("INTERLOCK", "Safety interlock: swollen battery must go to Hazardous/Quarantine.", 400);
  }
  try { assertTransition(scan.status, "SORTING"); } catch (e) {
    throw new ApiError("BAD_TRANSITION", (e as Error).message, 400);
  }
  const job = await prisma.sortingJob.create({
    data: { scanId: id, destination: dest, status: "SENT", mode: "hardware", servoAngle: SERVO_ANGLE[dest] ?? 90 },
  });
  await prisma.scan.update({ where: { id }, data: { status: "SORTING", sortDestination: dest } });
  await audit("operator", "sort.submit", "job", job.id, { scanId: id, dest });
  return job;
});
