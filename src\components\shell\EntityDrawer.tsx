import { useMemo, useState } from "react";
import { store, useDB } from "@/services/store";
import { haversineKm, distToSiteM, isOnSite, GEOFENCE_M } from "@/lib/geo";
import { readTelemetry } from "@/services/iot/telemetry";
import {
  MACHINE_META, SITE_META, machineCode, machineLabel, siteCode, siteLabel, techCode, woForRequest,
} from "./catalog";
import { prioPill, slaPill, statusPill, fmtWhen } from "./ServiceOpsPages";
import { HEALTH_COLOR, siteHealth, type MapSelection } from "./MapPanel";
import type { ServiceRequest } from "@/types";

interface Props {
  sel: MapSelection | null;
  meId: string;
  onClose: () => void;
  onOpenRequest: (id: string) => void;
  onSelect: (sel: MapSelection) => void;
}

function Stat({ n, l }: { n: React.ReactNode; l: string }) {
  return (
    <div className="so-draw-stat"><div className="so-draw-stat-n">{n}</div><div className="so-draw-stat-l">{l}</div></div>
  );
}

function ReqRow({ r, onOpen }: { r: ServiceRequest; onOpen: (id: string) => void }) {
  const db = useDB();
  const m = db.machines.find((x) => x.id === r.machineId);
  return (
    <button className="so-draw-row" onClick={() => onOpen(r.id)}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <b className="so-req-id">{r.code}</b>
        <span className="so-req-sub">{woForRequest(r.code)}</span>
        <span style={{ marginLeft: "auto" }}>{prioPill(r.priority, r.title)}</span>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#e6edf8", marginTop: 4 }}>{machineLabel(m)} · {r.title.slice(0, 44)}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>{statusPill(r.status)} {slaPill(r)}<span className="so-req-sub" style={{ marginLeft: "auto" }}>{fmtWhen(r.createdAt)}</span></div>
    </button>
  );
}

