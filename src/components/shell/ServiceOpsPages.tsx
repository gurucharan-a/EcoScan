import { useMemo, useState } from "react";
import { store, useDB, verifyChain } from "@/services/store";
import { slaElapsedRatio } from "@/lib/geo";
import MapPanel, { siteHealth, type MapSelection } from "./MapPanel";
import {
  MACHINE_META, SITE_META, machineLabel, siteCode, siteLabel,
  techCode, woForRequest,
} from "./catalog";
import type { AppUser, RequestStatus } from "@/types";

/* ---------- shared label maps (screenshot vocabulary on top of P1-P4 engine) ---------- */
export const prioLabel: Record<string, string> = { P1: "Critical", P2: "High", P3: "Medium", P4: "Low" };
export function prioLabelFull(p: string, title = ""): string {
  if (p === "P1") return /compressor|approval/i.test(title) ? "Urgent" : "Critical";
  return prioLabel[p] ?? p;
}
export const statusLabel: Record<string, string> = {
  CREATED: "New", VALIDATED: "Verified", PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved", ASSIGNED: "Assigned", IN_PROGRESS: "In Progress",
  PENDING_VERIFICATION: "Completed", CLOSED: "Closed", EXCEPTION: "Exception",
  REJECTED: "Rejected", CANCELLED: "Cancelled",
};
export function slaOf(r: { createdAt: string; slaDeadline: string; status: string }) {
  if (r.status === "CLOSED" || r.status === "PENDING_VERIFICATION") return { k: "ok" as const, t: "On Track" };
  const ratio = slaElapsedRatio(r.createdAt, r.slaDeadline);
  if (ratio >= 1) return { k: "bad" as const, t: "Breached" };
  if (ratio >= 0.8) return { k: "warn" as const, t: "At Risk" };
  return { k: "ok" as const, t: "On Track" };
}
export function techName(db: ReturnType<typeof useDB>, requestId: string) {
  const a = db.assignments.find((x) => x.requestId === requestId && x.active);
  if (!a) return "Unassigned";
  return db.techs.find((t) => t.id === a.technicianId)?.name ?? "Unassigned";
}
export function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`so-pill ${tone}`}>{children}</span>;
}
export function prioPill(p: string, title = "") {
  const l = prioLabelFull(p, title);
  const tone = l === "Critical" ? "red" : l === "Urgent" ? "amber" : l === "High" ? "amber" : l === "Medium" ? "blue" : "grey";
  return <Pill tone={tone}>{l}</Pill>;
}
export function statusPill(s: string) {
  const l = statusLabel[s] ?? s;
  const tone = s === "IN_PROGRESS" ? "teal" : s === "EXCEPTION" || s === "REJECTED" ? "red" : s === "PENDING_APPROVAL" ? "amber" : s === "PENDING_VERIFICATION" ? "green" : s === "CLOSED" ? "green" : "grey";
  return <Pill tone={tone}>{l}</Pill>;
}
export function slaPill(r: { createdAt: string; slaDeadline: string; status: string }) {
  const s = slaOf(r);
  return <span className={s.k === "bad" ? "so-sla-bad" : s.k === "warn" ? "so-sla-warn" : "so-sla-ok"}>{s.t}</span>;
}
export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const PAGE_SIZE = 8;

