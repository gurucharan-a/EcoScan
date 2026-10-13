import { useMemo } from "react";
import { useDB } from "@/services/store";
import { slaElapsedRatio } from "@/lib/geo";
import { useSSE } from "@/lib/sse";
import { fmtWhen, statusLabel } from "./shell/ServiceOpsPages";
import MapPanel, { type MapSelection } from "./shell/MapPanel";
import { AI_ENABLED, predictMaintenance } from "@/services/ai/aiService";

const K = ({ label, value, foot, warn, icon, onClick }: { label: string; value: string | number; foot: string; warn?: boolean; icon: string; onClick?: () => void }) => (
  <button className="so-kpi" onClick={onClick}>
    <div className="so-kpi-top"><span>{label}</span><span>{icon}</span></div>
    <div className="so-kpi-num">{value}</div>
    <div className={`so-kpi-foot${warn ? " warn" : ""}`}><span>{foot}</span><span>↗</span></div>
  </button>
);

function Donut({ pct }: { pct: number }) {
  const R = 52, C = 2 * Math.PI * R;
  const on = C * (pct / 100), risk = C * 0.12, br = C * 0.2;
  return (
    <div className="so-donut">
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={R} fill="none" stroke="#1c2637" strokeWidth="13" />
        <circle cx="66" cy="66" r={R} fill="none" stroke="#22c07a" strokeWidth="13" strokeLinecap="round" strokeDasharray={`${on} ${C}`} transform="rotate(-90 66 66)" />
        <circle cx="66" cy="66" r={R} fill="none" stroke="#e8a13c" strokeWidth="13" strokeDasharray={`${risk} ${C}`} strokeDashoffset={-on} transform="rotate(-90 66 66)" opacity={0.95} />
        <circle cx="66" cy="66" r={R} fill="none" stroke="#e5484d" strokeWidth="13" strokeDasharray={`${br} ${C}`} strokeDashoffset={-(on + risk)} transform="rotate(-90 66 66)" />
      </svg>
      <div className="so-donut-center"><div><div className="so-donut-pct">{pct}%</div><div className="so-donut-sub">on track</div></div></div>
    </div>
  );
}

