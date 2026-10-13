/** GET /api/ecoscan/health — liveness + versions (works without a database). */
import { MODEL_VERSION, PROFILE_VERSION, RULE_VERSION } from "./_rules";
import { route } from "./_db";

export default route(async () => ({
  ok: true,
  database: process.env.DATABASE_URL ? "postgres-configured" : "not-configured",
  model: MODEL_VERSION,
  rules: RULE_VERSION,
  profiles: PROFILE_VERSION,
  time: new Date().toISOString(),
}));
