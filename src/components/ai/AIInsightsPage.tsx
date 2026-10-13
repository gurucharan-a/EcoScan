import { store, useDB } from "@/services/store";
import { diagnoseFault, predictMaintenance, recommendTechnician } from "@/services/ai/aiService";
import { getTechEtaSnapshot } from "../shell/MapPanel";
import { machineLabel, siteLabel } from "../shell/catalog";
import { statusPill } from "../shell/ServiceOpsPages";
import { riskTone } from "./AIPredictiveMaintenance";
import AIAssistant from "./AIAssistant";
import type { MapSelection } from "../shell/MapPanel";
import type { Role } from "@/types";

/**
 * ✦ AI Insights — dedicated read-only overview: fault analyses, staffing
 * recommendations, maintenance forecasts and recent service summaries.
 * All values are computed live from the existing store via aiService.
 */
export default function AIInsightsPage({ role, onOpenRequest, onSelect }: {
  role: Role; onOpenRequest: (id: string) => void; onSelect: (s: MapSelection) => void;
}) {
  const db = useDB();
  const ops = role === "OPS_MANAGER" || role === "ADMIN";

  const risks = db.machines
    .map((m) => predictMaintenance({
      machineId: m.id, machineName: m.name, machineStatus: m.status,
      skills: m.skills,
      history: db.requests.filter((r) => r.machineId === m.id).map((r) => ({ status: r.status, priority: r.priority, createdAt: r.createdAt })),
    }))
    .filter((p) => p.risk !== "LOW")
    .sort((a, b) => a.healthScore - b.healthScore);

  const hot = [...db.requests]
    .filter((r) => r.status !== "CLOSED" && (r.priority === "P1" || r.priority === "P2"))
    .slice(0, 4)
    .map((r) => {
      const m = db.machines.find((x) => x.id === r.machineId);
      return {
        r,
        d: diagnoseFault({
          requestCode: r.code, title: r.title, description: r.description, priority: r.priority,
          machineCode: m?.code ?? r.machineId, machineName: m?.name ?? r.machineId,
          machineStatus: m?.status ?? "UNKNOWN", skills: m?.skills ?? r.requiredSkills, requiredParts: r.requiredParts,
        }),
      };
    });

  const recent = [...db.requests]
    .filter((r) => r.status === "PENDING_VERIFICATION" || r.status === "CLOSED")
    .slice(0, 3);

  return (
    <div>
      <div className="so-panel" style={{ marginBottom: 12 }}>
        <div className="so-panel-head">
          <span className="so-panel-title">✦ ServiceGrid AI overview</span>
          <span className="so-panel-meta">mock intelligence · read-only</span>
        </div>
        <div className="so-kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 0 }}>
          {([
            ["Active requests", `${db.requests.filter((r) => r.status !== "CLOSED").length}`, "live from store"],
            ["High-risk machines", `${risks.filter((x) => x.risk === "HIGH" || x.risk === "CRITICAL").length}`, "health < 45"],
            ["AI diagnoses ready", `${hot.length}`, "P1 / P2 queue"],
            ["Forecasts due ≤ 30d", `${risks.filter((x) => x.windowDays <= 30).length}`, "maintenance windows"],
          ] as [string, string, string][]).map(([l, v, f]) => (
            <div key={l} className="so-kpi" style={{ cursor: "default" }}>
              <div className="so-kpi-top"><span>{l}</span><span>✦</span></div>
              <div className="so-kpi-num">{v}</div>
              <div className="so-kpi-foot"><span>{f}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <AIAssistant />
      </div>

      <div className="so-grid-3" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <div className="so-panel">
          <div className="so-panel-head"><span className="so-panel-title">✦ Predictive maintenance</span><span className="so-panel-meta">{risks.length} machines flagged</span></div>
          {risks.length === 0 && <div style={{ fontSize: 12.5, color: "#5d6b84" }}>Fleet nominal — no elevated risk.</div>}
          {risks.map((p) => (
            <div key={p.machineId} className="so-draw-row" style={{ cursor: "default" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <b style={{ color: "#fff", fontSize: 13 }}>{p.machineName}</b>
                <span className={`so-pill ${riskTone(p.risk)}`} style={{ marginLeft: "auto" }}>{p.risk}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <span className="so-bar" style={{ flex: 1 }}><i style={{ width: `${p.healthScore}%`, background: p.healthScore > 60 ? "#22c07a" : p.healthScore > 40 ? "#e8a13c" : "#e5484d" }} /></span>
                <span style={{ fontSize: 12, color: "#8b99b0" }}>{p.healthScore}/100 · {p.windowLabel}</span>
              </div>
              <button className="so-link" style={{ marginTop: 6 }} onClick={() => onSelect({ kind: "equipment", id: p.machineId })}>View equipment →</button>
            </div>
          ))}
        </div>

        <div className="so-panel">
          <div className="so-panel-head"><span className="so-panel-title">✦ Fault analyses</span><span className="so-panel-meta">critical queue</span></div>
          {hot.map(({ r, d }) => (
            <div key={r.id} className="so-draw-row" style={{ cursor: "default" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="so-req-id" onClick={() => onOpenRequest(r.id)}>{r.code}</button>
                <span style={{ marginLeft: "auto" }}>{statusPill(r.status)}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#e6edf8", marginTop: 4 }}><b>✦ {d.likelyIssue}</b> <span style={{ color: "#8b99b0" }}>· {d.confidence}% · {d.severity}</span></div>
              <div style={{ fontSize: 12, color: "#8b99b0", marginTop: 2 }}>{machineLabel(db.machines.find((x) => x.id === r.machineId))} · {siteLabel(db.sites.find((s) => s.id === r.siteId))}</div>
            </div>
          ))}
          {hot.length === 0 && <div style={{ fontSize: 12.5, color: "#5d6b84" }}>No critical requests to analyze.</div>}
        </div>

        {ops && (
          <div className="so-panel">
            <div className="so-panel-head"><span className="so-panel-title">✦ Staffing recommendations</span><span className="so-panel-meta">existing ranking, explained</span></div>
            <StaffingList onOpenRequest={onOpenRequest} />
          </div>
        )}

        <div className="so-panel">
          <div className="so-panel-head"><span className="so-panel-title">✦ Recent service summaries</span><span className="so-panel-meta">verification queue</span></div>
          {recent.length === 0 && <div style={{ fontSize: 12.5, color: "#5d6b84" }}>Nothing awaiting verification.</div>}
          {recent.map((r) => (
            <div key={r.id} className="so-draw-row" style={{ cursor: "default" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="so-req-id" onClick={() => onOpenRequest(r.id)}>{r.code}</button>
                <span style={{ marginLeft: "auto" }}>{statusPill(r.status)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#8b99b0", marginTop: 4 }}>Open the request → ✦ AI tab → Generate AI Summary from logged notes.</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StaffingList({ onOpenRequest }: { onOpenRequest: (id: string) => void }) {
  const db = useDB();
  const rows = [...db.requests]
    .filter((r) => ["APPROVED", "EXCEPTION", "PENDING_APPROVAL", "VALIDATED"].includes(r.status))
    .slice(0, 4)
    .map((r) => {
      let rec: { name: string; conf: number } | null = null;
      try {
        // Read-only: reuse the same ranking the Assignment tab uses.
        const ranked = store.rank(r.id).slice(0, 5);
        const out = recommendTechnician({
          requestCode: r.code,
          requiredSkills: r.requiredSkills,
          candidates: ranked.map(({ tech, breakdown }) => ({
            techId: tech.id, name: tech.name, skills: tech.skills,
            certifications: tech.certifications, online: tech.online,
            availability: tech.availability, workload: tech.currentLoad,
            score: breakdown.total, skillMatch: breakdown.skillMatch,
            completedJobs: db.assignments.filter((a) => a.technicianId === tech.id).length,
          })),
          etaByTechId: getTechEtaSnapshot(),
        });
        if (out) rec = { name: out.recommendedName, conf: out.confidence };
      } catch { rec = null; }
      return { r, rec };
    });
  if (rows.length === 0) return <div style={{ fontSize: 12.5, color: "#5d6b84" }}>No unassigned requests awaiting staffing.</div>;
  return (
    <div>
      {rows.map(({ r, rec }) => (
        <div key={r.id} className="so-draw-row" style={{ cursor: "default" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="so-req-id" onClick={() => onOpenRequest(r.id)}>{r.code}</button>
          </div>
          <div style={{ fontSize: 12.5, color: "#e6edf8", marginTop: 4 }}>
            {rec ? <>✦ {rec.name} <span style={{ color: "#8b99b0" }}>· {rec.conf}%</span></> : <span style={{ color: "#5d6b84" }}>No ranked candidates right now.</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
