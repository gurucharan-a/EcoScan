import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { slaElapsedRatio } from "@/lib/geo";
import { fetchOsrmRoute } from "@/lib/osrm";
import {
  machineCode, machineLabel, siteLabel, woForRequest,
} from "./catalog";
import type { Assignment, Machine, ServiceRequest, Site, Technician } from "@/types";

export type MapSelection =
  | { kind: "site"; id: string }
  | { kind: "technician"; id: string }
  | { kind: "request"; id: string }
  | { kind: "equipment"; id: string };

export type SiteHealth = "healthy" | "active" | "warning" | "urgent" | "critical" | "inactive";

export const HEALTH_COLOR: Record<SiteHealth, string> = {
  healthy: "#22c07a",
  active: "#2f81f7",
  warning: "#e8c13c",
  urgent: "#e07b2c",
  critical: "#e5484d",
  inactive: "#5d6b84",
};

/** Status buckets used by the map status filter. */
export type StatusBucket =
  | "operational" | "active" | "warning" | "urgent" | "critical" | "breached" | "inactive";

export const BUCKET_COLOR: Record<StatusBucket, string> = {
  operational: "#22c07a",
  active: "#2f81f7",
  warning: "#e8c13c",
  urgent: "#e07b2c",
  critical: "#e5484d",
  breached: "#e5484d",
  inactive: "#5d6b84",
};

export type MapCategory = "all" | "sites" | "equipment" | "technicians" | "requests" | "workorders";

/** Derive per-site health from live requests + open exceptions. */
export function siteHealth(
  siteId: string,
  requests: ServiceRequest[],
  openExceptionReqIds: Set<string>,
): SiteHealth {
  const rs = requests.filter((r) => r.siteId === siteId && r.status !== "CLOSED");
  if (rs.length === 0) return "inactive";
  if (rs.some((r) => slaElapsedRatio(r.createdAt, r.slaDeadline) >= 1)) return "critical";
  if (rs.some((r) => openExceptionReqIds.has(r.id))) return "urgent";
  if (rs.some((r) => slaElapsedRatio(r.createdAt, r.slaDeadline) >= 0.8)) return "warning";
  if (rs.some((r) => r.status === "IN_PROGRESS" || r.status === "ASSIGNED")) return "active";
  return "healthy";
}

const HEALTH_BUCKET: Record<SiteHealth, StatusBucket> = {
  healthy: "operational", active: "active", warning: "warning",
  urgent: "urgent", critical: "critical", inactive: "inactive",
};

