/** GET /api/ecoscan/jobs/[id] — one sorting job. */
import { ApiError, needDb, prisma, route, str } from "../_db.js";

export default route(async (req) => {
  needDb();
  const id = str(req.query.id);
  const job = await prisma.sortingJob.findUnique({ where: { id } });
  if (!job) throw new ApiError("NOT_FOUND", "Job not found.", 404);
  return job;
});
