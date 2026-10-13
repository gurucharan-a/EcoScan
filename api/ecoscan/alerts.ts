/** GET /api/ecoscan/alerts — newest first (event-generated only). */
import { needDb, prisma, route } from "./_db";

export default route(async () => {
  needDb();
  const items = await prisma.alert.findMany({ orderBy: { at: "desc" }, take: 100 });
  return { items, open: items.filter((a) => !a.resolved).length };
});
