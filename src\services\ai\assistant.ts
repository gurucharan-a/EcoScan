/**
 * ✦ Ask ServiceGrid — deterministic, read-only assistant over live store data.
 * No API, no keys, no invented facts: every answer is computed from the
 * snapshot passed in. Unknown questions get a guidance response, never a guess.
 */
import { haversineKm, slaElapsedRatio } from "@/lib/geo";

export interface AssistantDB {
  sites: { id: string; name: string; code: string; lat: number; lng: number }[];
  machines: { id: string; code: string; name: string; siteId: string; status: string }[];
  techs: { id: string; name: string; siteId: string; lat: number; lng: number; online: boolean; currentLoad: number; skills: string[]; availability: number }[];
  requests: { id: string; code: string; machineId: string; siteId: string; title: string; priority: string; status: string; createdAt: string; slaDeadline: string }[];
  assignments: { requestId: string; technicianId: string; active: boolean }[];
  parts: { sku: string; qty: number; reservedQty: number; siteId: string }[];
  exceptions: { requestId: string; type: string; message: string; resolved: boolean }[];
}

export const ASSISTANT_SUGGESTIONS = [
  "Which technicians are available near Guindy?",
  "Which requests are at risk?",
  "Which machine has the most failures?",
  "What's the status of SR-1042?",
  "Which resources are unavailable?",
  "Why is SR-1045 delayed?",
];

export function answerAssistant(query: string, db: AssistantDB): string {
  const q = query.toLowerCase();

  // ---- specific request / work order status ----
  const codeMatch = query.toUpperCase().match(/(?:SR|WO)-(\d+)/);
  if (codeMatch && /status|where|delayed|why|about|update/.test(q)) {
    const digits = codeMatch[1];
    const r = db.requests.find((x) => x.code.toUpperCase().endsWith(digits));
    if (!r) return `I can't find ${codeMatch[0].toUpperCase()} in the current workspace.`;
    const m = db.machines.find((x) => x.id === r.machineId);
    const a = db.assignments.find((x) => x.requestId === r.id && x.active);
    const tech = a ? db.techs.find((t) => t.id === a.technicianId)?.name ?? "?" : "Unassigned";
    const ex = db.exceptions.filter((e) => e.requestId === r.id && !e.resolved);
    const ratio = slaElapsedRatio(r.createdAt, r.slaDeadline);
    let out = `${r.code}: ${r.status.replace(/_/g, " ")} · ${m?.name ?? r.machineId} · technician: ${tech} · SLA ${ratio >= 1 ? "BREACHED" : ratio >= 0.8 ? "AT RISK" : "on track"}.`;
    if (/delay|why/.test(q) && ex.length > 0) out += ` Blockers: ${ex.map((e) => e.message).join(" ")}`;
    return out;
  }

  // ---- available technicians near <site> ----
  if (/technician|who.*(available|near|closest|lowest eta|fastest)/.test(q)) {
    const site = db.sites.find((s) =>
      q.includes(s.name.toLowerCase()) || q.includes(s.code.toLowerCase()) ||
      q.includes("guindy") && s.id === "site-a" || q.includes("ambattur") && s.id === "site-b" ||
      q.includes("sriperumbudur") && s.id === "site-c" || q.includes("oragadam") && s.id === "site-d",
    );
    const online = db.techs.filter((t) => t.online);
    if (online.length === 0) return "No technicians are currently online.";
    if (!site) {
      const ranked = [...online].sort((a, b) => a.currentLoad - b.currentLoad).slice(0, 3);
      return `Online now (${online.length}): ${ranked.map((t) => `${t.name} (load ${Math.round(t.currentLoad * 100)}%)`).join(", ")}. Name a site for proximity ranking — distances shown are straight-line, road ETAs live on the map.`;
    }
    const ranked = online
      .map((t) => ({ t, km: haversineKm(t.lat, t.lng, site.lat, site.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 3);
    return `Nearest online technicians to ${site.name} (straight-line; check map markers for road ETA): ${ranked.map((x) => `${x.t.name} ~${x.km.toFixed(1)} km, load ${Math.round(x.t.currentLoad * 100)}%`).join("; ")}.`;
  }

  // ---- at-risk / breached ----
  if (/at.?risk|breach|sla/.test(q)) {
    const open = db.requests.filter((r) => r.status !== "CLOSED");
    const bad = open.filter((r) => slaElapsedRatio(r.createdAt, r.slaDeadline) >= 1);
    const risk = open.filter((r) => { const x = slaElapsedRatio(r.createdAt, r.slaDeadline); return x >= 0.8 && x < 1; });
    if (bad.length === 0 && risk.length === 0) return "No SLA pressure right now — every open request is on track.";
    const parts: string[] = [];
    if (bad.length > 0) parts.push(`Breached: ${bad.map((r) => r.code).join(", ")}`);
    if (risk.length > 0) parts.push(`At risk: ${risk.map((r) => r.code).join(", ")}`);
    return parts.join(" · ") + ".";
  }

  // ---- most failures ----
  if (/most failures|worst machine|failure/.test(q)) {
    const counts = db.machines.map((m) => ({ m, n: db.requests.filter((r) => r.machineId === m.id).length }));
    counts.sort((a, b) => b.n - a.n);
    const top = counts[0];
    if (!top || top.n === 0) return "No service history recorded yet.";
    return `${top.m.name} (${top.m.code}) leads with ${top.n} service request${top.n === 1 ? "" : "s"}.`;
  }

  // ---- unavailable resources ----
  if (/resource|unavailable|stock|part|tool/.test(q)) {
    const out: string[] = [];
    const empty = db.parts.filter((p) => p.qty - p.reservedQty <= 0);
    if (empty.length > 0) out.push(`Out of stock: ${[...new Set(empty.map((p) => p.sku))].slice(0, 5).join(", ")}`);
    const off = db.techs.filter((t) => !t.online);
    if (off.length > 0) out.push(`Offline technicians: ${off.map((t) => t.name).join(", ")}`);
    const down = db.machines.filter((m) => m.status === "DOWN");
    if (down.length > 0) out.push(`Machines down: ${down.map((m) => m.code).join(", ")}`);
    return out.length > 0 ? out.join(" · ") + "." : "All tracked resources show availability — no stock-outs, outages, or offline technicians.";
  }

  // ---- fallthrough: guidance, never a guess ----
  return "I can answer from live workspace data — try: available technicians near a site, requests at risk, most failures, status of SR-1042, or unavailable resources.";
}
