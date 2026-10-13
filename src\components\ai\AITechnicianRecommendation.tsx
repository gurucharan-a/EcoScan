import { useState } from "react";
import { store, useDB } from "@/services/store";
import { recommendTechnician, runAiStages } from "@/services/ai/aiService";
import { getTechEtaSnapshot } from "../shell/MapPanel";
import type { AITechnicianRecommendation } from "@/services/ai/aiTypes";

const AI_FAIL = "AI analysis unavailable. Existing SERVICEGRID operations remain fully functional.";

/**
 * ✦ AI technician recommendation — explains the EXISTING ranking, adds nothing
 * to assignment rules. Read-only: never assigns, never mutates. Road ETA is
 * read from the map's routed snapshot (map stays source of truth).
 */
export default function AITechnicianRecommendation({ requestId }: { requestId: string }) {
  const db = useDB();
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<AITechnicianRecommendation | null>(null);
  const [ran, setRan] = useState(false);
  const [error, setError] = useState(false);

  const r = db.requests.find((x) => x.id === requestId);
  if (!r) return null;

  const analyze = async () => {
    setError(false);
    setResult(null);
    setRan(false);
    try {
      await runAiStages(setStage, ["Reviewing ranked candidates…", "Checking skills and availability…", "Generating recommendation…"]);
      let ranked: ReturnType<typeof store.rank> = [];
      try { ranked = store.rank(r.id); } catch { ranked = []; }
      const completed = (techId: string) => db.assignments.filter((a) => a.technicianId === techId).length;
      const rec = recommendTechnician({
        requestCode: r.code,
        requiredSkills: r.requiredSkills,
        candidates: ranked.slice(0, 5).map(({ tech, breakdown }) => ({
          techId: tech.id, name: tech.name, skills: tech.skills,
          certifications: tech.certifications, online: tech.online,
          availability: tech.availability, workload: tech.currentLoad,
          score: breakdown.total, skillMatch: breakdown.skillMatch,
          completedJobs: completed(tech.id),
        })),
        etaByTechId: getTechEtaSnapshot(),
      });
      setResult(rec);
      setRan(true);
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
          ✦ AI Technician Recommendation
        </span>
        {!stage && (
          <button className="so-ghost-btn solid" style={{ marginLeft: "auto", padding: "7px 14px" }} onClick={analyze}>
            {result ? "Re-run" : "✦ Recommend Technician"}
          </button>
        )}
      </div>

      {stage && <div style={{ fontSize: 12.5, color: "#8b99b0" }}>✦ {stage}</div>}
      {error && <div style={{ fontSize: 12.5, color: "#ff9a9a" }}>{AI_FAIL}</div>}

      {!result && !stage && !error && (
        <div style={{ fontSize: 12.5, color: "#5d6b84" }}>
          AI explains the existing allocation ranking — skill, availability, workload and road ETA. It never assigns; use the Assignment tab to dispatch.
        </div>
      )}

      {result && !stage && (
        <div style={{ border: "1px solid #1d2940", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#5d6b84", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Recommended</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "4px 0" }}>{result.recommendedName}</div>
          {(result.etaMin != null || result.skillPct > 0) && (
            <div style={{ fontSize: 12.5, color: "#a9b7cf" }}>
              {result.etaMin != null ? `${result.etaMin} min ETA${result.distanceKm != null ? ` · ${result.distanceKm.toFixed(1)} km` : ""} · ` : ""}
              {result.skillPct}% skill match
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: "#5d6b84", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Why</div>
            {result.why.map((w) => <div key={w} style={{ fontSize: 12.5, color: "#c3cede", padding: "2px 0" }}>• {w}</div>)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            <span style={{ color: "#8b99b0" }}>AI confidence: <b style={{ color: "#fff" }}>{result.confidence}%</b></span>
            {result.alternativeName && <span style={{ color: "#8b99b0" }}>Alternative: <b style={{ color: "#c3cede" }}>{result.alternativeName}</b></span>}
          </div>
          <div className="so-req-sub" style={{ marginTop: 8 }}>Advisory only — assignment stays in the Assignment tab.</div>
        </div>
      )}

      {ran && !result && !stage && !error && (
        <div style={{ fontSize: 12.5, color: "#8b99b0" }}>No eligible technicians in the current ranking to recommend.</div>
      )}
    </div>
  );
}