function SiteDetail({ siteId, onOpenRequest, onSelect }: {
  siteId: string; onOpenRequest: (id: string) => void; onSelect: (s: MapSelection) => void;
}) {
  const db = useDB();
  const [tab, setTab] = useState("Overview");
  const site = db.sites.find((s) => s.id === siteId);
  const meta = SITE_META[siteId];
  const openEx = useMemo(() => new Set(db.exceptions.filter((e) => !e.resolved).map((e) => e.requestId)), [db]);
  if (!site) return null;
  const h = siteHealth(siteId, db.requests, openEx);
  const machines = db.machines.filter((m) => m.siteId === siteId);
  const reqs = db.requests.filter((r) => r.siteId === siteId);
  const open = reqs.filter((r) => r.status !== "CLOSED");
  const activeWO = reqs.filter((r) => ["ASSIGNED", "IN_PROGRESS"].includes(r.status)).length;
  const techs = db.techs.filter((t) => t.siteId === siteId);
  const logs = db.logs.filter((l) => reqs.some((r) => r.id === l.requestId)).slice(0, 8);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <span className="so-info-id" style={{ margin: 0 }}>{meta?.st ?? site.code}</span>
        <span className="so-pill" style={{ background: HEALTH_COLOR[h] + "22", color: HEALTH_COLOR[h] }}>{h.toUpperCase()}</span>
      </div>
      <h2 className="so-draw-title">{siteLabel(site)}</h2>
      <div className="so-kv">contact: <b>{meta?.contact}</b> · {meta?.email}</div>
      <div className="so-kv">location: <b>{meta?.loc}</b> · {site.lat.toFixed(3)}, {site.lng.toFixed(3)}</div>

      <div className="so-draw-tabs">
        {["Overview", "Equipment", "Requests", "Technicians", "Activity"].map((t) => (
          <button key={t} className={`so-draw-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="so-draw-stats">
          <Stat n={machines.length} l="Equipment" />
          <Stat n={open.length} l="Open requests" />
          <Stat n={activeWO} l="Active work orders" />
          <Stat n={techs.filter((t) => t.online).length + "/" + techs.length} l="Techs online" />
        </div>
      )}
      {tab === "Equipment" && machines.map((m) => (
        <button key={m.id} className="so-draw-row" onClick={() => onSelect({ kind: "equipment", id: m.id })}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ color: "#e6edf8" }}>{machineLabel(m)}</b><span className="so-req-sub">{machineCode(m.id)}</span><span style={{ marginLeft: "auto" }} className="so-req-sub">{m.status}</span></div>
          <div className="so-kv" style={{ margin: "6px 0 0" }}>open requests: <b>{reqs.filter((r) => r.machineId === m.id && r.status !== "CLOSED").length}</b> · {MACHINE_META[m.id]?.model}</div>
        </button>
      ))}
      {tab === "Requests" && (open.length === 0 ? <div className="so-draw-empty">No open requests at this site.</div> : open.map((r) => <ReqRow key={r.id} r={r} onOpen={onOpenRequest} />))}
      {tab === "Technicians" && techs.map((t) => (
        <button key={t.id} className="so-draw-row" onClick={() => onSelect({ kind: "technician", id: t.id })}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ color: "#e6edf8" }}>{t.name}</b><span className="so-req-sub">{techCode(t.id)}</span><span style={{ marginLeft: "auto" }} className={`so-pill ${t.online ? "green" : "grey"}`}>{t.online ? "Available" : "Offline"}</span></div>
          <div className="so-kv" style={{ margin: "6px 0 0" }}>{t.skills.join(" · ")} · load {Math.round(t.currentLoad * 100)}%</div>
        </button>
      ))}
      {tab === "Activity" && (logs.length === 0 ? <div className="so-draw-empty">No recent activity.</div> : logs.map((l) => (
        <div key={l.id} className="so-timeline-item"><b>{l.authorName}</b> <span style={{ color: "#5d6b84" }}>{fmtWhen(l.at)}</span><div style={{ color: "#a9b7cf" }}>{l.text}</div></div>
      )))}
    </div>
  );
}

function EquipmentDetail({ machineId, onOpenRequest, onSelect }: {
  machineId: string; onOpenRequest: (id: string) => void; onSelect: (s: MapSelection) => void;
}) {
  const db = useDB();
  const m = db.machines.find((x) => x.id === machineId);
  if (!m) return null;
  const meta = MACHINE_META[machineId];
  const site = db.sites.find((s) => s.id === m.siteId);
  const hist = db.requests.filter((r) => r.machineId === machineId);
  const open = hist.filter((r) => r.status !== "CLOSED");
  const res = db.reservations.filter((x) => open.some((r) => r.id === x.requestId));
  return (
    <div>
      <div className="so-info-id" style={{ marginBottom: 4 }}>{meta?.eq ?? m.code} · {m.status}</div>
      <h2 className="so-draw-title">{machineLabel(m)}</h2>
      <div className="so-kv">type: <b>{m.name}</b></div>
      <div className="so-kv">model: <b>{meta?.model ?? "—"}</b> · criticality: <b>{meta?.criticality ?? "—"}</b></div>
      <div className="so-kv">required skill: <b>{meta?.skill ?? m.skills.join(", ")}</b></div>
      <div className="so-kv">warranty: <b>{m.warrantyActive ? "Active" : "Expired"}</b> · eligible: <b>{m.eligible ? "Yes" : "No"}</b></div>
      <button className="so-draw-row" onClick={() => site && onSelect({ kind: "site", id: site.id })}>
        <div className="so-kv" style={{ margin: 0 }}>site: <b>{site ? siteLabel(site) : m.siteId}</b> <span style={{ color: "#5ea2ff" }}>→ open site</span></div>
        <div className="so-kv" style={{ margin: "6px 0 0" }}>parts reserved on open jobs: <b>{res.map((x) => `${x.sku}×${x.qty}`).join(", ") || "—"}</b></div>
      </button>
      <div className="so-draw-sec">Open requests ({open.length})</div>
      {open.length === 0 ? <div className="so-draw-empty">No open requests for this equipment.</div> : open.map((r) => <ReqRow key={r.id} r={r} onOpen={onOpenRequest} />)}
      <IotSection machineId={m.id} machineStatus={m.status} machineCode={m.code} />
      <div className="so-draw-sec">Service history ({hist.length})</div>
      {hist.map((r) => <ReqRow key={r.id} r={r} onOpen={onOpenRequest} />)}
    </div>
  );
}

function TechnicianDetail({ techId, meId, onOpenRequest }: {
  techId: string; meId: string; onOpenRequest: (id: string) => void;
}) {
  const db = useDB();
  const t = db.techs.find((x) => x.id === techId);
  const site = db.sites.find((s) => s.id === t?.siteId);
  const active = db.assignments.filter((a) => a.technicianId === techId && a.active);
  const past = db.assignments.filter((a) => a.technicianId === techId && !a.active);
  const candidates = useMemo(() => {
    if (!t) return [];
    return db.requests
      .filter((r) => r.status !== "CLOSED" && !active.some((a) => a.requestId === r.id))
      .map((r) => {
        let score = 0;
        try { score = store.rank(r.id).find((x) => x.tech.id === techId)?.breakdown.total ?? 0; } catch { score = 0; }
        const s = db.sites.find((x) => x.id === r.siteId);
        const dist = s ? haversineKm(t.lat, t.lng, s.lat, s.lng) : 0;
        return { r, score, dist, eta: Math.round((dist / 28) * 60) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [db, t, active]);
  if (!t) return null;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <span className="so-info-id" style={{ margin: 0 }}>{techCode(t.id)} · {site ? siteCode(site.id) : t.siteId}</span>
        <span className={`so-pill ${t.online ? "green" : "grey"}`}>{t.online ? "Available" : "Offline"}</span>
      </div>
      <h2 className="so-draw-title">{t.name}</h2>
      <div className="so-kv">skills: <b>{t.skills.join(", ")}</b></div>
      <div className="so-kv">certifications: <b>{t.certifications.join(", ")}</b></div>
      <div className="so-kv">workload</div>
      <div className="so-bar" style={{ marginBottom: 4 }}><i style={{ width: `${Math.round(t.currentLoad * 100)}%`, background: t.currentLoad > 0.7 ? "#e5484d" : t.currentLoad > 0.4 ? "#e8a13c" : "#22c07a" }} /></div>
      <div className="so-kv">load {Math.round(t.currentLoad * 100)}% · availability {Math.round(t.availability * 100)}%</div>
      <GeofencePill techId={t.id} />

      <div className="so-draw-sec">Current assignment ({active.length})</div>
      {active.length === 0 ? <div className="so-draw-empty">No active job — available for dispatch.</div> : active.map((a) => {
        const r = db.requests.find((x) => x.id === a.requestId);
        return r ? <ReqRow key={a.id} r={r} onOpen={onOpenRequest} /> : null;
      })}

      <div className="so-draw-sec">Assignable open requests</div>
      {candidates.map(({ r, score, dist, eta }) => (
        <div key={r.id} className="so-draw-row" style={{ cursor: "default" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="so-req-id" onClick={() => onOpenRequest(r.id)}>{r.code}</button>
            <span className="so-req-sub">{dist.toFixed(1)} km · ETA {eta} min · score {score}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#a9b7cf" }}>{r.title.slice(0, 40)}</span>
            <button className="so-ghost-btn solid" style={{ marginLeft: "auto", padding: "7px 12px" }} onClick={() => { try { store.assign(r.id, t.id, meId); } catch (e) { alert((e as Error).message); } }}>Assign</button>
          </div>
        </div>
      ))}

      {past.length > 0 && (<><div className="so-draw-sec">Recent jobs ({past.length})</div>
        {past.slice(0, 4).map((a) => {
          const r = db.requests.find((x) => x.id === a.requestId);
          return r ? <ReqRow key={a.id} r={r} onOpen={onOpenRequest} /> : null;
        })}</>)}
    </div>
  );
}

/** Simulated live telemetry (DEMO). Anomaly routes into the existing emergency-request flow. */
function IotSection({ machineId, machineStatus, machineCode }: { machineId: string; machineStatus: string; machineCode: string }) {
  const reading = readTelemetry(machineId, machineStatus);
  const tone = reading.overall === "CRITICAL" ? "red" : reading.overall === "WARNING" ? "amber" : "green";
  return (
    <div>
      <div className="so-draw-sec">IoT telemetry · simulated</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <span className={`so-pill ${tone}`}>{reading.overall === "NORMAL" ? "🟢 Normal" : reading.overall === "WARNING" ? "⚠ Watch" : "⚠ Abnormal behavior"}</span>
        <span className="so-req-sub">live simulation</span>
      </div>
      <div className="so-draw-stats">
        {reading.metrics.map((mt) => (
          <div key={mt.key} className="so-draw-stat">
            <div className="so-draw-stat-l">{mt.label}</div>
            <div className="so-draw-stat-n" style={{ fontSize: 17, color: mt.state === "NORMAL" ? "#fff" : mt.state === "WARNING" ? "#f0ad4e" : "#ff7a7a" }}>
              {mt.value}{mt.unit}
            </div>
          </div>
        ))}
      </div>
      <button
        className="so-ghost-btn" style={{ marginTop: 8 }}
        onClick={() => { try { store.iotAlert(machineCode, "u-ops"); alert("Anomaly routed — emergency request created in the dispatch queue."); } catch (e) { alert((e as Error).message); } }}
      >
        ⚠ Simulate anomaly → create emergency request
      </button>
      <div className="so-req-sub" style={{ marginTop: 6 }}>Demo telemetry only — threshold breaches use the standard request workflow.</div>
    </div>
  );
}

/** Derived geofence presence — display only, never changes state. */
function GeofencePill({ techId }: { techId: string }) {
  const db = useDB();
  const t = db.techs.find((x) => x.id === techId);
  if (!t) return null;
  const active = db.assignments.find((a) => a.technicianId === techId && a.active);
  const jobReq = active ? db.requests.find((r) => r.id === active.requestId) : undefined;
  const destSite = db.sites.find((s) => s.id === (jobReq ? jobReq.siteId : t.siteId));
  if (!destSite) return null;
  const dM = Math.round(distToSiteM(t.lat, t.lng, destSite.lat, destSite.lng));
  const inside = isOnSite(t.lat, t.lng, destSite.lat, destSite.lng);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
      <span className={`so-pill ${inside ? "green" : "blue"}`}>{inside ? "📍 On site" : "En route"}</span>
      <span className="so-req-sub">{(dM / 1000).toFixed(1)} km from {destSite.code} fence ({GEOFENCE_M / 1000} km)</span>
    </div>
  );
}

export default function EntityDrawer({ sel, meId, onClose, onOpenRequest, onSelect }: Props) {
  if (!sel) return null;
  const openReq = (id: string) => { onClose(); onOpenRequest(id); };
  return (
    <div className="so-drawer-backdrop" onClick={onClose}>
      <div className="so-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="so-drawer-close" onClick={onClose} aria-label="Close panel">✕</button>
        {sel.kind === "site" && <SiteDetail siteId={sel.id} onOpenRequest={openReq} onSelect={onSelect} />}
        {sel.kind === "equipment" && <EquipmentDetail machineId={sel.id} onOpenRequest={openReq} onSelect={onSelect} />}
        {sel.kind === "technician" && <TechnicianDetail techId={sel.id} meId={meId} onOpenRequest={openReq} />}
        {sel.kind === "request" && <RequestPick requestId={sel.id} onOpenRequest={openReq} />}
      </div>
    </div>
  );
}

function RequestPick({ requestId, onOpenRequest }: { requestId: string; onOpenRequest: (id: string) => void }) {  const db = useDB();
  const r = db.requests.find((x) => x.id === requestId);
  if (!r) return null;
  const m = db.machines.find((x) => x.id === r.machineId);
  const site = db.sites.find((s) => s.id === r.siteId);
  return (
    <div>
      <div className="so-info-id" style={{ marginBottom: 4 }}>{r.code} · {woForRequest(r.code)}</div>
      <h2 className="so-draw-title">{r.title}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>{prioPill(r.priority, r.title)} {statusPill(r.status)} {slaPill(r)}</div>
      <div className="so-kv">equipment: <b>{machineLabel(m)} ({machineCode(r.machineId)})</b></div>
      <div className="so-kv">site: <b>{site ? siteLabel(site) : r.siteId}</b></div>
      <button className="so-ghost-btn solid" style={{ marginTop: 12 }} onClick={() => onOpenRequest(r.id)}>Open request →</button>
    </div>
  );
}
