/**
 * POST /api/auth/register — customer/technician self-signup (bcrypt-hashed).
 * POST /api/auth/login    — email + password → JWT + user.
 * GET  /api/auth/me       — session check (Bearer token).
 */
import { ApiError, checkPassword, hashPassword, prisma, publicUser, requireAuth, route, signToken } from "../../_lib";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function register(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "CUSTOMER").toUpperCase();
  if (!name) throw new ApiError("INVALID", "Full name is required.", 400);
  if (!EMAIL_RE.test(email)) throw new ApiError("INVALID", "Enter a valid work email address.", 400);
  if (role !== "CUSTOMER" && role !== "TECHNICIAN") {
    throw new ApiError("FORBIDDEN", "Self-registration is open to customers and technicians.", 403);
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new ApiError("DUPLICATE", "An account with this email already exists.", 409);
  const u = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password), role: role as "CUSTOMER" | "TECHNICIAN", onboarded: false },
  });
  return { token: signToken(u.id), user: publicUser(u) };
}

async function login(body: Record<string, unknown>) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!EMAIL_RE.test(email)) throw new ApiError("INVALID", "Enter a valid work email address.", 400);
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u || !(await checkPassword(password, u.passwordHash))) {
    throw new ApiError("BAD_CREDENTIALS", "Invalid email or password.", 401);
  }
  return { token: signToken(u.id), user: publicUser(u) };
}

export default route(async (req, user) => {
  const seg = req.query.path;
  const action = Array.isArray(seg) ? seg[0] : seg;
  if (req.method === "POST" && action === "register") return register((req.body ?? {}) as Record<string, unknown>);
  if (req.method === "POST" && action === "login") return login((req.body ?? {}) as Record<string, unknown>);
  if (req.method === "GET" && (action === "me" || action === undefined)) {
    requireAuth(user);
    return { user };
  }
  throw new ApiError("NOT_FOUND", `Unknown auth endpoint: ${action ?? "(none)"}.`, 404);
});
