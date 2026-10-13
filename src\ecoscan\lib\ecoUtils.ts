import type { DeviceCategory, MaterialProfile } from "@/ecoscan/types";
import { getProfile } from "@/ecoscan/data/materialProfiles";
import type { ComponentEstimate } from "@/ecoscan/types";

// Estimated component masses = measured weight × typical fraction midpoint.
// Qualitative components (fraction null) never get a fabricated mass.
export function estimateComponents(category: DeviceCategory, weightG: number | null, profile?: MaterialProfile): ComponentEstimate[] {
  const p = profile ?? getProfile(category);
  return p.components.map((c) => {
    if (c.massFractionMin == null || c.massFractionMax == null || weightG == null) {
      return {
        component: c.component, material: c.materials,
        massFraction: null, estimatedMassG: null,
        confidence: "qualitative" as const, destination: c.recovery,
      };
    }
    const mid = (c.massFractionMin + c.massFractionMax) / 2;
    return {
      component: c.component, material: c.materials,
      massFraction: Math.round(mid * 1000) / 1000,
      estimatedMassG: Math.round(weightG * mid * 10) / 10,
      confidence: c.reliability as "high" | "medium" | "low",
      destination: c.recovery,
    };
  });
}

export const fmtG = (g: number | null) =>
  g == null ? "—" : g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;

export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
