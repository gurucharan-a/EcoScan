import { useState } from "react";
import { store, useDB } from "@/services/store";
import { readTelemetry } from "@/services/iot/telemetry";
import { machineLabel, siteLabel } from "./catalog";
import type { MapSelection } from "./MapPanel";

/**
 * IoT Monitoring — fleet telemetry grid (SIMULATED) with anomaly routing
 * into the existing emergency-request workflow. Read-only except the
 * user-initiated anomaly button, which calls the existing store.iotAlert().
 */
export default function IotPage({ meId, onSelect }: { meId: string; onSelect: (s: MapSelection) => void }) {
  const db = useDB();
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState("");

  const rows = db.machines.map((m) => ({ m, t: readTelemetry(m.id, m.status) }));
  const vis = rows.filter(({ t }) => filter === "all" || t.overall === filter);

  const anomaly = (code: string) => {
    try {
      const r = store.iotAlert(code, meId);
      setMsg(`✓ Anomaly routed — emergency request ${r.code} is in the dispatch queue.`);
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <div className="so-table-wrap" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="so-table-title" style={{ fontSize: 14 }}>Live telemetry · simulated demo feed</span>
          <span className="so-count">{vis.length}/{rows.length} machines</span>
          <select className="so-select" style={{ marginLeft: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All states</option>
            <option value="NORMAL">Normal</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
        {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith("✓") ? "#3dd68c" : "#ff7a7a" }}>{msg}</div>}
      </div>
      <div className="so-cards">
        {vis.map(({ m, t }) => {
          const tone = t.overall === "CRITICAL" ? "red" : t.overall === "WARNING" ? "amber" : "green";
          const site = db.sites.find((s) => s.id === m.siteId);
          return (
            <div key={m.id} className="so-info-card">
              <div className="so-info-id">{m.code} · <span style={{ color: tone === "green" ? "#3dd68c" : tone === "amber" ? "#f0ad4e" : "#ff7a7a" }}>{t.overall}</span></div>
              <div className="so-info-name" style={{ fontSize: 16 }}>{machineLabel(m)}</div>
              <div className="so-kv">site: <b>{site ? siteLabel(site) : m.siteId}</b> · status: <b>{m.status}</b></div>
              {t.metrics.map((mt) => (
                <div key={mt.key} className="so-kv">
                  {mt.label}: <b style={{ color: mt.state === "NORMAL" ? "#c3cede" : mt.state === "WARNING" ? "#f0ad4e" : "#ff7a7a" }}>{mt.value}{mt.unit}</b>
                  {mt.state !== "NORMAL" && <span> ⚠</span>}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="so-ghost-btn" style={{ padding: "7px 12px" }} onClick={() => onSelect({ kind: "equipment", id: m.id })}>Open equipment</button>
                <button className="so-ghost-btn" style={{ padding: "7px 12px" }} onClick={() => anomaly(m.code)}>⚠ Raise anomaly</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="so-foot"><span>Simulated feed — threshold breaches route through the standard approval → dispatch lifecycle</span></div>
    </div>
  );
}