/* ---------- requests / work-orders / approvals table ---------- */
export function RequestsTable({ me, onOpen, filter, title = "Service Requests" }: {
  me: AppUser; onOpen: (id: string) => void;
  filter?: (r: { status: string; priority: string }) => boolean;
  title?: string;
}) {
  const db = useDB();
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const [pr, setPr] = useState("all");
  const [site, setSite] = useState("all");
  const [sla, setSla] = useState("all");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => db.requests.filter((r) => {
    if (filter && !filter(r)) return false;
    if (st !== "all" && r.status !== st) return false;
    if (pr !== "all" && r.priority !== pr) return false;
    if (site !== "all" && r.siteId !== site) return false;
    if (sla !== "all" && slaOf(r).t !== sla) return false;
    if (q) {
      const m = db.machines.find((x) => x.id === r.machineId);
      const hay = `${r.code} ${woForRequest(r.code)} ${r.title} ${r.description} ${m ? machineLabel(m) : ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [db, q, st, pr, site, sla, filter]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const vis = rows.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);
  const reset = () => { setPage(0); };
  void me;
  return (
    <div className="so-table-wrap">
      <div className="so-table-bar">
        <span className="so-table-title">{title}</span>
        <span className="so-count">{rows.length}</span>
        <span className="so-live-dot"><i />Live data</span>
      </div>
      <div className="so-table-bar" style={{ paddingTop: 0 }}>
        <div className="so-search-inline"><span>⌕</span><input placeholder="Search requests, machines..." value={q} onChange={(e) => { setQ(e.target.value); reset(); }} /></div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="so-select" value={st} onChange={(e) => { setSt(e.target.value); reset(); }}>
            <option value="all">All statuses</option>
            {(["CREATED", "PENDING_APPROVAL", "APPROVED", "ASSIGNED", "IN_PROGRESS", "EXCEPTION", "PENDING_VERIFICATION", "CLOSED", "REJECTED", "CANCELLED"] as RequestStatus[]).map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
          </select>
          <select className="so-select" value={pr} onChange={(e) => { setPr(e.target.value); reset(); }}>
            <option value="all">All priorities</option>
            <option value="P1">Critical / Urgent</option><option value="P2">High</option><option value="P3">Medium</option><option value="P4">Low</option>
          </select>
          <select className="so-select" value={site} onChange={(e) => { setSite(e.target.value); reset(); }}>
            <option value="all">All sites</option>
            {db.sites.map((s) => <option key={s.id} value={s.id}>{siteCode(s.id)} · {siteLabel(s)}</option>)}
          </select>
          <select className="so-select" value={sla} onChange={(e) => { setSla(e.target.value); reset(); }}>
            <option value="all">All SLA states</option>
            <option value="On Track">On Track</option><option value="At Risk">At Risk</option><option value="Breached">Breached</option>
          </select>
          <button className="so-ghost-btn" onClick={() => { setQ(""); setSt("all"); setPr("all"); setSite("all"); setSla("all"); reset(); }}>Clear</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="so-table">
          <thead><tr><th>Request ID ⇅</th><th>Machine / Issue</th><th>Site</th><th>Priority</th><th>Technician</th><th>Status</th><th>SLA</th><th>Last Updated</th><th /></tr></thead>
          <tbody>
            {vis.map((r) => {
              const m = db.machines.find((x) => x.id === r.machineId);
              const s = db.sites.find((x) => x.id === r.siteId);
              return (
                <tr key={r.id}>
                  <td><button className="so-req-id" onClick={() => onOpen(r.id)}>{r.code}</button><div className="so-req-sub">{woForRequest(r.code)}</div></td>
                  <td><div className="so-machine">{m ? machineLabel(m) : r.title}</div><div className="so-issue">{r.title.length > 42 ? r.title.slice(0, 42) + "…" : r.title}</div></td>
                  <td className="so-cell">{s ? `${siteCode(s.id)} · ${siteLabel(s)}` : r.siteId}</td>
                  <td>{prioPill(r.priority, r.title)}</td>
                  <td className="so-cell">{techName(db, r.id)}</td>
                  <td>{statusPill(r.status)}</td>
                  <td>{slaPill(r)}</td>
                  <td className="so-cell-dim" style={{ whiteSpace: "nowrap" }}>{fmtWhen(r.createdAt)}</td>
                  <td><button className="so-row-arrow" onClick={() => onOpen(r.id)} aria-label={`Open ${r.code}`}>→</button></td>
                </tr>
              );
            })}
            {vis.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 30, color: "#8b99b0" }}>No requests match these filters. <button className="so-link" onClick={() => { setQ(""); setSt("all"); setPr("all"); setSite("all"); setSla("all"); reset(); }}>Clear filters</button></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="so-table-foot">
        <span>Showing {vis.length} of {rows.length} records</span>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="so-ghost-btn" style={{ padding: "6px 12px" }} disabled={cur === 0} onClick={() => setPage(cur - 1)}>← Prev</button>
          <span>Page {cur + 1} / {pages}</span>
          <button className="so-ghost-btn" style={{ padding: "6px 12px" }} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next →</button>
        </span>
        <span>All times in UTC · Select a request to manage its lifecycle</span>
      </div>
    </div>
  );
}

/* ---------- equipment ---------- */
export function EquipmentPage({ onSelect, onOpenRequest, destinationSel }: { onSelect: (s: MapSelection) => void; onOpenRequest?: (id: string) => void; destinationSel?: MapSelection | null }) {
  const db = useDB();
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <MapPanel sites={db.sites} techs={[]} requests={db.requests}
          machines={db.machines} assignments={db.assignments}
          openExceptionReqIds={new Set(db.exceptions.filter((e) => !e.resolved).map((e) => e.requestId))}
          showTechs={false} height={380} onSelect={onSelect} onOpenRequest={onOpenRequest} destinationSel={destinationSel ?? null} />
      </div>
      <div className="so-cards">
        {db.machines.map((m) => {
          const meta = MACHINE_META[m.id];
          const open = db.requests.filter((r) => r.machineId === m.id && r.status !== "CLOSED").length;
          return (
            <button key={m.id} className="so-info-card so-clickable" onClick={() => onSelect({ kind: "equipment", id: m.id })}>
              <div className="so-info-id">{meta?.eq ?? m.code}</div>
              <div className="so-info-name">{machineLabel(m)}</div>
              <div className="so-kv">criticality: <b>{meta?.criticality ?? "—"}</b></div>
              <div className="so-kv">model: <b>{meta?.model ?? "—"}</b></div>
              <div className="so-kv">site: <b>{siteCode(m.siteId)}</b></div>
              <div className="so-kv">skill: <b>{meta?.skill ?? m.skills.join(", ")}</b></div>
              <div className="so-kv">status: <b>{open > 0 ? `Active · ${open} open` : m.status}</b></div>
              <span className="so-link">View service history →</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- sites ---------- */
export function SitesPage({ onSelect, onOpenRequest, destinationSel }: { onSelect: (s: MapSelection) => void; onOpenRequest?: (id: string) => void; destinationSel?: MapSelection | null }) {
  const db = useDB();
  const openEx = new Set(db.exceptions.filter((e) => !e.resolved).map((e) => e.requestId));
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <MapPanel sites={db.sites} techs={db.techs} requests={db.requests} machines={db.machines} assignments={db.assignments} openExceptionReqIds={openEx} height={420} onSelect={onSelect} onOpenRequest={onOpenRequest} destinationSel={destinationSel ?? null} />
      </div>
      <div className="so-cards">
        {db.sites.map((s) => {
          const meta = SITE_META[s.id];
          const h = siteHealth(s.id, db.requests, openEx);
          const eq = db.machines.filter((m) => m.siteId === s.id).length;
          const open = db.requests.filter((r) => r.siteId === s.id && r.status !== "CLOSED");
          const wo = open.filter((r) => ["ASSIGNED", "IN_PROGRESS"].includes(r.status)).length;
          const techs = db.techs.filter((t) => t.siteId === s.id);
          return (
            <button key={s.id} className="so-info-card so-clickable" onClick={() => onSelect({ kind: "site", id: s.id })}>
              <div className="so-info-id">{meta?.st ?? s.code} · <span style={{ color: ({ healthy: "#22c07a", active: "#2f81f7", warning: "#e8c13c", urgent: "#e07b2c", critical: "#e5484d", inactive: "#5d6b84" } as Record<string, string>)[h] }}>{h.toUpperCase()}</span></div>
              <div className="so-info-name" style={{ fontSize: 16 }}>{siteLabel(s)}</div>
              <div className="so-kv">contact: <b>{meta?.contact}</b></div>
              <div className="so-kv">email: <b>{meta?.email}</b></div>
              <div className="so-kv">location: <b>{meta?.loc}</b></div>
              <div className="so-kv">equipment: <b>{eq}</b> · open: <b>{open.length}</b> · work orders: <b>{wo}</b> · techs: <b>{techs.filter((t) => t.online).length}/{techs.length}</b></div>
              <span className="so-link">Open site →</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- technicians ---------- */
export function TechniciansPage({ onSelect, onOpenRequest, destinationSel }: { onSelect: (s: MapSelection) => void; onOpenRequest?: (id: string) => void; destinationSel?: MapSelection | null }) {
  const db = useDB();
  const openEx = new Set(db.exceptions.filter((e) => !e.resolved).map((e) => e.requestId));
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <MapPanel sites={db.sites} techs={db.techs} requests={[]} machines={db.machines} assignments={db.assignments} openExceptionReqIds={openEx} height={380} onSelect={onSelect} onOpenRequest={onOpenRequest} destinationSel={destinationSel ?? null} />
      </div>
      <div className="so-cards" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {db.techs.map((t) => {
          const cur = db.assignments.find((a) => a.technicianId === t.id && a.active);
          const curReq = cur && db.requests.find((r) => r.id === cur.requestId);
          return (
            <button key={t.id} className="so-info-card so-clickable" style={{ textAlign: "left" }} onClick={() => onSelect({ kind: "technician", id: t.id })}>
              <div className="so-info-id">{techCode(t.id)} · <span className={t.online ? "" : ""} style={{ color: t.online ? "#3dd68c" : "#8b99b0" }}>{t.online ? "AVAILABLE" : "OFFLINE"}</span></div>
              <div className="so-info-name" style={{ fontSize: 16 }}>{t.name}</div>
              <div className="so-kv">site: <b>{siteCode(t.siteId)}</b></div>
              <div className="so-kv">skills: <b>{t.skills.join(", ")}</b></div>
              <div className="so-kv">current: <b>{curReq ? `${curReq.code} · ${curReq.title.slice(0, 30)}` : "—"}</b></div>
              <div className="so-bar" style={{ marginTop: 8 }}><i style={{ width: `${Math.round(t.currentLoad * 100)}%`, background: t.currentLoad > 0.7 ? "#e5484d" : t.currentLoad > 0.4 ? "#e8a13c" : "#22c07a" }} /></div>
              <div className="so-kv" style={{ marginTop: 6 }}>workload {Math.round(t.currentLoad * 100)}% · {t.certifications.join(", ")}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function InventoryPage() {
  const parts = [
    { id: "SP-01", name: "Hydraulic seal kit", loc: "Riverside warehouse", res: 2, sku: "HYD-SK-200", stock: 8, th: 5 },
    { id: "SP-02", name: "Spindle bearing", loc: "Northwind warehouse", res: 1, sku: "BRG-6205", stock: 3, th: 5 },
    { id: "SP-03", name: "Air filter element", loc: "Summit warehouse", res: 0, sku: "FLT-GA75", stock: 0, th: 4 },
    { id: "SP-04", name: "Drive belt", loc: "Riverside warehouse", res: 1, sku: "BLT-3200", stock: 12, th: 5 },
  ];
  return (
    <div className="so-cards">
      {parts.map((p) => {
        const free = p.stock - p.res;
        const tone = free <= 0 ? "red" : free < p.th ? "amber" : "green";
        const label = free <= 0 ? "Critical stock" : free < p.th ? "Low stock" : "Healthy";
        return (
          <div key={p.id} className="so-info-card">
            <div className="so-info-id">{p.id}</div>
            <div className="so-info-name" style={{ fontSize: 16 }}>{p.name}</div>
            <div className="so-kv">location: <b>{p.loc}</b></div>
            <div className="so-kv">reserved: <b>{p.res}</b></div>
            <div className="so-kv">sku: <b>{p.sku}</b></div>
            <div className="so-kv">stock: <b>{p.stock}</b> · available: <b>{free}</b></div>
            <div className="so-kv">threshold: <b>{p.th}</b></div>
            <div style={{ marginTop: 8 }}><Pill tone={tone}>{free} available · {label}</Pill></div>
          </div>
        );
      })}
    </div>
  );
}

export function SchedulePage() {
  const db = useDB();
  const groups = useMemo(() => {
    const g = new Map<string, typeof db.requests>();
    [...db.requests].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)).forEach((r) => {
      const d = new Date(r.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      if (!g.has(d)) g.set(d, []);
      g.get(d)!.push(r);
    });
    return [...g.entries()];
  }, [db]);
  return (
    <div className="so-table-wrap">
      <div className="so-table-bar"><span className="so-table-title" style={{ fontSize: 14 }}>Assignment schedule · UTC</span><button className="so-ghost-btn" style={{ marginLeft: "auto" }}>Show day</button></div>
      <div>{groups.map(([day, rs]) => (
        <div key={day}>
          <div className="so-sched-day">{day} · {rs.length} jobs</div>
          {rs.map((r) => (
            <div key={r.id} className="so-sched-row">
              <b style={{ color: "#dbe4f3" }}>{fmtWhen(r.createdAt)}</b>
              <span className="so-cell" style={{ textAlign: "center" }}>{techName(db, r.id)}</span>
              <span className="so-cell" style={{ textAlign: "center" }}>{r.code} · {woForRequest(r.code)} · {r.title.slice(0, 34)}</span>
              <span style={{ textAlign: "right" }}>{statusPill(r.status)}</span>
            </div>
          ))}
        </div>
      ))}</div>
    </div>
  );
}

export function ExceptionsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const db = useDB();
  const sev = (t: string) => (t === "TECH_DROPOUT" || t === "PART_UNAVAILABLE" ? "Critical" : t === "TECH_CONFLICT" || t === "RESOURCE_CONFLICT" ? "High" : "High");
  const title = (t: string) => t === "TECH_DROPOUT" ? "Technician unavailable" : t === "PART_UNAVAILABLE" ? "Spare part unavailable" : t === "TECH_CONFLICT" ? "Technician double-booked" : t === "RESOURCE_CONFLICT" ? "Resource conflict" : "SLA breached";
  const owner = (t: string) => t === "TECH_DROPOUT" ? "Dispatcher" : "Service Manager";
  const list = db.exceptions.filter((e) => !e.resolved);
  return (
    <div className="so-table-wrap" style={{ padding: 4 }}>
      {list.map((ex) => {
        const r = db.requests.find((x) => x.id === ex.requestId);
        const m = r && db.machines.find((x) => x.id === r.machineId);
        return (
          <div key={ex.id} className="so-exrow">
            <div className="so-exbody">
              <Pill tone={sev(ex.type) === "Critical" ? "red" : "amber"}>{sev(ex.type)}</Pill>
              <div className="so-ex-title">{title(ex.type)} · {r?.code}</div>
              <div className="so-ex-desc">{ex.message}</div>
              <div className="so-ex-owner">
                {m ? `${machineLabel(m)} · ` : ""}{r ? `${siteLabel(db.sites.find((s) => s.id === r.siteId))} · ` : ""}{r ? slaOf(r).t + " · " : ""}Owner: {owner(ex.type)}
              </div>
            </div>
            <div className="so-ex-actions">
              {r && <button className="so-ghost-btn" onClick={() => onOpen(r.id)}>View request</button>}
              <button className="so-ghost-btn solid" onClick={() => { if (r) { try { store.reassign(r.id, "u-ops"); } catch (e) { alert((e as Error).message); } } store.resolveException(ex.id, "u-ops"); }}>Resolve / escalate</button>
            </div>
          </div>
        );
      })}
      {list.length === 0 && <div style={{ padding: 34, textAlign: "center", color: "#8b99b0" }}>NO ACTIVE EXCEPTIONS — All operational requests are currently within normal thresholds.</div>}
    </div>
  );
}

/* ---------- reports & analytics ---------- */
function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="so-chart-row">
      <span className="so-chart-label">{label}</span>
      <span className="so-bar" style={{ flex: 1 }}><i style={{ width: `${max ? Math.round((value / max) * 100) : 0}%`, background: color }} /></span>
      <span className="so-prio-count" style={{ minWidth: 28 }}>{value}</span>
    </div>
  );
}

export function ReportsPage() {
  const db = useDB();
  const total = db.requests.length || 1;
  const closed = db.requests.filter((r) => r.status === "CLOSED").length;
  const compliant = db.requests.filter((r) => slaElapsedRatio(r.createdAt, r.slaDeadline) < 1 || r.status === "CLOSED").length;
  const bySite = db.sites.map((s) => ({ label: `${siteCode(s.id)}`, value: db.requests.filter((r) => r.siteId === s.id).length }));
  const byStatus = Object.keys(statusLabel).map((s) => ({ label: statusLabel[s], value: db.requests.filter((r) => r.status === s).length })).filter((x) => x.value > 0);
  const byPrio = ["P1", "P2", "P3", "P4"].map((p) => ({ label: prioLabelFull(p), value: db.requests.filter((r) => r.priority === p).length }));
  const exTypes = ["TECH_DROPOUT", "PART_UNAVAILABLE", "SLA_BREACH"].map((t) => ({ label: t.replace(/_/g, " "), value: db.exceptions.filter((e) => e.type === t).length }));
  const perTech = db.techs.map((t) => ({ label: t.name.split(" ")[0] + " " + (t.name.split(" ")[1]?.[0] ?? ""), value: db.assignments.filter((a) => a.technicianId === t.id).length })).sort((a, b) => b.value - a.value).slice(0, 6);
  const toStatus = (requestId: string, s: string) => {
    const l = db.logs.filter((x) => x.requestId === requestId && x.kind === "STATUS" && x.text.includes(`→ ${s}`)).sort((a, b) => +new Date(a.at) - +new Date(b.at))[0];
    return l ? (new Date(l.at).getTime() - new Date(db.requests.find((r) => r.id === requestId)?.createdAt ?? l.at).getTime()) / 3600000 : null;
  };
  const resp = db.requests.map((r) => toStatus(r.id, "ASSIGNED") ?? toStatus(r.id, "IN_PROGRESS")).filter((x): x is number => x != null && x >= 0);
  const reso = db.requests.map((r) => toStatus(r.id, "PENDING_VERIFICATION") ?? toStatus(r.id, "CLOSED")).filter((x): x is number => x != null && x >= 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const fmtH = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(1)}h`);
  const closedReqs = db.requests.filter((r) => r.status === "CLOSED");
  const clean = closedReqs.filter((r) => !db.logs.some((l) => l.requestId === r.id && l.text.includes("→ EXCEPTION")));
  const ftfr = closedReqs.length ? Math.round((clean.length / closedReqs.length) * 100) : null;
  const avgLoad = db.techs.length ? Math.round((db.techs.reduce((s, t) => s + t.currentLoad, 0) / db.techs.length) * 100) : null;
  const isPrev = (t: string, d: string) => /preventive|preventive maintenance|\bpm\b|inspection|calibration|scheduled/i.test(`${t} ${d}`);
  const prevCount = db.requests.filter((r) => isPrev(r.title, r.description)).length;
  const costBySite = db.sites.map((s) => {
    const v = db.reservations
      .filter((x) => x.siteId === s.id)
      .reduce((sum, x) => {
        const p = db.parts.find((pp) => pp.sku === x.sku && pp.siteId === x.siteId);
        return sum + x.qty * (p?.unitCost ?? 0);
      }, 0);
    return { label: siteCode(s.id), value: Math.round(v) };
  });
  const maxCost = Math.max(1, ...costBySite.map((x) => x.value));
  const maxSite = Math.max(1, ...bySite.map((x) => x.value));
  const maxSt = Math.max(1, ...byStatus.map((x) => x.value));
  const maxPr = Math.max(1, ...byPrio.map((x) => x.value));
  const maxEx = Math.max(1, ...exTypes.map((x) => x.value));
  const maxTech = Math.max(1, ...perTech.map((x) => x.value));
  return (
    <div>
      <div className="so-kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {[            ["Closure rate", `${Math.round((closed / total) * 100)}%`, `${closed}/${total} closed`], ["SLA compliance", `${Math.round((compliant / total) * 100)}%`, "within deadline"], ["Open exceptions", `${db.exceptions.filter((e) => !e.resolved).length}`, "needs action"], ["Active technicians", `${db.techs.filter((t) => t.online).length}/${db.techs.length}`, "online now"]].map(([l, v, f]) => (
          <div key={l as string} className="so-kpi" style={{ cursor: "default" }}>
            <div className="so-kpi-top"><span>{l}</span></div>
            <div className="so-kpi-num">{v}</div>
            <div className="so-kpi-foot"><span>{f}</span></div>
          </div>
        ))}
      </div>
      <div className="so-kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {([
          ["Avg response", fmtH(avg(resp)), "created → assigned"],
          ["Avg resolution", fmtH(avg(reso)), "created → completed"],
          ["First-time fix", ftfr == null ? "—" : `${ftfr}%`, `${clean.length}/${closedReqs.length} clean closes`],
          ["Avg tech load", avgLoad == null ? "—" : `${avgLoad}%`, "across roster"],
        ] as [string, string, string][]).map(([l, v, f]) => (
          <div key={l} className="so-kpi" style={{ cursor: "default" }}>
            <div className="so-kpi-top"><span>{l}</span></div>
            <div className="so-kpi-num">{v}</div>
            <div className="so-kpi-foot"><span>{f}</span></div>
          </div>
        ))}
      </div>
      <div className="so-grid-3" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)" }}>
        <div className="so-panel"><div className="so-panel-head"><span className="so-panel-title">Requests by site</span></div>{bySite.map((x) => <HBar key={x.label} {...x} max={maxSite} color="#2f81f7" />)}</div>
        <div className="so-panel"><div className="so-panel-head"><span className="so-panel-title">Requests by status</span></div>{byStatus.map((x) => <HBar key={x.label} {...x} max={maxSt} color="#2dd4bf" />)}</div>
        <div className="so-panel"><div className="so-panel-head"><span className="so-panel-title">Requests by priority</span></div>{byPrio.map((x) => <HBar key={x.label} {...x} max={maxPr} color="#e8a13c" />)}</div>
        <div className="so-panel"><div className="so-panel-head"><span className="so-panel-title">Exceptions by type</span></div>{exTypes.map((x) => <HBar key={x.label} {...x} max={maxEx} color="#e5484d" />)}</div>
        <div className="so-panel"><div className="so-panel-head"><span className="so-panel-title">Workload by technician</span><span className="so-panel-meta">assignments</span></div>{perTech.map((x) => <HBar key={x.label} {...x} max={maxTech} color="#5ea2ff" />)}</div>
        <div className="so-panel"><div className="so-panel-head"><span className="so-panel-title">Preventive vs corrective</span><span className="so-panel-meta">by request wording</span></div>
          <HBar label="Preventive" value={prevCount} max={Math.max(1, total)} color="#2dd4bf" />
          <HBar label="Corrective" value={total - prevCount} max={Math.max(1, total)} color="#e07b2c" />
          <div style={{ fontSize: 12, color: "#8b99b0", marginTop: 6 }}>Avg response {fmtH(avg(resp))} · avg resolution {fmtH(avg(reso))} (from status timeline)</div>
        </div>
        <div className="so-panel"><div className="so-panel-head"><span className="so-panel-title">Parts cost by site</span><span className="so-panel-meta">reserved + consumed ₹</span></div>
          {costBySite.map((x) => <HBar key={x.label} label={x.label} value={x.value} max={maxCost} color="#8b99b0" />)}
          {costBySite.every((x) => x.value === 0) && <div style={{ fontSize: 12, color: "#5d6b84" }}>No parts reserved yet — costs accrue on assignment.</div>}
        </div>
        <div className="so-panel"><div className="so-panel-head"><span className="so-panel-title">Reading these charts</span></div>
          <div style={{ fontSize: 12.5, color: "#8b99b0", lineHeight: 1.8 }}>Every bar is computed live from the same request, assignment and exception store that drives dispatch — approve, assign or resolve an exception and the analytics move. SLA compliance counts requests closed or still inside deadline.</div></div>
      </div>
    </div>
  );
}

