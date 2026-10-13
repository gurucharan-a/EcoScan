import { useState } from "react";
import { DEFAULT_SLA_HOURS, store, useDB } from "@/services/store";
import { RBAC } from "@/lib/stateMachine";
import { aiProviderId, AI_ENABLED, AI_API_URL } from "@/services/ai/aiService";

/**
 * Governance configuration — ADMIN only (gated by caller).
 * Edits persisted SLA targets; everything else is read-only platform state.
 */
export default function AdminSettings({ actorId }: { actorId: string }) {
  const db = useDB();
  const current = { ...DEFAULT_SLA_HOURS, ...(db.slaHours ?? {}) };
  const [hours, setHours] = useState<Record<string, string>>({
    P1: String(current.P1), P2: String(current.P2), P3: String(current.P3), P4: String(current.P4),
  });
  const [msg, setMsg] = useState("");

  const save = () => {
    setMsg("");
    try {
      store.updateSlaHours(
        { P1: Number(hours.P1), P2: Number(hours.P2), P3: Number(hours.P3), P4: Number(hours.P4) },
        actorId,
      );
      setMsg("✓ SLA rules saved — new requests use these targets.");
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
  };

  const roles = ["CUSTOMER", "TECHNICIAN", "OPS_MANAGER", "ADMIN"];
  const actions = Object.keys(RBAC);

  return (
    <div>
      <div className="so-table-wrap" style={{ padding: 22, marginBottom: 12 }}>
        <div className="so-table-title" style={{ marginBottom: 4 }}>SLA rules · resolution targets (hours)</div>
        <div style={{ fontSize: 12.5, color: "#8b99b0", marginBottom: 12 }}>Applies to requests created after saving. Existing deadlines are never rewritten.</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(["P1", "P2", "P3", "P4"] as const).map((p) => (
            <div key={p} style={{ minWidth: 130 }}>
              <label className="so-label">{p} target</label>
              <input
                className="so-input" type="number" min={1} max={720} value={hours[p]}
                onChange={(e) => setHours({ ...hours, [p]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
          <button className="so-ghost-btn solid" onClick={save}>Save SLA rules</button>
          {msg && <span style={{ fontSize: 12.5, color: msg.startsWith("✓") ? "#3dd68c" : "#ff7a7a" }}>{msg}</span>}
        </div>
      </div>

      <div className="so-table-wrap" style={{ marginBottom: 12 }}>
        <div className="so-table-bar"><span className="so-table-title">Roles & permissions matrix</span><span className="so-count">read-only</span></div>
        <div style={{ overflowX: "auto" }}>
          <table className="so-table">
            <thead><tr><th>Permission</th>{roles.map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a}>
                  <td className="so-cell so-mono">{a}</td>
                  {roles.map((r) => (
                    <td key={r} style={{ textAlign: "center", color: RBAC[a].includes(r) ? "#3dd68c" : "#3d4a63" }}>
                      {RBAC[a].includes(r) ? "✓" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="so-table-wrap" style={{ padding: 22, marginBottom: 12 }}>
        <div className="so-table-title" style={{ marginBottom: 10 }}>Platform integrations</div>
        <div style={{ fontSize: 12.5, color: "#a9b7cf", lineHeight: 2 }}>
          <div>AI provider: <b className="so-mono">{aiProviderId()}</b> · {AI_ENABLED ? "enabled" : "disabled"} {AI_API_URL ? `· ${AI_API_URL}` : "· no endpoint configured (mock active)"}</div>
          <div>Maps: <b>Leaflet + OpenStreetMap</b> · Routing: <b>OSRM (no key)</b></div>
          <div>Audit ledger: <b>hash-chained</b> · {db.audit.length} sealed events · verify in Audit History</div>
          <div>Users: <b>{db.users.length}</b> · Sites: <b>{db.sites.length}</b> · Machines: <b>{db.machines.length}</b></div>
        </div>
      </div>

      <div className="so-table-wrap" style={{ padding: 22 }}>
        <div className="so-table-title" style={{ marginBottom: 10 }}>Effective workflow rules · read-only</div>
        <div style={{ fontSize: 12.5, color: "#a9b7cf", lineHeight: 2 }}>
          <div>Auto-approval: <b>P1 requests with passing validation</b> skip the queue</div>
          <div>SLA watch: <b>warn at 80% elapsed</b> · breach at <b>100%</b> (background sweep)</div>
          <div>Escalation: <b>+1 priority level</b>, deadline unchanged, audited</div>
          <div>Reservations: <b>atomic check-then-reserve</b> (no oversell) · consumed on close, released on cancel</div>
          <div>Geofence: <b>3.2 km</b> site radius · Routing: <b>OSRM road ETA</b></div>
          <div>Concurrency: <b>optimistic revision guard</b> on status and assignment writes</div>
        </div>
      </div>
    </div>
  );
}
