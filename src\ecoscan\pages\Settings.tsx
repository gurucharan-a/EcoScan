import { useState } from "react";
import { useEco, updateSettings, resetDemo, seedDemo } from "@/ecoscan/services/ecoStore";
import { download } from "@/ecoscan/lib/ecoUtils";
import { DEST_LABEL, type RecommendationKind } from "@/ecoscan/types";
import { Card, CardTitle, Btn, Field, inputCls, selectCls } from "@/ecoscan/components/ui";
import DbSettings from "@/ecoscan/components/DbSettings";

export default function Settings() {
  const db = useEco();
  const s = db.settings;
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [th, setTh] = useState(String(s.confidenceThreshold));
  const [co2, setCo2] = useState(String(s.co2PerKg));
  const [val, setVal] = useState(String(s.materialValuePerKg));

  const save = (fn: () => void) => { try { fn(); setErr(null); setOk("Saved."); } catch (e) { setErr((e as Error).message); setOk(null); } };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">ADMINISTRATION</p>
        <h1 className="font-display text-2xl font-extrabold">Settings & Configuration</h1>
      </div>
      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-800">{err}</div>}
      {ok && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] text-emerald-900">{ok}</div>}

      <div className="grid gap-3 lg:grid-cols-2">
        <DbSettings />
        <Card>
          <CardTitle sub="Below threshold → Unknown / manual review">Confidence & sorting</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Confidence threshold (0.10–0.95)" hint="Default 0.60"><input className={inputCls} value={th} onChange={(e) => setTh(e.target.value)} /></Field>
            <Field label="Auto-sort">
              <select className={selectCls} value={String(s.autoSortAllowed)} onChange={(e) => save(() => updateSettings({ autoSortAllowed: e.target.value === "true" }))}>
                <option value="false">Off (require authorization)</option><option value="true">On (still ack-gated)</option>
              </select>
            </Field>
          </div>
          <div className="mt-2"><Btn onClick={() => save(() => updateSettings({ confidenceThreshold: Number(th) }))}>Save threshold</Btn></div>
          <div className="mt-4 space-y-2">
            <p className="text-[12px] font-semibold text-stone-600">Destination mapping</p>
            {(Object.keys(DEST_LABEL) as never[]).length >= 0 && (["REUSE", "REPAIR", "RECYCLE", "HAZARDOUS", "MANUAL_REVIEW"] as RecommendationKind[]).map((k) => (
              <div key={k} className="flex items-center gap-2 text-[13px]">
                <span className="w-36 font-semibold">{k}</span>
                <select className={selectCls} value={s.destMap[k]} onChange={(e) => save(() => updateSettings({ destMap: { ...s.destMap, [k]: e.target.value } }))}>
                  {Object.entries(DEST_LABEL).map(([d, l]) => <option key={d} value={d}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle sub="Cited, configurable — never hardcoded secretly">Environmental factors</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="kgCO₂e avoided per kg diverted" hint="Literature range ~1–3"><input className={inputCls} value={co2} onChange={(e) => setCo2(e.target.value)} /></Field>
            <Field label="Recovered value ₹/kg" hint="Planning average"><input className={inputCls} value={val} onChange={(e) => setVal(e.target.value)} /></Field>
          </div>
          <div className="mt-2 flex gap-2">
            <Btn onClick={() => save(() => updateSettings({ co2PerKg: Number(co2), materialValuePerKg: Number(val) }))}>Save factors</Btn>
          </div>
          <p className="mt-2 text-[12px] text-stone-500">Source note: {s.co2Source}</p>
        </Card>
        <Card>
          <CardTitle sub="Health of this installation">Application health & data</CardTitle>
          <ul className="space-y-1 text-[13px] text-stone-600">
            <li>Scans: <b>{db.scans.length}</b> · Jobs: <b>{db.jobs.length}</b> · Alerts: <b>{db.alerts.length}</b> · Audit events: <b>{db.audit.length}</b></li>
            <li>Profiles: <b>{db.profiles.length}</b> · Bins: <b>{db.bins.length}</b> · Mode: <b>{s.mode}</b></li>
            <li>API base: <b>{s.apiUrl || "(local store — FastAPI optional)"}</b></li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn kind="ghost" onClick={() => download(`ecoscan-backup-${Date.now()}.json`, JSON.stringify(db, null, 2), "application/json")}>Export backup (JSON)</Btn>
            <Btn kind="ghost" onClick={() => seedDemo()}>Load demo data</Btn>
            <Btn kind="danger" onClick={() => { if (confirm("Reset ALL EcoScan data? This clears scans, jobs, bins, and alerts.")) resetDemo(); }}>Reset demo</Btn>
          </div>
        </Card>
        <Card>
          <CardTitle sub="Append-only record of consequential changes">Audit trail (latest 12)</CardTitle>
          {db.audit.length === 0 ? <p className="text-[13px] text-stone-400">Actions will appear here.</p> : (
            <ul className="max-h-56 space-y-1 overflow-y-auto font-mono text-[11.5px] text-stone-600">
              {db.audit.slice(0, 12).map((a) => <li key={a.id}>{a.at.slice(0, 19).replace("T", " ")} · {a.actor} · {a.action} · {a.entity}/{a.entityId.slice(-6)}</li>)}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-stone-500">Implemented / simulated / proposed capability list, API docs, and firmware guide live in README.md and docs/.</p>
        </Card>
      </div>
    </div>
  );
}
