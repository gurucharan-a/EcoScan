/** POST /api/ecoscan/jobs/[id]/ack {ok, detail?} — ESP32 acknowledgement (token-gated). */
import { ApiError, audit, bodyOf, needDb, needToken, prisma, raiseAlert, route, str } from "../../_db";

export default route(async (req) => {
  if (req.method !== "POST") throw new ApiError("METHOD", "Use POST.", 405);
  needDb();
  needToken(req);
  const id = str(req.query.id);
  const b = bodyOf(req);
  const job = await prisma.sortingJob.findUnique({ where: { id } });
  if (!job) throw new ApiError("NOT_FOUND", "Job not found.", 404);
  if (job.status === "COMPLETED") throw new ApiError("DUPLICATE", "Duplicate ack — job already completed.", 409);
  if (b.ok === true) {
    await prisma.sortingJob.update({ where: { id }, data: { status: "COMPLETED", ackAt: new Date() } });
    await prisma.scan.update({ where: { id: job.scanId }, data: { status: "SORT_COMPLETE" } });
  } else {
    const attempts = job.attempts + 1;
    const status = attempts >= 3 ? "FAILED" : "SENT";
    await prisma.sortingJob.update({ where: { id }, data: { status, attempts, lastError: String(b.detail ?? "ESP32 reported failure") } });
    if (status === "FAILED") {
      await prisma.scan.update({ where: { id: job.scanId }, data: { status: "FAILED" } });
      await raiseAlert("warning", "Sorting failed", String(b.detail ?? "Actuator reported failure."), job.scanId);
    }
  }
  await audit("device", "sort.ack", "job", id, { ok: b.ok });
  return prisma.sortingJob.findUnique({ where: { id } });
});
