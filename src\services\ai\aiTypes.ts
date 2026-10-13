/**
 * SERVICEGRID AI — public contracts for the intelligence layer.
 * UI talks to services/ai/aiService.ts; providers implement these shapes.
 * No `any` — all payloads are fully typed.
 */

export type AISeverity = "Critical" | "High" | "Medium" | "Low";
export type AIRisk = "LOW" | "MEDIUM" | "MEDIUM-HIGH" | "HIGH" | "CRITICAL";

export interface AIDiagnosis {
  requestCode: string;
  machineCode: string;
  likelyIssue: string;
  confidence: number; // 0-100
  severity: AISeverity;
  causes: string[];
  checks: string[];
  parts: string[];
  repairMins: [number, number];
}

export interface AITechCandidate {
  techId: string;
  name: string;
  skills: string[];
  certifications: string[];
  online: boolean;
  availability: number; // 0-1
  workload: number; // 0-1 currentLoad
  score: number; // existing allocation score
  skillMatch: number; // 0-1 from existing ranking
  completedJobs: number;
}

export interface AITechnicianRecommendation {
  requestCode: string;
  recommendedTechId: string;
  recommendedName: string;
  why: string[];
  confidence: number; // 0-100
  alternativeTechId: string | null;
  alternativeName: string | null;
  etaMin: number | null;
  distanceKm: number | null;
  skillPct: number;
}

export interface AIMachineHistory {
  status: string;
  priority: string;
  createdAt: string;
}

export interface AIPredictiveMaintenance {
  machineId: string;
  machineName: string;
  healthScore: number; // 0-100
  risk: AIRisk;
  windowDays: number;
  windowLabel: string;
  likelyComponent: string;
  reasoning: string[];
  action: string;
}

export interface AIServiceSummary {
  requestCode: string;
  issue: string;
  rootCause: string;
  actionTaken: string;
  partsUsed: string[];
  downtime: string;
  condition: string;
  recommendation: string;
}

/** Provider contract. The mock implements this today; a real API provider
 *  implements the same interface tomorrow — UI code does not change. */
export interface AIProvider {
  id: string;
  diagnose(input: {
    requestCode: string; title: string; description: string; priority: string;
    machineCode: string; machineName: string; machineStatus: string;
    skills: string[]; requiredParts: { sku: string; qty: number }[];
  }): AIDiagnosis;
  recommend(input: {
    requestCode: string; requiredSkills: string[];
    candidates: AITechCandidate[];
    etaByTechId: Record<string, { mins: number; km: number }>;
  }): AITechnicianRecommendation | null;
  predict(input: {
    machineId: string; machineName: string; machineStatus: string;
    skills: string[]; history: AIMachineHistory[];
  }): AIPredictiveMaintenance;
  summarize(input: {
    requestCode: string; title: string; description: string; priority: string;
    machineName: string; machineStatus?: string; notes: string[]; parts: { sku: string; qty: number }[];
    assignedTechName: string | null; createdAt: string;
  }): AIServiceSummary;
}
