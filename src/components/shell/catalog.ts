import type { Machine, Site, Technician } from "@/types";

/** Shared display catalog — one source of truth for codes/names across
 *  tables, drawers, maps and reports. IDs come from the store; this only
 *  adds presentation metadata so every module stays interconnected. */

export const SITE_META: Record<string, { st: string; contact: string; email: string; loc: string }> = {
  "site-a": { st: "ST-01", contact: "Sarah Chen", email: "s.chen@riverside.example", loc: "Detroit, MI" },
  "site-b": { st: "ST-02", contact: "Marcus Reed", email: "m.reed@northwind.example", loc: "Cleveland, OH" },
  "site-c": { st: "ST-03", contact: "Elena Torres", email: "e.torres@summit.example", loc: "Pittsburgh, PA" },
  "site-d": { st: "ST-04", contact: "Arun Prakash", email: "a.prakash@oragadam.example", loc: "Oragadam, TN" },
  "site-e": { st: "ST-05", contact: "Divya Nair", email: "d.nair@central.example", loc: "Chennai, TN" },
};

export const SITE_NAME: Record<string, string> = {
  "site-a": "Riverside Manufacturing",
  "site-b": "Northwind Assembly",
  "site-c": "Summit Processing",
  "site-d": "Oragadam Facility",
  "site-e": "Chennai Central Warehouse",
};

export const MACHINE_META: Record<string, { eq: string; display: string; criticality: string; model: string; skill: string }> = {
  "m-101": { eq: "EQ-101", display: "Hydraulic Press HP-200", criticality: "Critical", model: "Bosch Rexroth HP-200", skill: "Hydraulics" },
  "m-102": { eq: "EQ-102", display: "CNC Milling Machine", criticality: "High", model: "Haas VF-4", skill: "Mechanical" },
  "m-103": { eq: "EQ-103", display: "Industrial Compressor", criticality: "High", model: "Atlas Copco GA75", skill: "Pneumatics" },
  "m-104": { eq: "EQ-104", display: "Conveyor Belt System", criticality: "Critical", model: "Dorner 3200", skill: "Mechanical" },
  "m-105": { eq: "EQ-107", display: "Injection Moulder IM-22", criticality: "Medium", model: "Arburg 520H", skill: "Hydraulics" },
  "m-106": { eq: "EQ-108", display: "Boiler B-2", criticality: "High", model: "Cleaver-Brooks CB", skill: "Welding" },
  "m-107": { eq: "EQ-109", display: "Lathe L-9", criticality: "Low", model: "DMG Mori NLX", skill: "Electrical" },
  "m-108": { eq: "EQ-110", display: "Vibration Tester VT-1", criticality: "Medium", model: "SKF Microlog", skill: "Vibration" },
  "m-109": { eq: "EQ-111", display: "Packaging Line P-3", criticality: "Medium", model: "Bosch Pack 301", skill: "Conveyor" },
  "m-110": { eq: "EQ-105", display: "Cooling Unit CU-500", criticality: "High", model: "Trane CU-500", skill: "Electrical" },
  "m-111": { eq: "EQ-106", display: "Robotic Welding Arm", criticality: "Critical", model: "ABB IRB 2600", skill: "Electrical" },
  "m-112": { eq: "EQ-112", display: "Generator G-250kVA", criticality: "Medium", model: "Cummins C250", skill: "Electrical" },
};

export const TECH_CODE: Record<string, string> = {
  "t-01": "TC-01", "t-02": "TC-02", "t-03": "TC-03", "t-04": "TC-04", "t-05": "TC-05",
  "t-06": "TC-06", "t-07": "TC-07", "t-08": "TC-08", "t-09": "TC-09", "t-10": "TC-10",
};

/** Deterministic work-order number derived from the parent request code. */
export function woForRequest(code: string): string {
  const n = parseInt(code.replace(/\D/g, "").slice(-4), 10);
  return "WO-" + (2000 + (Number.isFinite(n) ? n : 42));
}

export function siteLabel(site?: Site): string {
  if (!site) return "—";
  return SITE_NAME[site.id] ?? site.name;
}
export function siteCode(siteId: string): string {
  return SITE_META[siteId]?.st ?? siteId.toUpperCase();
}
export function machineLabel(m?: Machine): string {
  if (!m) return "—";
  return MACHINE_META[m.id]?.display ?? m.name;
}
export function machineCode(machineId: string): string {
  return MACHINE_META[machineId]?.eq ?? machineId.toUpperCase();
}
export function techCode(techId: string): string {
  return TECH_CODE[techId] ?? techId.toUpperCase();
}
export function techLabel(t?: Technician): string {
  return t?.name ?? "Unassigned";
}
