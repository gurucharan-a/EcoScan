/** POST /api/ecoscan/devices/[id]/heartbeat — ESP32 telemetry (token-gated). */
import { ApiError, audit, bodyOf, ensureDevice, needDb, needToken, prisma, raiseAlert, route, str } from "../../_db";

export default route(async (req) => {
  if (req.method !== "POST") throw new ApiError("METHOD", "Use POST.", 405);
  needDb();
  needToken(req);
  const id = str(req.query.id);
  const b = bodyOf(req);
  await ensureDevice();
  const device = await prisma.device.upsert({
    where: { id },
    update: {
      lastSeen: new Date(), online: true,
      rssiDbm: typeof b.rssi_dbm === "number" ? b.rssi_dbm : null,
      health: { camera: Boolean(b.camera_ok), loadCell: Boolean(b.load_cell_ok), servo: Boolean(b.servo_ok), weightG: typeof b.weight_g === "number" ? b.weight_g : null },
    },
    create: {
      id, name: `Chamber ${id}`, board: "ESP32", firmware: "unknown",
      lastSeen: new Date(), online: true,
    },
  });
  if (b.servo_ok === false) {
    await raiseAlert("warning", "Servo fault reported", `${id} reports a servo fault — sorting blocked until resolved.`);
  }
  await audit("device", "device.heartbeat", "device", id, {});
  return { ok: true, at: new Date().toISOString(), online: device.online };
});