export function AuditPage() {
  const db = useDB();
  const [res, setRes] = useState("");
  return (
    <div className="so-table-wrap">
      <div className="so-table-bar"><span className="so-table-title">Audit trail · hash-chained</span><span className="so-count">{db.audit.length}</span>
        <button className="so-ghost-btn" style={{ marginLeft: "auto" }} onClick={() => { const v = verifyChain(); setRes(v.ok ? `✓ Integrity verified — ${db.audit.length} entries, chain intact.` : `✗ BROKEN at index ${v.badIndex}`); }}>Verify integrity</button>
      </div>
      {res && <div style={{ margin: "0 18px 12px", fontSize: 12, color: res.startsWith("✓") ? "#3dd68c" : "#ff7a7a" }}>{res}</div>}
      <div style={{ maxHeight: 520, overflow: "auto" }}>
        <table className="so-table"><thead><tr><th>Event</th><th>Actor</th><th>Entity</th><th>Hash</th><th>Time</th></tr></thead>
          <tbody>{[...db.audit].reverse().slice(0, 60).map((a) => (
            <tr key={a.id}><td><Pill tone="grey">{a.action}</Pill></td><td className="so-cell">{a.actor}</td><td className="so-cell-dim so-mono">{a.entity}:{a.entityId.slice(0, 10)}</td><td className="so-cell-dim so-mono">{a.hash.slice(0, 10)} ← {a.prevHash.slice(0, 6)}</td><td className="so-cell-dim">{fmtWhen(a.at)}</td></tr>
          ))}</tbody></table>
        {db.audit.length === 0 && <div style={{ padding: 24, color: "#8b99b0", fontSize: 13 }}>No audit entries yet — approve, assign or resolve an exception to append sealed events.</div>}
      </div>
    </div>
  );
}

export function SimplePage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="so-table-wrap" style={{ padding: 22 }}>
      <div className="so-table-title" style={{ marginBottom: 10 }}>{title}</div>
      <div style={{ color: "#a9b7cf", fontSize: 13, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}
