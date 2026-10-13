import { useMemo, useState } from "react";
import { store, useDB } from "@/services/store";
import { fetchOsrmRoute } from "@/lib/osrm";
import { machineLabel, siteLabel } from "./catalog";

interface Row {
  techId: string; name: string; skillPct: number; score: number;
  etaMin: number | null; distKm: number | null;
  partsOk: boolean; partsNote: string;
  clash: string | null; slaFit: "FIT" | "TIGHT" | "MISS";
  valid: boolean; reasons: string[];
}

/**
 * Dispatch Optimizer — BEST VALID ASSIGNMENT, not nearest tech.
 * Combines the existing ranking, road ETA, parts availability, active
 * conflicts and SLA fit. Assigns only through the existing store.assign().
 */
export default function OptimizerPage({ meId, onOpenRequest }: { meId: string; onOpenRequest: (id: string) => void }) {
  const db = useDB();
  const eligible = db.requests.filter((r) => ["APPROVED", "EXCEPTION"].includes(r.status));
  const [reqId, setReqId] = useState(eligible[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [ranFor, setRanFor] = useState("");
  const cur = eligible.find((r) => r.id === reqId) ?? eligible[0];

  const evaluate = async () => {
    const r = db.requests.find((x) => x.id === (reqId || eligible[0]?.id));
    if (!r) return;
    setLoading(true);
    try {
      const site = db.sites.find((s) => s.id === r.siteId);
      let ranked: ReturnType<typeof store.rank> = [];
      try { ranked = store.rank(r.id); } catch { ranked = []; }
      const deadline = new Date(r.slaDeadline).getTime();
      const out: Row[] = await Promise.all(ranked.slice(0, 6).map(async ({ tech, breakdown }) => {
        let etaMin: number | null = null;
        let distKm: number | null = null;
        if (site) {
          try {
            const route = await fetchOsrmRoute(tech.lng, tech.lat, site.lng, site.lat);
            if (route) { etaMin = Math.max(1, Math.round(route.durationMin)); distKm = Math.round(route.distanceKm * 10) / 10; }
          } catch { /* road ETA unavailable — row still evaluates */ }
        }
        const shorts: string[] = [];
        for (const rp of r.requiredParts) {
          const free = db.parts.filter((p) => p.sku === rp.sku).reduce((s, p) => s + (p.qty - p.reservedQty), 0);
          if (free < rp.qty) shorts.push(`${rp.sku} needs ${rp.qty}, free ${free}`);
        }
        const clashReq = db.assignments
          .filter((a) => a.active && a.technicianId === tech.id && a.requestId !== r.id)
          .map((a) => db.requests.find((x) => x.id === a.requestId))
          .find((x) => x && ["ASSIGNED", "IN_PROGRESS"].includes(x.status));
        const arrival = etaMin != null ? Date.now() + etaMin * 60000 : null;
        const slaFit: Row["slaFit"] = arrival == null ? "TIGHT" : arrival > deadline ? "MISS" : arrival > deadline - 1800000 ? "TIGHT" : "FIT";
        const skillPct = Math.round(breakdown.skillMatch * 100);
        const reasons: string[] = [
          `Skill ${skillPct}%`, etaMin != null ? `ETA ${etaMin} min` : "ETA unavailable",
          shorts.length ? `Parts BLOCKED (${shorts[0]})` : "Parts OK",
          clashReq ? `Busy on ${clashReq.code}` : "No active clash",
          `SLA ${slaFit}`,
        ];
        return {
          techId: tech.id, name: tech.name, skillPct, score: breakdown.total,
          etaMin, distKm, partsOk: shorts.length === 0,
          partsNote: shorts.join("; ") || "all required parts free",
          clash: clashReq ? clashReq.code : null, slaFit,
          valid: shorts.length === 0 && skillPct >= 50,
          reasons,
        };
      }));
      out.sort((a, b) => Number(b.valid) - Number(a.valid) || b.score - a.score);
      setRows(out);
      setRanFor(r.id);
    } finally {
      setLoading(false);
    }
  };

  const best = useMemo(() => rows.find((x) => x.valid) ?? null, [rows]);
  const stale = ranFor !== "" && ranFor !== cur?.id;

  return (
    <div>
      <div className="so-table-wrap" style={{ padding: 18, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="so-table-title" style={{ fontSize: 14 }}>Dispatch optimizer · best valid assignment</span>
          <select className="so-select" value={cur?.id ?? ""} onChange={(e) => { setReqId(e.target.value); setRows([]); setRanFor(""); }}>
            {eligible.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title.slice(0, 40)}</option>)}
          </select>
          {cur && <button className="so-link" onClick={() => onOpenRequest(cur.id)}>Open {cur.code} →</button>}
          <button className="so-ghost-btn solid" style={{ marginLeft: "auto" }} onClick={evaluate} disabled={loading || !cur}>
            {loading ? "Evaluating…" : "⚙ Evaluate candidates"}
          </button>
        </div>
        {cur && (
          <div style={{ fontSize: 12, color: "#8b99b0", marginTop: 8 }}>
            {machineLabel(db.machines.find((x) => x.id === cur.machineId))} · {siteLabel(db.sites.find((s) => s.id === cur.siteId))} · {cur.priority} · SLA {new Date(cur.slaDeadline).toLocaleString()}
          </div>
        )}
      </div>

      {best && !stale && (
        <div className="so-panel" style={{ marginBottom: 12, borderColor: "rgba(34,192,122,0.4)" }}>
          <div className="so-panel-head"><span className="so-panel-title">✓ Best valid plan</span></div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{best.name} <span style={{ fontSize: 12, color: "#8b99b0", fontWeight: 500 }}>score {best.score}</span></div>
          <div style={{ fontSize: 12.5, color: "#a9b7cf", marginTop: 4 }}>{best.reasons.join(" · ")}</div>
          <button className="so-ghost-btn solid" style={{ marginTop: 10 }} onClick={() => { if (cur) { try { store.assign(cur.id, best.techId, meId); } catch (e) { alert((e as Error).message); } } }}>
            Assign {best.name} via standard workflow
          </button>
        </div>
      )}

      <div className="so-table-wrap">
        <div className="so-table-bar"><span className="so-table-title" style={{ fontSize: 14 }}>Candidate evaluation</span><span className="so-count">{rows.length}</span></div>
        {rows.length === 0 && !loading && <div style={{ padding: 22, fontSize: 12.5, color: "#5d6b84" }}>Run an evaluation to score every candidate against skills, road ETA, parts, conflicts and SLA fit.</div>}
        {!stale && rows.map((w) => (
          <div key={w.techId} className="so-exrow" style={{ padding: "14px 20px" }}>
            <div className="so-exbody">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ color: "#fff" }}>{w.name}</b>
                <span className={`so-pill ${w.valid ? "green" : "red"}`}>{w.valid ? "VALID" : "BLOCKED"}</span>
                <span className={`so-pill ${w.slaFit === "FIT" ? "teal" : w.slaFit === "TIGHT" ? "amber" : "red"}`}>SLA {w.slaFit}</span>
              </div>
              <div className="so-ex-desc">{w.reasons.join(" · ")}</div>
            </div>
            <div className="so-ex-actions">
              {cur && w.valid && <button className="so-ghost-btn" onClick={() => { try { store.assign(cur.id, w.techId, meId); } catch (e) { alert((e as Error).message); } }}>Assign</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
