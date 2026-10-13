import { useState } from "react";
import { useDB } from "@/services/store";
import { generateServiceSummary, runAiStages } from "@/services/ai/aiService";
import type { AIServiceSummary } from "@/services/ai/aiTypes";

const AI_FAIL = "AI analysis unavailable. Existing SERVICEGRID operations remain fully functional.";

/**
 * ✦ AI service summary — turns existing technician task logs into a
 * structured completion summary. Read-only; never edits logs or requests.
 */
export default function AIServiceSummary({ requestId }: { requestId: string }) {
  const db = useDB();
  const [stage, setStage] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [result, setResult] = useState<AIServiceSummary | null>(null);
  const [error, setError] = useState(false);

  const r = db.requests.find((x) => x.id === requestId);
  if (!r) return null;
  const logs = db.logs.filter((l) => l.requestId === requestId && l.kind !== "STATUS");
  const evidence = db.attachments.filter((a) => a.requestId === requestId);
  const active = db.assignments.find((a) => a.requestId === requestId && a.active);
  const techName = active ? db.techs.find((t) => t.id === active.technicianId)?.name ?? null : null;
  const seedNotes = logs.map((l) => l.text).join("\n");
  const notesText = draft ?? seedNotes;

  const generate = async () => {
    setError(false);
    setResult(null);
    try {
      await runAiStages(setStage, ["Reading technician notes…", "Extracting parts and actions…", "Composing service summary…"]);
      setResult(generateServiceSummary({
        requestCode: r.code,
        title: r.title,
        description: r.description,
        priority: r.priority,
        machineName: db.machines.find((m) => m.id === r.machineId)?.name ?? r.machineId,
        machineStatus: db.machines.find((m) => m.id === r.machineId)?.status,
        notes: notesText.split("\n").map((s) => s.trim()).filter(Boolean),
        parts: r.requiredParts,
        assignedTechName: techName,
        createdAt: r.createdAt,
      }));
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
          ✦ AI Service Summary
        </span>
        {logs.length > 0 && !stage && (
          <button className="so-ghost-btn solid" style={{ marginLeft: "auto", padding: "7px 14px" }} onClick={generate}>
            {result ? "Regenerate" : "✦ Generate AI Summary"}
          </button>
        )}
      </div>

      {logs.length === 0 && (
        <div style={{ fontSize: 12.5, color: "#5d6b84" }}>
          No technician notes logged yet — add notes in the Execution tab, then generate a summary here.
        </div>
      )}

      {logs.length > 0 && (
        <textarea
          className="so-textarea" rows={3} value={notesText}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Technician notes used as summary source…"
          style={{ marginBottom: 4 }}
        />
      )}

      {stage && <div style={{ fontSize: 12.5, color: "#8b99b0", marginTop: 8 }}>✦ {stage}</div>}
      {error && <div style={{ fontSize: 12.5, color: "#ff9a9a", marginTop: 8 }}>{AI_FAIL}</div>}

      {result && !stage && (
        <div style={{ border: "1px solid #1d2940", borderRadius: 8, padding: 12, marginTop: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Service summary · {result.requestCode}{techName ? ` · ${techName}` : ""}</div>
          {([["Issue", result.issue], ["Root cause", result.rootCause], ["Action taken", result.actionTaken]] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ fontSize: 12.5, padding: "3px 0", color: "#c3cede" }}>
              <span style={{ color: "#5d6b84" }}>{k}: </span>{v}
            </div>
          ))}
          <div style={{ fontSize: 12.5, padding: "3px 0", color: "#c3cede" }}>
            <span style={{ color: "#5d6b84" }}>Parts used: </span>{result.partsUsed.length ? result.partsUsed.join(", ") : "—"}
            <span style={{ color: "#5d6b84" }}> · Downtime: </span>{result.downtime}
          </div>
          <div style={{ fontSize: 12.5, padding: "3px 0", color: "#c3cede" }}>
            <span style={{ color: "#5d6b84" }}>Recommendation: </span>{result.recommendation}
          </div>
          <div style={{ fontSize: 12.5, padding: "3px 0", color: "#c3cede" }}>
            <span style={{ color: "#5d6b84" }}>Condition: </span>{result.condition}
          </div>
          <div style={{ fontSize: 12.5, padding: "3px 0", color: "#c3cede" }}>
            <span style={{ color: "#5d6b84" }}>Evidence on record: </span>
            {evidence.length ? evidence.map((a) => a.name).join(", ") : "no files attached yet"}
          </div>
        </div>
      )}
    </div>
  );
}
