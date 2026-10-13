// Sustainability math — every figure carries method + assumptions + source +
// uncertainty, and is labeled ESTIMATED unless a handover record verifies it.
export const FACTORS_VERSION = "factors-v1.1.0";

export interface SustainabilityFactors {
  co2PerKg: number; // kg CO2e avoided per kg e-waste diverted from landfill
  co2Source: string;
  materialValuePerKg: number; // INR per kg average recovered value
  version: string;
}

export const DEFAULT_FACTORS: SustainabilityFactors = {
  co2PerKg: 1.8,
  co2Source: "Illustrative planning factor (~1–3 kgCO₂e/kg in e-waste LCA literature, e.g. Baldé et al. Global E-waste Monitor; configured by operator, not measured).",
  materialValuePerKg: 140,
  version: FACTORS_VERSION,
};

export interface SustainabilitySummary {
  totalMassKg: number;
  divertedKg: number; // reuse+repair+recycle+hazardous routed (recorded, not verified processed)
  co2AvoidedKg: number;
  co2Method: string;
  co2Uncertainty: string;
  estMaterialValueInr: number;
  byCategory: { category: string; massKg: number; count: number }[];
  byDestination: { destination: string; massKg: number; count: number }[];
  reuseRepairCount: number;
  hazardousCount: number;
}

export function summarize(
  scans: { category: string; weightG: number | null; recommendationKind: string | null }[],
  factors: SustainabilityFactors,
): SustainabilitySummary {
  const byCat = new Map<string, { massKg: number; count: number }>();
  const byDst = new Map<string, { massKg: number; count: number }>();
  let totalG = 0, divertedG = 0, reuseRepair = 0, haz = 0;
  for (const s of scans) {
    const g = s.weightG ?? 0;
    totalG += g;
    if (s.recommendationKind && s.recommendationKind !== "MANUAL_REVIEW") divertedG += g;
    if (s.recommendationKind === "REUSE" || s.recommendationKind === "REPAIR") reuseRepair++;
    if (s.recommendationKind === "HAZARDOUS") haz++;
    const c = byCat.get(s.category) ?? { massKg: 0, count: 0 };
    c.massKg += g / 1000; c.count++; byCat.set(s.category, c);
    if (s.recommendationKind) {
      const d = byDst.get(s.recommendationKind) ?? { massKg: 0, count: 0 };
      d.massKg += g / 1000; d.count++; byDst.set(s.recommendationKind, d);
    }
  }
  const totalKg = totalG / 1000;
  return {
    totalMassKg: Math.round(totalKg * 1000) / 1000,
    divertedKg: Math.round((divertedG / 1000) * 1000) / 1000,
    co2AvoidedKg: Math.round((divertedG / 1000) * factors.co2PerKg * 100) / 100,
    co2Method: `ESTIMATED: diverted kg × ${factors.co2PerKg} kgCO₂e/kg (${factors.version}).`,
    co2Uncertainty: "±50% planning uncertainty. A recommendation is not a verified outcome — CO₂ is avoided only if the item is actually reused/repaired/recycled. Handover records mark verified mass.",
    estMaterialValueInr: Math.round((divertedG / 1000) * factors.materialValuePerKg),
    byCategory: [...byCat.entries()].map(([category, v]) => ({ category, massKg: Math.round(v.massKg * 1000) / 1000, count: v.count })),
    byDestination: [...byDst.entries()].map(([destination, v]) => ({ destination, massKg: Math.round(v.massKg * 1000) / 1000, count: v.count })),
    reuseRepairCount: reuseRepair,
    hazardousCount: haz,
  };
}
