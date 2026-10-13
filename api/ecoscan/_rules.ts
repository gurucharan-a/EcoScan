/**
 * Server-side port of the recommendation engine (mirrors
 * src/ecoscan/lib/recommendation.ts, rules-v1.2.0) plus the scan state machine.
 * Kept dependency-free so it runs on Vercel Node AND is unit-testable.
 */
export const RULE_VERSION = "rules-v1.2.0";
export const MODEL_VERSION = "mock-clf-v0.3.0";
export const PROFILE_VERSION = "v1.3.0";
export const CONF_THRESHOLD = 0.6;

export const FLOW: Record<string, string[]> = {
  IDLE: ["SCANNING"],
  SCANNING: ["ANALYZING", "FAILED"],
  ANALYZING: ["AWAITING_CONFIRMATION", "NEEDS_MANUAL_REVIEW", "FAILED"],
  AWAITING_CONFIRMATION: ["READY_TO_SORT", "NEEDS_MANUAL_REVIEW", "FAILED"],
  READY_TO_SORT: ["SORTING", "FAILED"],
  SORTING: ["SORT_COMPLETE", "FAILED"],
  SORT_COMPLETE: [],
  FAILED: ["SCANNING", "NEEDS_MANUAL_REVIEW"],
  NEEDS_MANUAL_REVIEW: ["READY_TO_SORT", "SCANNING"],
};

export function assertTransition(from: string, to: string) {
  if (!(FLOW[from] ?? []).includes(to)) {
    const e = new Error(`Illegal scan transition ${from} -> ${to}`) as Error & { http?: number; code?: string };
    e.http = 400; e.code = "BAD_TRANSITION";
    throw e;
  }
}

export const SERVO_ANGLE: Record<string, number> = {
  REUSE_BIN: 30, REPAIR_BIN: 70, RECYCLE_BIN: 110, HAZARDOUS_BIN: 150, QUARANTINE: 90,
};

const REPAIRABLE = new Set([
  "mobile_phone", "laptop", "desktop", "monitor_tv", "audio",
  "small_appliance", "charger_adapter", "keyboard_mouse",
]);

export interface RuleInput {
  category: string;
  confidence: number;
  condition: string;
  swollen: boolean;
}

/** Returns [kind, destination]. Never infers internals from a photo. */
export function ruleKind(i: RuleInput): [string, string] {
  if (i.category === "unknown" || i.confidence < CONF_THRESHOLD) return ["MANUAL_REVIEW", "QUARANTINE"];
  if (i.swollen || i.category === "battery") return ["HAZARDOUS", "HAZARDOUS_BIN"];
  if (i.condition === "powers_on") return ["REUSE", "REUSE_BIN"];
  if ((i.condition === "powers_on_issue" || i.condition === "dead" || i.condition === "untested") && REPAIRABLE.has(i.category)) {
    return ["REPAIR", "REPAIR_BIN"];
  }
  return ["RECYCLE", "RECYCLE_BIN"];
}

export function encodeRec(kind: string, dest: string): string {
  return `${kind}|${dest}|${RULE_VERSION}`;
}

export function decodeRec(rec: string | null): { kind: string; dest: string; rule: string } | null {
  if (!rec) return null;
  const [kind, dest, rule] = rec.split("|");
  return { kind, dest, rule };
}
