/** GET /api/ecoscan/scans/[id] — one scan with its latest sorting job. */
import { ApiError, needDb, prisma, route, str } from "../_db";

export default route(async (req) => {
  needDb();
  const id = str(req.query.id);
  const scan = await prisma.scan.findUnique({ where: { id }, include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!scan) throw new ApiError("NOT_FOUND", "Scan not found.", 404);
  return scan;
});
