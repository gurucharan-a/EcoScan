/** GET /api/ecoscan/devices — registered chambers with online derivation. */
import { ensureDevice, needDb, prisma, route } from "./_db.js";

export default route(async () => {
  needDb();
  await ensureDevice();
  const devices = await prisma.device.findMany({ orderBy: { createdAt: "asc" } });
  return {
    devices: devices.map((d) => ({
      ...d,
      online: d.lastSeen ? Date.now() - new Date(d.lastSeen).getTime() < 60000 : false,
    })),
  };
});
