import { useState } from "react";
import { predictMaintenance, runAiStages } from "@/services/ai/aiService";
import type { AIPredictiveMaintenance } from "@/services/ai/aiTypes";

const AI_FAIL = "AI analysis unavailable. Existing SERVICEGRID operations remain fully functional.";

const RISK_TONE: Record<string, string> = {
  LOW: "green", MEDIUM: "teal", "MEDIUM-HIGH": "amber", HIGH: "amber", CRITICAL: "red",
};

export function riskTone(risk: string): string {
  return RISK_TONE[risk] ?? "grey";
}

export interface MachineRiskInput {
  machineId: string;
  machineName: string;
  machineStatus: string;
  skills: string[];
  history: { status: string; priority: string; createdAt: string }[];
}

/**
 * ✦ AI predictive maintenance — read-only risk scoring from existing
 * service history. Never touches machine status, requests or inventory.
 */
export default function AIPredictiveMaintenance({ input }: { input: MachineRiskInput }) {
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<AIPredictiveMaintenance | null>(null);
  const [error, setError] = useState(false);

  const analyze = async () => {
    setError(false);
    setResult(null);
    try {
      await runAiStages(setStage, ["Reading service history…", "Scoring failure risk…", "Forecasting maintenance window…"]);
      setResult(predictMaintenance(input));
    } catch {
      setError(true);
    } finally {
      setStage(null);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8b99b0", fontWeight: 700 }}>
          ✦ Predictive Maintenance
        </span>
        {!stage && (
          <button className="so-ghost-btn solid" style={{ marginLeft: "auto", padding: "7px 14px" }} onClick={analyze}>
            {result ? "Re-run" : "✦ Run Prediction"}
          </button>
        )}
      </div>

      {stage && <div style={{ fontSize: 12.5, color: "#8b99b0" }}>✦ {stage}</div>}
      {error && <div style={{ fontSize: 12.5, color: "#ff9a9a" }}>{AI_FAIL}</div>}

      {result && !stage && (
        <div style={{ border: "1px solid #1d2940", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "#5d6b84", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Health score</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>{result.healthScore}<span style={{ fontSize: 13, color: "#5d6b84" }}> / 100</span></div>
            </div>
            <span className={`so-pill ${riskTone(result.risk)}`} style={{ marginLeft: "auto" }}>{result.risk} RISK</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#c3cede", marginTop: 8 }}>
            Predicted window: <b>{result.windowLabel}</b> · Likely component: <b>{result.likelyComponent}</b>
          </div>
          <div style={{ marginTop: 8 }}>
            {result.reasoning.map((x) => <div key={x} style={{ fontSize: 12.5, color: "#8b99b0", padding: "2px 0" }}>• {x}</div>)}
          </div>
          <div style={{ fontSize: 12.5, color: "#c3cede", marginTop: 8 }}>Recommended action: <b>{result.action}</b></div>
          <div className="so-req-sub" style={{ marginTop: 8 }}>Mock forecast for {result.machineName} — demonstration only, not ML output.</div>
        </div>
      )}
    </div>
  );
}
