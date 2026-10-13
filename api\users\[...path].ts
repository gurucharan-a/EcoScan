/**
 * GET   /api/users/me     — own profile (user + technician/customer profile).
 * PATCH /api/users/me     — onboarding + profile update (own record only).
 * GET   /api/users/skills — validated skill catalog for onboarding.
 * The server always derives identity from the JWT — client-supplied ids
 * for other users are never trusted here.
 */
import { ApiError, emit, fail, ok, prisma, requireAuth, route, type Handler, type VReq, type VRes } from "../../_lib";

const CATALOG_FALLBACK = ["Electrical", "Mechanical", "HVAC", "PLC", "Automation", "Networking", "Industrial Electronics", "Hydraulics", "Pneumatics", "Preventive Maintenance", "Troubleshooting"];

async function me(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { techProfile: { include: { skillLinks: { include: { skill: true } } } }, customerProfile: true },
  });
  if (!u) throw new ApiError("NOT_FOUND", "Account not found.", 404);
  const { passwordHash: _drop, ...safe } = u;
  void _drop;
  return safe;
}

async function saveMe(userId: string, body: Record<string, unknown>) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new ApiError("NOT_FOUND", "Account not found.", 404);

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : u.name;
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (u.role === "TECHNICIAN") {
    const skills = Array.isArray(body.skills) ? body.skills.map(String).filter(Boolean).slice(0, 12) : [];
    if (skills.length === 0) throw new ApiError("INVALID", "Select at least one skill.", 400);
    const catalog = await prisma.skill.findMany({ where: { name: { in: skills } } });
    const valid = new Set(catalog.map((s) => s.name));
    const invalid = skills.filter((s) => !valid.has(s));
    if (invalid.length > 0) throw new ApiError("INVALID", `Unknown skills: ${invalid.join(", ")}.`, 400);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError("INVALID", "Location is required (GPS or manual coordinates).", 400);
    const region = typeof body.region === "string" ? body.region.trim() : "";
    const experienceYears = Math.max(0, Math.min(50, Number(body.experienceYears ?? 1) || 1));
    const siteId = typeof body.siteId === "string" && body.siteId ? body.siteId : (u.siteId ?? "site-a");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { name, onboarded: true, siteId } });
      const t = await tx.technician.upsert({
        where: { userId },
        update: { name, siteId, lat, lng, online: true, experienceYears, region },
        create: { userId, name, siteId, skills, certifications: [], lat, lng, online: true, experienceYears, region },
      });
      await tx.technicianSkill.deleteMany({ where: { technicianId: t.id } });
      for (const s of catalog) {
        await tx.technicianSkill.create({ data: { technicianId: t.id, skillId: s.id } });
      }
      await tx.event.create({ data: { type: "TECHNICIAN_ONBOARDED", payload: { userId } } });
    });
  } else {
    const company = typeof body.company === "string" ? body.company.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const lat = body.lat == null || body.lat === "" ? null : Number(body.lat);
    const lng = body.lng == null || body.lng === "" ? null : Number(body.lng);
    if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
      throw new ApiError("INVALID", "Coordinates must be numbers.", 400);
    }
    const siteId = typeof body.siteId === "string" && body.siteId ? body.siteId : undefined;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { name, onboarded: true } });
      await tx.customerProfile.upsert({
        where: { userId },
        update: { company, phone, address, lat, lng, siteId },
        create: { userId, company, phone, address, lat, lng, siteId },
      });
      await tx.event.create({ data: { type: "CUSTOMER_ONBOARDED", payload: { userId } } });
    });
  }
  await emit("PROFILE_UPDATED", { userId });
  return me(userId);
}

const handler = route(async (req, user) => {
  const seg = req.query.path;
  const parts = (Array.isArray(seg) ? seg : seg ? [seg] : []) as string[];
  if (req.method === "GET" && parts[0] === "skills") {
    const all = await prisma.skill.findMany({ orderBy: { name: "asc" } });
    return { skills: all.length > 0 ? all : CATALOG_FALLBACK.map((name) => ({ name, category: "General" })) };
  }
  if (parts[0] === "me") {
    const me = requireAuth(user);
    if (req.method === "GET") return me(me.id);
    if (req.method === "PATCH") return saveMe(me.id, (req.body ?? {}) as Record<string, unknown>);
    throw new ApiError("INVALID", "Use GET or PATCH.", 405);
  }
  throw new ApiError("NOT_FOUND", `Unknown users endpoint: ${parts.join("/") || "(none)"}.`, 404);
}) as Handler;

export default handler;
