import type { RequestStatus } from "@/types";

// Server-side state machine. Illegal transitions rejected (throws).
const ALLOWED: Record<RequestStatus, RequestStatus[]> = {
  CREATED: ["VALIDATED", "EXCEPTION", "CANCELLED"],
  VALIDATED: ["PENDING_APPROVAL", "EXCEPTION", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "EXCEPTION", "CANCELLED"],
  APPROVED: ["ASSIGNED", "EXCEPTION", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "EXCEPTION", "CANCELLED"],
  IN_PROGRESS: ["PENDING_VERIFICATION", "EXCEPTION"],
  PENDING_VERIFICATION: ["CLOSED", "EXCEPTION", "IN_PROGRESS"],
  EXCEPTION: ["APPROVED", "ASSIGNED", "IN_PROGRESS", "PENDING_APPROVAL"],
  REJECTED: ["PENDING_APPROVAL"],
  CANCELLED: ["CREATED"],
  CLOSED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}
export function assertTransition(from: RequestStatus, to: RequestStatus) {
  if (!canTransition(from, to)) throw new Error(`Illegal transition ${from} -> ${to}`);
}

/**
 * Optimistic-lock guard: callers holding a stale revision are rejected
 * instead of silently overwriting a newer update. Pass nothing to skip.
 */
export function assertFresh(currentRev: number | undefined, expectedRev: number | undefined, what: string) {
  if (expectedRev == null) return;
  if ((currentRev ?? 0) !== expectedRev) {
    throw new Error(`${what} changed underneath you (rev ${expectedRev} → ${currentRev ?? 0}). Refresh and retry.`);
  }
}

// RBAC matrix — mirrored in Next.js middleware (see README).
export const RBAC: Record<string, string[]> = {
  "request:create": ["CUSTOMER", "OPS_MANAGER", "ADMIN"],
  "request:approve": ["OPS_MANAGER", "ADMIN"],
  "request:reject": ["OPS_MANAGER", "ADMIN"],
  "request:cancel": ["OPS_MANAGER", "ADMIN"],
  "request:resubmit": ["CUSTOMER", "OPS_MANAGER", "ADMIN"],
  "request:reschedule": ["OPS_MANAGER", "ADMIN"],
  "request:escalate": ["OPS_MANAGER", "ADMIN"],
  "request:assign": ["OPS_MANAGER", "ADMIN"],
  "request:accept": ["TECHNICIAN"],
  "request:status": ["TECHNICIAN", "OPS_MANAGER", "ADMIN"],
  "request:verify": ["OPS_MANAGER", "ADMIN"],
  "inventory:manage": ["ADMIN", "OPS_MANAGER"],
  "users:manage": ["ADMIN"],
  "settings:sla": ["ADMIN"],
  "demo:controls": ["OPS_MANAGER", "ADMIN"],
};
export function can(role: string, action: string) {
  return (RBAC[action] ?? []).includes(role);
}
