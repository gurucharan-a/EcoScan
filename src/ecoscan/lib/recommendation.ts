// Transparent rule-based recommendation engine. Rule version is stored on every
// result so history stays interpretable when rules change.
// NEVER infers electrical safety / battery integrity / internal function from a photo.
import type { DeviceCategory, RecommendationKind, RecommendationResult, SortDestination } from "@/ecoscan/types";

export const RULE_VERSION = "rules-v1.2.0";

export interface RecInput {
  category: DeviceCategory;
  confidence: number;
  operatingCondition: "powers_on" | "powers_on_issue" | "dead" | "untested";
  visibleDamage: string; // free text
  batteryPresent: boolean;
  batterySwollen: boolean;
  weightG: number | null;
  repairCostInr: number | null;
  newPriceInr: number | null;
}

export interface DestMap { [k: string]: SortDestination; }
export const DEFAULT_DEST_MAP: Record<RecommendationKind, SortDestination> = {
  REUSE: "REUSE_BIN",
  REPAIR: "REPAIR_BIN",
  RECYCLE: "RECYCLE_BIN",
  HAZARDOUS: "HAZARDOUS_BIN",
  MANUAL_REVIEW: "QUARANTINE",
};

const HAZARDOUS_CATS: DeviceCategory[] = ["battery", "mobile_phone", "laptop", "monitor_tv", "circuit_board"];
const REPAIRABLE_CATS: DeviceCategory[] = ["mobile_phone", "laptop", "desktop", "monitor_tv", "audio", "small_appliance", "charger_adapter", "keyboard_mouse"];

function damageSeverity(text: string): "none" | "minor" | "severe" {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return "none";
  if (/(shatter|crack.*screen|burn|melt|swell|swollen|leak|smoke|broken.*board|crush)/.test(t)) return "severe";
  if (/(scratch|dent|scuff|dust|faded|loose)/.test(t)) return "minor";
  return "minor";
}

export function recommend(input: RecInput, threshold = 0.6, destMap: Record<RecommendationKind, SortDestination> = DEFAULT_DEST_MAP): RecommendationResult {
  const evidence: string[] = [];
  const uncertainty: string[] = [];
  const dmg = damageSeverity(input.visibleDamage);

  // R0 — insufficient evidence
  if (input.category === "unknown" || input.confidence < threshold) {
    evidence.push(`Category '${input.category}' with confidence ${(input.confidence * 100).toFixed(1)}% is below the ${Math.round(threshold * 100)}% confirmation threshold.`);
    uncertainty.push("Visual identification is uncertain; database composition does not apply until a category is manually confirmed.");
    return {
      kind: "MANUAL_REVIEW",
      explanation: "Evidence is insufficient for safe automatic routing. The item is quarantined for manual review.",
      evidence, uncertainty, ruleVersion: RULE_VERSION, destination: destMap.MANUAL_REVIEW,
    };
  }
  evidence.push(`Category '${input.category}' confirmed at ${(input.confidence * 100).toFixed(1)}% confidence (≥ threshold).`);

  // R1 — swollen/leaking battery always wins
  if (input.batterySwollen) {
    evidence.push("Battery swelling or leak reported — fire and chemical risk.");
    uncertainty.push("Internal battery state cannot be verified from a photo; treat report as authoritative and isolate.");
    return {
      kind: "HAZARDOUS",
      explanation: "Swollen or leaking battery: isolate immediately and route to the hazardous stream. Do not place in ordinary bins.",
      evidence, uncertainty, ruleVersion: RULE_VERSION, destination: destMap.HAZARDOUS,
    };
  }

  // R2 — loose batteries
  if (input.category === "battery") {
    evidence.push("Item is a loose battery; chemistry-specific handling applies.");
    return {
      kind: "HAZARDOUS",
      explanation: "Loose batteries require special handling: tape terminals and hand over to a battery collection stream.",
      evidence, uncertainty, ruleVersion: RULE_VERSION, destination: destMap.HAZARDOUS,
    };
  }

  // R3 — hazardous categories with severe damage
  if (HAZARDOUS_CATS.includes(input.category) && dmg === "severe") {
    evidence.push(`Severe visible damage ('${input.visibleDamage.slice(0, 80)}') on a category that may contain hazardous materials.`);
    uncertainty.push("Internal containment (battery pouch, CCFL tube, capacitor) cannot be confirmed visually.");
    return {
      kind: "HAZARDOUS",
      explanation: "Severe damage on a potentially hazardous category — route to hazardous handling for trained inspection.",
      evidence, uncertainty, ruleVersion: RULE_VERSION, destination: destMap.HAZARDOUS,
    };
  }

  // R4 — reuse: powers on, no/mild damage, battery ok
  if (input.operatingCondition === "powers_on" && dmg !== "severe") {
    evidence.push("User reports the device powers on normally.");
    if (dmg === "minor") evidence.push("Only minor cosmetic damage observed.");
    uncertainty.push("Reuse assumes a functional inspection and data wipe; photo alone does not prove functionality.");
    return {
      kind: "REUSE",
      explanation: "The item appears suitable for reuse after an appropriate functional inspection and data wipe (where applicable).",
      evidence, uncertainty, ruleVersion: RULE_VERSION, destination: destMap.REUSE,
    };
  }

  // R5 — repair: powers with issues or dead but repairable, economics ok
  if (REPAIRABLE_CATS.includes(input.category) && (input.operatingCondition === "powers_on_issue" || input.operatingCondition === "dead" || input.operatingCondition === "untested") && dmg !== "severe") {
    if (input.repairCostInr != null && input.newPriceInr != null && input.newPriceInr > 0) {
      const ratio = input.repairCostInr / input.newPriceInr;
      evidence.push(`Estimated repair ₹${input.repairCostInr} vs new ₹${input.newPriceInr} (ratio ${(ratio * 100).toFixed(0)}%).`);
      if (ratio > 0.6) {
        uncertainty.push("Repair cost exceeds 60% of replacement — economics are marginal.");
        return {
          kind: "RECYCLE",
          explanation: "Repair cost is high relative to replacement; recycling recovers materials with less economic risk.",
          evidence, uncertainty, ruleVersion: RULE_VERSION, destination: destMap.RECYCLE,
        };
      }
    } else {
      uncertainty.push("No repair-cost estimate supplied — repair recommendation is provisional.");
    }
    evidence.push(`Category '${input.category}' is commonly repairable; reported state '${input.operatingCondition}'.`);
    return {
      kind: "REPAIR",
      explanation: "Repair may be worthwhile — category is repairable and condition justifies bench assessment.",
      evidence, uncertainty, ruleVersion: RULE_VERSION, destination: destMap.REPAIR,
    };
  }

  // R6 — default recycle
  evidence.push("Item does not meet reuse/repair criteria; material recovery is the defensible route.");
  if (input.batteryPresent) uncertainty.push("Battery present — remove before shredding stream.");
  return {
    kind: "RECYCLE",
    explanation: "The item should go to an authorized e-waste recycling process for material recovery.",
    evidence, uncertainty, ruleVersion: RULE_VERSION, destination: destMap.RECYCLE,
  };
}
