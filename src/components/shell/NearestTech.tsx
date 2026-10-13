import { useCallback, useEffect, useRef, useState } from "react";
import { store, useDB } from "@/services/store";
import { fetchOsrmRoute } from "@/lib/osrm";

interface EtaRow {
  techId: string;
  name: string;
  distKm: number;
  durMin: number;
  etaMs: number;
  skillPct: number;
}

function fmtEta(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Nearest-available-technician + road ETA panel.
 * ADDITIVE ONLY: reads existing tech/request/site data, ranks by OSRM road
 * travel time, compares against the existing SLA deadline, and assigns via
 * the existing store.assign() — no other system is touched.
 */
export default function NearestTechEta({ requestId, meId }: { requestId: string; meId: string }) {
  const db = useDB();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EtaRow[]>([]);
  const [failed, setFailed] = useState(0);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const r = db.requests.find((x) => x.id === requestId);
  const site = r ? db.sites.find((s) => s.id === r.siteId) : undefined;
  const available = db.techs.filter((t) => t.online);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setFailed(0);
    try {
      const req = db.requests.find((x) => x.id === requestId);
      const st = req ? db.sites.find((s) => s.id === req.siteId) : undefined;
      if (!req || !st) { setRows([]); return; }
      const cands = db.techs.filter((t) => t.online);
      const settled = await Promise.allSettled(cands.map(async (t) => {
        const route = await fetchOsrmRoute(t.lng, t.lat, st.lng, st.lat, ctrl.signal);
        if (!route) throw new Error("no route");
        const overlap = req.requiredSkills.length
          ? req.requiredSkills.filter((s) => t.skills.includes(s)).length / req.requiredSkills.length
          : 1;
        return {
          techId: t.id, name: t.name,
          distKm: route.distanceKm, durMin: route.durationMin,
          etaMs: Date.now() + route.durationMin * 60000,
          skillPct: Math.round(overlap * 100),
        } as EtaRow;
      }));
      const ok: EtaRow[] = [];
      let bad = 0;
      settled.forEach((s) => { if (s.status === "fulfilled") ok.push(s.value); else bad += 1; });
      ok.sort((a, b) => a.durMin - b.durMin || b.skillPct - a.skillPct);
      if (!ctrl.signal.aborted) { setRows(ok); setFailed(bad); }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, tick]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  if (!r || !site) return <div style={{ marginTop: 12, fontSize: 12.5, color: "#8b99b0" }}>Service location unavailable</div>;
  if (available.length === 0) return <div style={{ marginTop: 12, fontSize: 12.5, color: "#8b99b0" }}>No available technicians nearby.</div>;

  const deadline = new Date(r.slaDeadline).getTime();
  const slaState = (etaMs: number) =>
    etaMs > deadline
      ? { t: "SLA Breached", tone: "red" }
      : etaMs > deadline - 30 * 60000
        ? { t: "SLA At Risk", tone: "amber" }
        : { t: "Within SLA", tone: "green" };

  const assign = (techId: string) => {
    try { store.assign(r.id, techId, meId); } catch (e) { alert((e as Error).message); }
  };

  const [best, ...rest] = rows;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8b99b0", fontWeight: 700 }}>
          Nearest available technician · road routing
        </span>
        <button className="so-ghost-btn" style={{ marginLeft: "auto", padding: "6px 12px" }} onClick={() => setTick((t) => t + 1)} disabled={loading}>
          {loading ? "Calculating…" : "Refresh ETA"}
        </button>
      </div>

      {loading && rows.length === 0 && (
        <div style={{ fontSize: 12.5, color: "#8b99b0" }}>Calculating road routes via OSRM…</div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ fontSize: 12.5, color: "#8b99b0" }}>
          Route unavailable{failed > 0 ? ` (${failed} technician${failed === 1 ? "" : "s"} could not be routed)` : ""}.{" "}
          <button className="so-link" onClick={() => setTick((t) => t + 1)}>Retry</button>
        </div>
      )}

      {best && (() => {
        const s = slaState(best.etaMs);
        return (
          <div style={{ border: "1px solid #1d2940", borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5d6b84", fontWeight: 700, marginBottom: 6 }}>
              Recommended technician
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{best.name}</div>
            <div style={{ fontSize: 12.5, color: "#a9b7cf", marginTop: 4 }}>
              {best.distKm.toFixed(1)} km away · {Math.round(best.durMin)} min estimated travel · skill {best.skillPct}%
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "#c3cede" }}>ETA: <b>{fmtEta(best.etaMs)}</b></span>
              <span className={`so-pill ${s.tone}`}>{s.t}</span>
              <button className="so-ghost-btn solid" style={{ marginLeft: "auto" }} onClick={() => assign(best.techId)}>
                Assign Technician
              </button>
            </div>
          </div>
        );
      })()}

      {rest.map((w) => {
        const s = slaState(w.etaMs);
        return (
          <div key={w.techId} style={{ fontSize: 12.5, border: "1px solid #1d2940", borderRadius: 8, padding: 10, marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b>{w.name}</b>
            <span style={{ color: "#8b99b0" }}>{w.distKm.toFixed(1)} km · {Math.round(w.durMin)} min · ETA {fmtEta(w.etaMs)} · skill {w.skillPct}%</span>
            <span className={`so-pill ${s.tone}`}>{s.t}</span>
            <button className="so-ghost-btn" style={{ marginLeft: "auto", padding: "6px 12px" }} onClick={() => assign(w.techId)}>Assign</button>
          </div>
        );
      })}

      {failed > 0 && rows.length > 0 && (
        <div style={{ fontSize: 12, color: "#8b99b0" }}>Route unavailable for {failed} technician{failed === 1 ? "" : "s"}.</div>
      )}
    </div>
  );
}
