import { useState } from "react";
import { store, useDB } from "@/services/store";
import { can } from "@/lib/stateMachine";
import type { Role } from "@/types";

/**
 * Simulation Center — controlled demo layer (OPS/ADMIN). Every button runs
 * the REAL workflow engines (exceptions, SLA, IoT, lifecycle); nothing here
 * is fake animation. No polling, no background loops.
 */
export default function SimulationPage({ meId, role }: { meId: string; role: Role }) {
  const db = useDB();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!can(role, "demo:controls")) {
    return <div className="so-table-wrap" style={{ padding: 24, color: "#8b99b0", fontSize: 13 }}>Simulation Center is restricted to Operations and Admin roles.</div>;
  }

  const say = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} — ${s}`, ...l].slice(0, 12));
  const target = db.requests.find((r) => !["CLOSED", "CANCELLED", "REJECTED"].includes(r.status));

  const run = (label: string, fn: () => string) => {
    try { say(`✓ ${label}: ${fn()}`); }
    catch (e) { say(`✕ ${label}: ${(e as Error).message}`); }
  };

  const lifecycle = async () => {
    const r = db.requests.find((x) => x.status === "PENDING_APPROVAL") ?? db.requests.find((x) => x.status === "APPROVED");
    if (!r) { say("✕ Lifecycle demo: no PENDING_APPROVAL / APPROVED request available."); return; }
    setBusy(true);
    try {
      const step = async (label: string, fn: () => void) => {
        fn();
        say(`✓ ${r.code}: ${label}`);
        await new Promise((res) => setTimeout(res, 650));
      };
      if (r.status === "PENDING_APPROVAL") await step("approved", () => store.approve(r.id, meId));
      const ranked = store.rank(r.id);
      if (!ranked[0]) throw new Error("no ranked technicians");
      await step(`assigned → ${ranked[0].tech.name}`, () => store.assign(r.id, ranked[0].tech.id, meId));
      const cur = store.db.requests.find((x) => x.id === r.id)!;
      if (cur.status === "ASSIGNED") await step("work started", () => store.setStatus(r.id, "IN_PROGRESS", meId));
      await step("submitted for verification", () => store.setStatus(r.id, "PENDING_VERIFICATION", meId));
      await step("verified & closed", () => store.setStatus(r.id, "CLOSED", meId));
      say(`✓ ${r.code}: end-to-end lifecycle complete — see timeline + audit.`);
    } catch (e) {
      say(`✕ Lifecycle demo stopped: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const Btn = ({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) => (
    <button className="so-ghost-btn" style={danger ? { borderColor: "rgba(229,72,77,0.5)", color: "#ff9a9a" } : undefined} onClick={onClick} disabled={busy}>
      {label}
    </button>
  );

  return (
    <div>
      <div className="so-table-wrap" style={{ padding: 22, marginBottom: 12 }}>
        <div className="so-table-title" style={{ marginBottom: 4 }}>🎛 Simulation controls {target ? `→ target ${target.code}` : ""}</div>
        <div style={{ fontSize: 12.5, color: "#8b99b0", marginBottom: 12 }}>Each control executes the production workflow path — exceptions, audit, notifications and SLA all update for real.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn danger label="Simulate technician dropout" onClick={() => target && run("dropout", () => { store.dropoutTech(target.id, meId); return `${target.code} → exception raised, fallback ranked`; })} />
          <Btn label="Simulate part shortage" onClick={() => target && run("part shortage", () => { store.depletePart(target.id, meId); return `${target.code} → PART_UNAVAILABLE`; })} />
          <Btn label="Fast-forward SLA clock" onClick={() => target && run("SLA breach", () => { store.fastForwardSLA(target.id, meId); return `${target.code} → SLA_BREACH`; })} />
          <Btn label="Trigger IoT alert (P1)" onClick={() => run("IoT alert", () => store.iotAlert("M-104", meId).code)} />
          <Btn label="Run SLA check now" onClick={() => run("SLA sweep", () => { store.slaTick(meId); return "warn ≥80% · breach ≥100%"; })} />
          <Btn label="▶ Run full lifecycle scenario" onClick={lifecycle} />
        </div>
      </div>
      <div className="so-table-wrap" style={{ padding: 22 }}>
        <div className="so-table-title" style={{ marginBottom: 10 }}>Simulation log</div>
        {log.length === 0 && <div style={{ fontSize: 12.5, color: "#5d6b84" }}>No simulations run yet this session.</div>}
        {log.map((l, i) => <div key={i} className="so-mono" style={{ fontSize: 11.5, color: "#8b99b0", padding: "3px 0" }}>{l}</div>)}
      </div>
    </div>
  );
}