function requestBucket(r: ServiceRequest): StatusBucket {
  const ratio = slaElapsedRatio(r.createdAt, r.slaDeadline);
  if (r.status !== "CLOSED" && r.status !== "PENDING_VERIFICATION" && ratio >= 1) return "breached";
  if (r.status === "EXCEPTION") return "critical";
  if (ratio >= 0.8 && r.status !== "CLOSED") return "warning";
  if (r.status === "IN_PROGRESS" || r.status === "ASSIGNED") return "active";
  return "operational";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Props {
  sites: Site[];
  techs: Technician[];
  requests: ServiceRequest[];
  machines?: Machine[];
  assignments?: Assignment[];
  openExceptionReqIds?: Set<string>;
  showTechs?: boolean;
  showRequests?: boolean;
  showEquipment?: boolean;
  showWorkOrders?: boolean;
  height?: number;
  onSelect?: (sel: MapSelection) => void;
  onOpenRequest?: (id: string) => void;
  /** Currently selected site/equipment/request — tech ETAs are routed to it. Null = no ETA shown. */
  destinationSel?: MapSelection | null;
}

const CATS: { id: MapCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sites", label: "Sites" },
  { id: "equipment", label: "Equipment" },
  { id: "technicians", label: "Technicians" },
  { id: "requests", label: "Service Requests" },
  { id: "workorders", label: "Work Orders" },
];

/** Cross-render cache of routed tech ETAs (techId@destLat,destLng → road time + distance). */
const etaCache = new Map<string, { mins: number; km: number }>();

/**
 * Read-only snapshot of the map's latest routed ETAs, for the AI layer.
 * The map remains the source of truth — AI only reads, never writes.
 */
export function getTechEtaSnapshot(): Record<string, { mins: number; km: number }> {
  const out: Record<string, { mins: number; km: number }> = {};
  etaCache.forEach((v, k) => {
    const at = k.lastIndexOf("@");
    if (at > 0) out[k.slice(0, at)] = { mins: v.mins, km: v.km };
  });
  return out;
}

const STATUS_OPTS: { id: string; label: string }[] = [  { id: "all", label: "All statuses" },
  { id: "operational", label: "Operational" },
  { id: "active", label: "Active" },
  { id: "warning", label: "Warning" },
  { id: "urgent", label: "Urgent" },
  { id: "critical", label: "Critical" },
  { id: "breached", label: "SLA Breached" },
];

/**
 * Reusable ServiceGrid map — Leaflet + OpenStreetMap tiles only.
 * Zero API keys: ServiceGrid → Leaflet → OpenStreetMap.
 * Supports zoom/pan, interactive status markers, rich popups with actions,
 * category + status filtering, and click-through to entity details.
 */
export default function MapPanel({
  sites, techs, requests, machines = [], assignments = [], openExceptionReqIds,
  showTechs = true, showRequests = true, showEquipment = true, showWorkOrders = true,
  height = 460, onSelect, onOpenRequest, destinationSel = null,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [cat, setCat] = useState<MapCategory>("all");
  const [statusF, setStatusF] = useState("all");
  const cbRef = useRef({ onSelect, onOpenRequest });
  cbRef.current = { onSelect, onOpenRequest };

  // Road-destination for tech ETAs, resolved from the current selection.
  const dest: { lat: number; lng: number } | null = (() => {
    if (!destinationSel) return null;
    const byId = new Map(sites.map((s) => [s.id, s]));
    if (destinationSel.kind === "site") {
      const s = byId.get(destinationSel.id);
      return s ? { lat: s.lat, lng: s.lng } : null;
    }
    if (destinationSel.kind === "equipment") {
      const m = machines.find((x) => x.id === destinationSel.id);
      const s = m && byId.get(m.siteId);
      return s ? { lat: s.lat, lng: s.lng } : null;
    }
    if (destinationSel.kind === "request") {
      const rq = requests.find((x) => x.id === destinationSel.id);
      const s = rq && byId.get(rq.siteId);
      return s ? { lat: s.lat, lng: s.lng } : null;
    }
    return null;
  })();
  const destKey = dest ? `${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}` : "";
  const destLat = dest?.lat ?? 0;
  const destLng = dest?.lng ?? 0;

  // Per-tech road ETAs to the selected destination. Empty = show nothing.
  const [etaByTech, setEtaByTech] = useState<Record<string, { mins: number; km: number }>>({});
  useEffect(() => {
    if (!destKey) {
      setEtaByTech((p) => (Object.keys(p).length ? {} : p));
      return;
    }
    const ctrl = new AbortController();
    let cancelled = false;
    const ck = (id: string) => `${id}@${destKey}`;
    const immediate: Record<string, { mins: number; km: number }> = {};
    const missing = techs.filter((t) => {
      const hit = etaCache.get(ck(t.id));
      if (hit != null) { immediate[t.id] = hit; return false; }
      return true;
    });
    setEtaByTech(immediate);
    if (missing.length === 0) return;
    Promise.allSettled(missing.map(async (t) => {
      const r = await fetchOsrmRoute(t.lng, t.lat, destLng, destLat, ctrl.signal);
      return {
        id: t.id,
        eta: r ? { mins: Math.max(1, Math.round(r.durationMin)), km: Math.round(r.distanceKm * 10) / 10 } : null,
      };
    })).then((results) => {
      if (cancelled || ctrl.signal.aborted) return;
      setEtaByTech((prev) => {
        const next = { ...prev };
        results.forEach((res) => {
          if (res.status === "fulfilled" && res.value.eta != null) {
            etaCache.set(ck(res.value.id), res.value.eta);
            next[res.value.id] = res.value.eta;
          }
        });
        return next;
      });
    });
    return () => { cancelled = true; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destKey, techs]);

  const visibleCats = CATS.filter((c) => {
    if (c.id === "technicians" && !showTechs) return false;
    if (c.id === "requests" && !showRequests) return false;
    if (c.id === "equipment" && !showEquipment) return false;
    if (c.id === "workorders" && !showWorkOrders) return false;
    return true;
  });

  // Init once. Explicit-size container + invalidateSize for drawer/tab resizes.
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: true }).setView([13.0, 80.05], 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap contributors</a>",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    const t = window.setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 350);
    map.on("popupopen", (e) => {
      const el = (e.popup.getElement() as HTMLElement | null)?.querySelectorAll("[data-so-act]");
      el?.forEach((btn) => {
        (btn as HTMLElement).onclick = () => {
          const act = (btn as HTMLElement).dataset.soAct;
          const kind = (btn as HTMLElement).dataset.soKind as MapSelection["kind"];
          const id = (btn as HTMLElement).dataset.soId ?? "";
          const { onSelect: sel, onOpenRequest: open } = cbRef.current;
          if (act === "open-request") {
            const req = requests.find((r) => r.id === id);
            if (open && req) open(req.id);
            else if (req) sel?.({ kind: "request", id: req.id });
          } else if (act === "view" && (kind === "site" || kind === "equipment" || kind === "technician")) {
            sel?.({ kind, id });
          } else if (act === "assign" && kind === "technician") {
            sel?.({ kind: "technician", id });
          }
        };
      });
    });
    return () => { window.clearTimeout(t); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { map.invalidateSize(); } catch { /* noop */ }
  }, [height]);

  // Markers — rebuilt from live store data on every change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.eachLayer((l) => {
      if (l instanceof L.Marker || l instanceof L.CircleMarker || l instanceof L.Circle) map.removeLayer(l);
    });
    const ex = openExceptionReqIds ?? new Set<string>();
    const matchStatus = (b: StatusBucket) => statusF === "all" || b === statusF;
    const matchCat = (c: MapCategory) => cat === "all" || cat === c;
    const siteById = new Map(sites.map((s) => [s.id, s]));
    const dot = (lat: number, lng: number, color: string, radius: number) =>
      L.circleMarker([lat, lng], { radius, color: "#090c11", weight: 2, fillColor: color, fillOpacity: 1 });

    // ---- sites ----
    if (matchCat("sites")) sites.forEach((s) => {
      const h = siteHealth(s.id, requests, ex);
      const b = HEALTH_BUCKET[h];
      if (!matchStatus(b)) return;
      const c = HEALTH_COLOR[h];
      const eq = machines.filter((m) => m.siteId === s.id);
      const open = requests.filter((r) => r.siteId === s.id && r.status !== "CLOSED");
      const wo = open.filter((r) => ["ASSIGNED", "IN_PROGRESS"].includes(r.status)).length;
      const avail = techs.filter((t) => t.siteId === s.id && t.online).length;
      const slaTxt = open.some((r) => slaElapsedRatio(r.createdAt, r.slaDeadline) >= 1)
        ? "Breached" : open.some((r) => slaElapsedRatio(r.createdAt, r.slaDeadline) >= 0.8) ? "At Risk" : "On Track";
      L.circle([s.lat, s.lng], { radius: 3200, color: c, weight: 1, fillColor: c, fillOpacity: 0.07 }).addTo(map);
      const m = dot(s.lat, s.lng, c, 10).addTo(map);
      m.bindTooltip(`<b>${esc(s.name)}</b><br/>${h.toUpperCase()}`, { direction: "top", offset: [0, -10] });
      m.bindPopup(
        `<div class="so-pop"><div class="so-pop-kicker">SITE</div><div class="so-pop-title">${esc(s.name)}</div>` +
        `<div class="so-pop-row"><span>Status</span><b>${h.toUpperCase()}</b></div>` +
        `<div class="so-pop-row"><span>Equipment</span><b>${eq.length}</b></div>` +
        `<div class="so-pop-row"><span>Open service requests</span><b>${open.length}</b></div>` +
        `<div class="so-pop-row"><span>Active work orders</span><b>${wo}</b></div>` +
        `<div class="so-pop-row"><span>Available technicians</span><b>${avail}</b></div>` +
        `<div class="so-pop-row"><span>SLA status</span><b>${slaTxt}</b></div>` +
        `<button class="so-pop-btn" data-so-act="view" data-so-kind="site" data-so-id="${s.id}">View Site</button></div>`,
      );
      m.on("click", () => cbRef.current.onSelect?.({ kind: "site", id: s.id }));
    });

    // ---- equipment ----
    if (showEquipment && matchCat("equipment")) machines.forEach((mch, i) => {
      const s = siteById.get(mch.siteId);
      if (!s) return;
      const open = requests.filter((r) => r.machineId === mch.id && r.status !== "CLOSED");
      let b: StatusBucket = mch.status === "DOWN" ? "critical" : mch.status === "DEGRADED" ? "warning" : mch.status === "MAINTENANCE" ? "active" : "operational";
      if (open.some((r) => r.status !== "CLOSED" && r.status !== "PENDING_VERIFICATION" && slaElapsedRatio(r.createdAt, r.slaDeadline) >= 1)) b = "breached";
      else if (open.some((r) => r.status === "EXCEPTION")) b = "critical";
      else if (open.some((r) => slaElapsedRatio(r.createdAt, r.slaDeadline) >= 0.8)) b = "warning";
      else if (open.length > 0 && b === "operational") b = "active";
      if (!matchStatus(b)) return;
      const lat = s.lat + (((i % 4) - 1.5) * 0.014);
      const lng = s.lng + ((((Math.floor(i / 4) % 3) - 1)) * 0.012);
      const mk = dot(lat, lng, BUCKET_COLOR[b], 6).addTo(map);
      const curWO = assignments.find((a) => a.active && open.some((r) => r.id === a.requestId));
      const curReq = curWO && open.find((r) => r.id === curWO.requestId);
      mk.bindTooltip(`<b>${esc(machineLabel(mch))}</b><br/>${b.toUpperCase()}`, { direction: "top", offset: [0, -8] });
      mk.bindPopup(
        `<div class="so-pop"><div class="so-pop-kicker">EQUIPMENT</div><div class="so-pop-title">${esc(machineLabel(mch))} / ${esc(machineCode(mch.id))}</div>` +
        `<div class="so-pop-row"><span>Status</span><b>${esc(mch.status)} · ${b.toUpperCase()}</b></div>` +
        `<div class="so-pop-row"><span>Site</span><b>${esc(siteLabel(s))}</b></div>` +
        `<div class="so-pop-row"><span>Open requests</span><b>${open.length}</b></div>` +
        `<div class="so-pop-row"><span>Current work order</span><b>${curReq ? woForRequest(curReq.code) : "—"}</b></div>` +
        `<div class="so-pop-row"><span>SLA status</span><b>${curReq ? (slaElapsedRatio(curReq.createdAt, curReq.slaDeadline) >= 1 ? "Breached" : "On Track") : "—"}</b></div>` +
        `<button class="so-pop-btn" data-so-act="view" data-so-kind="equipment" data-so-id="${mch.id}">View Equipment</button></div>`,
      );
      mk.on("click", () => cbRef.current.onSelect?.({ kind: "equipment", id: mch.id }));
    });

    // ---- technicians ----
    if (showTechs && matchCat("technicians")) techs.forEach((t) => {
      const cur = assignments.find((a) => a.technicianId === t.id && a.active);
      const curReq = cur && requests.find((r) => r.id === cur.requestId && r.status !== "CLOSED");
      const b: StatusBucket = !t.online ? "inactive" : curReq ? "active" : "operational";
      if (!matchStatus(b)) return;
      const s = siteById.get(t.siteId);
      const mk = dot(t.lat, t.lng, BUCKET_COLOR[b], 6).addTo(map);
      const techEta = etaByTech[t.id];
      mk.bindTooltip(`<b>${esc(t.name)}</b><br/>${t.online ? "AVAILABLE" : "OFFLINE"} · load ${Math.round(t.currentLoad * 100)}%${techEta != null ? `<br/>ETA ${techEta.mins} min` : ""}`, { direction: "top", offset: [0, -8] });
      mk.bindPopup(
        `<div class="so-pop"><div class="so-pop-kicker">TECHNICIAN</div><div class="so-pop-title">${esc(t.name)}</div>` +
        `<div class="so-pop-row"><span>Availability</span><b>${t.online ? "Available" : "Offline"}</b></div>` +
        `<div class="so-pop-row"><span>Current work order</span><b>${curReq ? `${woForRequest(curReq.code)} (${curReq.code})` : "—"}</b></div>` +
        `<div class="so-pop-row"><span>Current site</span><b>${s ? esc(siteLabel(s)) : t.siteId}</b></div>` +
        `<div class="so-pop-row"><span>Location</span><b>${t.lat.toFixed(3)}, ${t.lng.toFixed(3)}</b></div>` +
        `<div class="so-pop-btnrow"><button class="so-pop-btn" data-so-act="view" data-so-kind="technician" data-so-id="${t.id}">View Technician</button>` +
        `<button class="so-pop-btn so-pop-btn-alt" data-so-act="assign" data-so-kind="technician" data-so-id="${t.id}">Assign Work Order</button></div></div>`,
      );
      mk.on("click", () => cbRef.current.onSelect?.({ kind: "technician", id: t.id }));
    });

    // ---- service requests ----
    if (showRequests && matchCat("requests")) requests.filter((r) => r.status !== "CLOSED").forEach((r) => {
      const s = siteById.get(r.siteId);
      if (!s) return;
      const b = requestBucket(r);
      if (!matchStatus(b)) return;
      const jitter = (((r.code.charCodeAt(3) || 0) % 7) * 0.006) + 0.004;
      const mk = dot(s.lat + jitter, s.lng + jitter, BUCKET_COLOR[b], 5).addTo(map);
      mk.bindTooltip(`<b>${esc(r.code)}</b> [${esc(r.priority)}]<br/>${esc(r.title)}`, { direction: "top", offset: [0, -6] });
      mk.bindPopup(
        `<div class="so-pop"><div class="so-pop-kicker">SERVICE REQUEST · ${esc(woForRequest(r.code))}</div><div class="so-pop-title">${esc(r.code)} — ${esc(r.title.slice(0, 48))}</div>` +
        `<div class="so-pop-row"><span>Priority</span><b>${esc(r.priority)}</b></div>` +
        `<div class="so-pop-row"><span>Status</span><b>${esc(r.status.replace(/_/g, " "))}</b></div>` +
        `<div class="so-pop-row"><span>SLA</span><b>${b === "breached" ? "BREACHED" : b === "warning" ? "AT RISK" : "ON TRACK"}</b></div>` +
        `<button class="so-pop-btn" data-so-act="open-request" data-so-id="${r.id}">View Request</button></div>`,
      );
      mk.on("click", () => {
        const { onSelect: sel, onOpenRequest: open } = cbRef.current;
        if (open) open(r.id);
        else sel?.({ kind: "request", id: r.id });
      });
    });

    // ---- work orders (active assignments) ----
    if (showWorkOrders && matchCat("workorders")) assignments.filter((a) => a.active).forEach((a) => {
      const r = requests.find((x) => x.id === a.requestId && x.status !== "CLOSED");
      if (!r) return;
      const b = requestBucket(r);
      if (!matchStatus(b)) return;
      const t = techs.find((x) => x.id === a.technicianId);
      const s = siteById.get(r.siteId);
      const lat = t ? t.lat + 0.004 : (s ? s.lat - 0.004 : 0);
      const lng = t ? t.lng + 0.004 : (s ? s.lng - 0.004 : 0);
      if (!s && !t) return;
      const mk = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "so-wo-icon",
          html: `<span style="background:${BUCKET_COLOR[b]}"></span>`,
          iconSize: [14, 14],
        }),
      }).addTo(map);
      mk.bindTooltip(`<b>${esc(woForRequest(r.code))}</b> · ${esc(t?.name ?? "Unassigned")}<br/>${esc(r.title)}`, { direction: "top", offset: [0, -8] });
      mk.bindPopup(
        `<div class="so-pop"><div class="so-pop-kicker">WORK ORDER</div><div class="so-pop-title">${esc(woForRequest(r.code))} · ${esc(r.code)}</div>` +
        `<div class="so-pop-row"><span>Technician</span><b>${esc(t?.name ?? "Unassigned")}</b></div>` +
        `<div class="so-pop-row"><span>Status</span><b>${esc(r.status.replace(/_/g, " "))}</b></div>` +
        `<div class="so-pop-row"><span>SLA</span><b>${b === "breached" ? "BREACHED" : b === "warning" ? "AT RISK" : "ON TRACK"}</b></div>` +
        `<button class="so-pop-btn" data-so-act="open-request" data-so-id="${r.id}">View Work Order</button></div>`,
      );
      mk.on("click", () => {
        const { onSelect: sel, onOpenRequest: open } = cbRef.current;
        if (open) open(r.id);
        else sel?.({ kind: "request", id: r.id });
      });
    });
  }, [sites, techs, requests, machines, assignments, openExceptionReqIds, cat, statusF,
    showTechs, showRequests, showEquipment, showWorkOrders, etaByTech]);

  return (
    <div className="so-map">
      <div className="so-map-filters">
        <div className="so-map-chips" role="tablist" aria-label="Map layer filter">
          {visibleCats.map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id}
              className={`so-chip${cat === c.id ? " active" : ""}`} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <select className="so-select so-map-status" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Marker status filter">
          {STATUS_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div ref={ref} style={{ height, width: "100%", zIndex: 0, background: "#e5e3df" }} />
      <div className="so-map-legend">
        <span className="so-map-legend-item"><span className="so-dot-lg" style={{ background: "#22c07a" }} />Operational</span>
        <span className="so-map-legend-item"><span className="so-dot-lg" style={{ background: "#2f81f7" }} />Active</span>
        <span className="so-map-legend-item"><span className="so-dot-lg" style={{ background: "#e8c13c" }} />Warning</span>
        <span className="so-map-legend-item"><span className="so-dot-lg" style={{ background: "#e07b2c" }} />Urgent</span>
        <span className="so-map-legend-item"><span className="so-dot-lg" style={{ background: "#e5484d" }} />Critical / breached</span>
        <span className="so-map-legend-item"><span className="so-dot-lg" style={{ background: "#5d6b84" }} />Offline / inactive</span>
        <span className="so-map-src">Leaflet + OpenStreetMap · no API key · click a marker to inspect</span>
      </div>
    </div>
  );
}
