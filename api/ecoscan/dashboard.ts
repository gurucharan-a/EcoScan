/** GET /api/ecoscan/dashboard — genuine Postgres aggregates, never hardcoded. */
import { audit, needDb, prisma, route } from "./_db";

export default route(async () => {
  needDb();
  const [totalScans, weight, awaiting, reuseRepair, recycle, hazardous, jobs] = await Promise.all([
    prisma.scan.count(),
    prisma.scan.aggregate({ _sum: { weightG: true } }),
    prisma.scan.count({ where: { status: { in: ["AWAITING_CONFIRMATION", "NEEDS_MANUAL_REVIEW"] } } }),
    prisma.scan.count({ where: { recommendation: { startsWith: "REUSE|" } } }).then((a) =>
      prisma.scan.count({ where: { recommendation: { startsWith: "REPAIR|" } } }).then((b) => a + b)),
    prisma.scan.count({ where: { recommendation: { startsWith: "RECYCLE|" } } }),
    prisma.scan.count({ where: { recommendation: { startsWith: "HAZARDOUS|" } } }),
    prisma.sortingJob.findMany({ where: { status: { in: ["COMPLETED", "FAILED"] } }, select: { status: true } }),
  ]);
  const done = jobs.length;
  const okCount = jobs.filter((j) => j.status === "COMPLETED").length;
  const byCategory = await prisma.scan.groupBy({ by: ["category"], _count: { category: true } });
  const recent = await prisma.scan.findMany({ orderBy: { createdAt: "desc" }, take: 6 });
  await audit("system", "dashboard.read", "dashboard", "summary", {});
  return {
    totalScans,
    totalWeightG: weight._sum.weightG ?? 0,
    awaitingReview: awaiting,
    reuseRepair,
    recycle,
    hazardous,
    sortSuccessRate: done === 0 ? null : Math.round((okCount / done) * 1000) / 10,
    byCategory: byCategory.map((c) => ({ name: c.category, count: c._count.category })),
    recent,
  };
});
