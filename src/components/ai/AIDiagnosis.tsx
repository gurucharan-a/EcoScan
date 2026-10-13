import { useState } from "react";
import { useDB } from "@/services/store";
import { diagnoseFault, runAiStages } from "@/services/ai/aiService";
import { machineCode } from "../shell/catalog";
import type { AIDiagnosis } from "@/services/ai/aiTypes";

const AI_FAIL = "AI analysis unavailable. Existing SERVICEGRID operations remain fully functional.";

/**
 * ✦ AI fault diagnosis — read-only analysis of a service request.
 *764 Mock-backed via aiService; never mutates requests, techs, SLA or inventory.
 */
export default function AIDiagnosis({ requestId, basic = false }: { requestId: string; basic?: boolean }) {
  const db = useDB();
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<AIDiagnosis | null>(null);
  const [error, setError] = useState(false);

  const r = db.requests.find((x) => x.id === requestId);
  if (!r) return null;
  const m = db.machines.find((x) => x.id === r.machineId);

  const analyze = async () => {
    setError(false);
    setResult(null);
    try {
      await runAiStages(setStage);
      const d = diagnoseFault({
        requestCode: r.code,
        title: r.title,
        description: r.description,
        priority: r.priority,
        machineCode: m?.code ?? r.machineId,
        machineName: m?.name ?? r.machineId,
        machineStatus: m?.status ?? "UNKNOWN",
        skills: m?.skills ?? r.requiredSkills,
        requiredParts: r.requiredParts,
      });
      setResult(d);
    } catch {
      setError(true);
    } finally {
      setStage(null);
    }
  };

  const sevTone = result
    ? result.severity === "Critical" ? "red" : result.severity === "High" ? "amber" : result.severity === "Medium" ? "blue" : "grey"
    : "grey";

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8b99b0", fontWeight: 700 }}>
          ✦ AI Diagnosis
        </span>
        {!result && !stage && (
          <button className="so-ghost-btn solid" style={{ marginLeft: "auto", padding: "7px 14px" }} onClick={analyze}>
            ✦ Analyze Issue
          </button>
        )}
        {result && !stage && (
          <button className="so-ghost-btn" style={{ marginLeft: "auto", padding: "6px 12px" }} onClick={analyze}>
            Re-analyze
          </button>
        )}
      </div>

      {stage && <div style={{ fontSize: 12.5, color: "#8b99b0" }}>✦ {stage}</div>}
      {error && <div style={{ fontSize: 12.5, color: "#ff9a9a" }}>{AI_FAIL}</div>}

      {result && !stage && (
        <div style={{ border: "1px solid #1d2940", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#5d6b84", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Likely issue</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff", margin: "4px 0 8px" }}>{result.likelyIssue}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#8b99b0" }}>Confidence</span>
            <span className="so-bar" style={{ flex: 1, minWidth: 120 }}><i style={{ width: `${result.confidence}%`, background: "#5ea2ff" }} /></span>
            <b style={{ fontSize: 13 }}>{result.confidence}%</b>
            <span className={`so-pill ${sevTone}`}>{result.severity.toUpperCase()}</span>
          </div>
          {!basic && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "#5d6b84", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Possible causes</div>
              {result.causes.map((c) => <div key={c} style={{ fontSize: 12.5, color: "#c3cede", padding: "2px 0" }}>• {c}</div>)}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: "#5d6b84", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Recommended checks</div>
            {result.checks.map((c) => <div key={c} style={{ fontSize: 12.5, color: "#c3cede", padding: "2px 0" }}>✓ {c}</div>)}
          </div>
          {!basic && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
              <span style={{ color: "#5d6b84" }}>Parts:</span>
              {result.parts.map((p) => <span key={p} className="so-pill grey so-mono">{p}</span>)}
              <span style={{ marginLeft: "auto", color: "#8b99b0" }}>
                Estimated repair: <b style={{ color: "#fff" }}>{result.repairMins[0]}–{result.repairMins[1]} min</b>
              </span>
            </div>
          )}
          <div className="so-req-sub" style={{ marginTop: 8 }}>Mock analysis for {result.requestCode} · {machineCode(r.machineId)} — demonstration only, not ML output.</div>
        </div>
      )}
    </div>
  );
}