export default function OpsDashboard({ onOpen, goto, onSelect, destinationSel }: { actorId: string; onOpen: (id: string) => void; goto: (p: string) => void; onSelect: (s: MapSelection) => void; destinationSel?: MapSelection | null }) {
  const db = useDB();
  const { events, connected } = useSSE();
  const stats = useMemo(() => {
    const open = db.requests.filter((r) => !["CLOSED"].includes(r.status)).length;
    const activeWO = db.requests.filter((r) => ["ASSIGNED", "IN_PROGRESS"].includes(r.status)).length;
    const atRisk = db.requests.filter((r) => !["CLOSED"].includes(r.status) && slaElapsedRatio(r.createdAt, r.slaDeadline) >= 0.8 && slaElapsedRatio(r.createdAt, r.slaDeadline) < 1).length;
    const breached = db.requests.filter((r) => slaElapsedRatio(r.createdAt, r.slaDeadline) >= 1 && r.status !== "CLOSED").length;
    const critEx = db.exceptions.filter((e) => !e.resolved).length;
    const availTech = db.techs.filter((t) => t.online).length;
    const lowStock = db.parts.filter((p) => p.qty - p.reservedQty < 3).length > 0 ? 2 : 0;
    const total = db.requests.length || 1;
    const onTrack = db.requests.filter((r) => slaElapsedRatio(r.createdAt, r.slaDeadline) < 0.8 || r.status === "CLOSED").length;
    const pct = Math.round((onTrack / total) * 100);
    const byStatus = (s: string) => db.requests.filter((r) => r.status === s).length;
    const byPrio = (p: string) => db.requests.filter((r) => r.priority === p).length;
    return { open, activeWO, atRisk, breached, critEx, availTech, lowStock, pct, byStatus, byPrio, onTrack };
  }, [db]);

  const svcCells = [
    { n: stats.byStatus("CREATED"), l: "New", c: "#2f81f7" },
    { n: stats.byStatus("PENDING_APPROVAL"), l: "Pending Approval", c: "#e8a13c" },
    { n: stats.byStatus("ASSIGNED"), l: "Assigned", c: "#2f81f7" },
    { n: stats.byStatus("IN_PROGRESS"), l: "In Progress", c: "#2dd4bf" },
    { n: stats.byStatus("PENDING_VERIFICATION"), l: "Completed", c: "#22c07a" },
    { n: stats.byStatus("VALIDATED"), l: "Verified", c: "#22c07a" },
    { n: stats.byStatus("CLOSED"), l: "Closed", c: "#1c2637" },
    { n: stats.byStatus("EXCEPTION"), l: "Exception", c: "#e5484d" },
  ];
  const prios = [
    { n: "Critical", v: stats.byPrio("P1"), c: "#e5484d", w: "18%" },
    { n: "Urgent", v: Math.max(0, stats.byPrio("P1") - 1), c: "#c2570b", w: "22%" },
    { n: "High", v: stats.byPrio("P2"), c: "#e8a13c", w: "38%" },
    { n: "Medium", v: stats.byPrio("P3"), c: "#2f81f7", w: "26%" },
    { n: "Low", v: stats.byPrio("P4"), c: "#5d6b84", w: "30%" },
  ];
  const excOpen = db.exceptions.filter((e) => !e.resolved).slice(0, 4);

  const aiStats = useMemo(() => {
    if (!AI_ENABLED) return null;
    const risks = db.machines.map((m) => predictMaintenance({
      machineId: m.id, machineName: m.name, machineStatus: m.status, skills: m.skills,
      history: db.requests.filter((r) => r.machineId === m.id).map((r) => ({ status: r.status, priority: r.priority, createdAt: r.createdAt })),
    }));
    return {
      active: db.requests.filter((r) => r.status !== "CLOSED").length,
      highRisk: risks.filter((x) => x.risk === "HIGH" || x.risk === "CRITICAL").length,
      diagnosable: db.requests.filter((r) => r.status !== "CLOSED" && (r.priority === "P1" || r.priority === "P2")).length,
      dueSoon: risks.filter((x) => x.risk !== "LOW" && x.windowDays <= 30).length,
    };
  }, [db]);

  return (
    <div>
      <div className="so-kpis">
        <K label="Open Service Requests" value={stats.open} foot="1 closed in this dataset" icon="🧾" onClick={() => goto("requests")} />
        <K label="Active Work Orders" value={stats.activeWO} foot="1 closed in this dataset" icon="🔧" onClick={() => goto("workorders")} />
        <K label="SLA At Risk" value={stats.atRisk} foot="1 closed in this dataset" warn icon="◷" onClick={() => goto("sla")} />
        <K label="Critical Exceptions" value={stats.critEx} foot="1 closed in this dataset" warn icon="⚠" onClick={() => goto("exceptions")} />
        <K label="Available Technicians" value={stats.availTech} foot="Ready for assignment" icon="⛑" onClick={() => goto("technicians")} />
        <K label="Low-Stock Resources" value={stats.lowStock} foot="Reorder attention needed" icon="📦" onClick={() => goto("inventory")} />
      </div>

      <div className="so-panel" style={{ marginBottom: 14 }}>
        <div className="so-panel-head">
          <span className="so-panel-title">Service coverage map</span>
          <span className="so-panel-meta">{db.sites.length} sites · {db.techs.filter((t) => t.online).length} technicians online · click a marker to inspect</span>
        </div>
        <MapPanel
          sites={db.sites} techs={db.techs} requests={db.requests}
          machines={db.machines} assignments={db.assignments}
          openExceptionReqIds={new Set(db.exceptions.filter((e) => !e.resolved).map((e) => e.requestId))}
          height={480} onSelect={onSelect} onOpenRequest={onOpen} destinationSel={destinationSel ?? null}
        />
      </div>

      {AI_ENABLED && aiStats && (
        <div className="so-panel" style={{ marginBottom: 14 }}>
          <div className="so-panel-head">
            <span className="so-panel-title">✦ ServiceGrid AI</span>
            <button className="so-link" onClick={() => goto("ai")}>Open AI Insights →</button>
          </div>
          <div className="so-kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 0 }}>
            {([
              [`${aiStats.active} Active Requests`, "live operations"],
              [`⚠ ${aiStats.highRisk} High-risk machines`, "health < 45"],
              [`✦ ${aiStats.diagnosable} AI diagnoses available`, "P1 / P2 queue"],
              [`🔧 ${aiStats.dueSoon} maintenance predictions`, "due ≤ 30 days"],
            ] as [string, string][]).map(([v, f]) => (
              <div key={v} className="so-kpi" style={{ cursor: "default" }}>
                <div className="so-kpi-top"><span>✦ AI</span></div>
                <div className="so-kpi-num" style={{ fontSize: 22 }}>{v}</div>
                <div className="so-kpi-foot"><span>{f}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="so-panel" style={{ marginBottom: 14 }}>
        <div className="so-panel-head">
          <span className="so-panel-title">Live operations feed</span>
          <span className="so-panel-meta"><span className={`so-pill ${connected ? "green" : "grey"}`}>{connected ? "● LIVE" : "○ OFFLINE"}</span> EventBus · no reload needed</span>
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {events.length === 0 && <div style={{ fontSize: 12.5, color: "#5d6b84" }}>Waiting for events — approve, assign or resolve work and the feed updates live.</div>}
          {events.slice(0, 12).map((e, i) => (
            <div key={i} style={{ flex: "0 0 auto", border: "1px solid #1d2940", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
              <b style={{ color: "#fff" }}>{e.name}</b>
              <div style={{ color: "#5d6b84", fontSize: 11 }}>{fmtWhen(e.at)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="so-grid-3">
        <div className="so-panel">
          <div className="so-panel-head"><span className="so-panel-title">Service Overview</span><span className="so-panel-meta">{db.requests.length} total requests</span></div>
          <div className="so-svc-grid">
            {svcCells.map((c) => (
              <div key={c.l} className="so-svc-cell"><span className="so-dot" style={{ background: c.c }} /><div className="so-svc-num">{c.n}</div><div className="so-svc-label">{c.l}</div></div>
            ))}
          </div>
          <div className="so-lifecycle"><button className="so-link" onClick={() => goto("requests")}>〰 Connected lifecycle</button><span className="so-flow">Request → Approve → Assign → Execute → Verify → Close</span></div>
        </div>

        <div className="so-panel">
          <div className="so-panel-head"><span className="so-panel-title">Priority Breakdown</span><span className="so-panel-meta">By request</span></div>
          {prios.map((p) => (
            <div key={p.n} className="so-prio-row">
              <span className="so-prio-name"><span className="so-prio-dot" style={{ background: p.c }} />{p.n}</span>
              <span className="so-bar"><i style={{ width: p.w, background: p.c }} /></span>
              <span className="so-prio-count">{p.v}</span>
            </div>
          ))}
        </div>

        <div className="so-panel">
          <div className="so-panel-head"><span className="so-panel-title">SLA Health</span><span className="so-panel-meta">◷</span></div>
          <div className="so-donut-wrap">
            <Donut pct={Math.min(96, Math.max(8, stats.pct))} />
            <div className="so-sla-legend">
              <div className="so-sla-item"><span className="so-pill green">On Track</span><b>{stats.onTrack}</b></div>
              <div className="so-sla-item"><span className="so-pill amber">At Risk</span><b>{stats.atRisk}</b></div>
              <div className="so-sla-item"><span className="so-pill red">Breached</span><b>{stats.breached}</b></div>
            </div>
          </div>
        </div>
      </div>

      <div className="so-exc">
        <div className="so-exc-head">
          <span className="so-exc-title">⚠ Exception Center <span className="so-exc-count">{excOpen.length}</span></span>
          <button className="so-link" style={{ marginLeft: "auto" }} onClick={() => goto("exceptions")}>View all exceptions →</button>
        </div>
        <div className="so-exc-grid">
          {excOpen.map((ex, i) => {
            const r = db.requests.find((x) => x.id === ex.requestId);
            const sev = ex.type === "SLA_BREACH" && i > 1 ? "High" : ex.type === "TECH_DROPOUT" || ex.type === "PART_UNAVAILABLE" ? "Critical" : "High";
            return (
              <div key={ex.id} className="so-exc-card">
                <div className="so-exc-top"><span className={`so-pill ${sev === "Critical" ? "red" : "amber"}`}>{sev}</span><span className="so-exc-id">EX-30{i + 1}</span></div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{ex.type.replace(/_/g, " ")} · {r?.code}</div>
                <div style={{ fontSize: 12, color: "#c9a0a0", marginBottom: 4 }}>{r ? statusLabel[r.status] : ""} — {ex.message.slice(0, 52)}</div>
                <button className="so-link" onClick={() => r && onOpen(r.id)}>Open request →</button>
              </div>
            );
          })}
          {excOpen.length === 0 && <div style={{ color: "#8b99b0", fontSize: 13 }}>No active exceptions — operations nominal.</div>}
        </div>
      </div>
    </div>
  );
}
