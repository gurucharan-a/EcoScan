import { useState } from "react";
import { useEco, confirmScan, updateScan, submitSortJob, deleteScan } from "@/ecoscan/services/ecoStore";
import { CATEGORIES, DEST_LABEL, SORT_FLOW, categoryLabel, type DeviceCategory } from "@/ecoscan/types";
import { getProfile } from "@/ecoscan/data/materialProfiles";
import { estimateComponents, fmtG } from "@/ecoscan/lib/ecoUtils";
import { Card, CardTitle, Btn, Badge, Field, inputCls, selectCls, recColor } from "@/ecoscan/components/ui";

export default function ScanDetail({ id, back }: { id: string; back: () => void }) {
  const db = useEco();
  const s = db.scans.find((x) => x.id === id);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [cat, setCat] = useState("");
  const [repair, setRepair] = useState("");
  const [dest, setDest] = useState("");
  if (!s) return <div className="p-4"><button className="underline" onClick={back}>← Back</button><p className="mt-2">Scan not found (it may have been deleted).</p></div>;

  const profile = getProfile(s.confirmedCategory ?? s.category);
  const comps = estimateComponents(s.confirmedCategory ?? s.category, s.weightG, profile);
  const job = db.jobs.find((j) => j.id === s.sortJobId);

  const act = (fn: () => void, msg?: string) => {
    try { fn(); setErr(null); if (msg) setOk(msg); } catch (e) { setErr((e as Error).message); setOk(null); }
  };

  return (
    <div className="space-y-4">
      <button className="text-[13px] font-semibold text-emerald-900 underline" onClick={back}>← All scans</button>
      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-800">{err}</div>}
      {ok && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] text-emerald-900">{ok}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl font-extrabold">{s.code} · {s.name}</h1>
        <Badge color="stone">{s.status}</Badge>
        {s.recommendation && <Badge color={recColor(s.recommendation.kind)}>{s.recommendation.kind}</Badge>}
        <span className="ml-auto text-[12px] text-stone-400">{new Date(s.createdAt).toLocaleString()} · updated {new Date(s.updatedAt).toLocaleString()}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle sub="Original capture — external view only">Image & identification</CardTitle>
          {s.imageDataUrl ? <img src={s.imageDataUrl} alt={s.name} className="max-h-72 w-full rounded-lg border object-contain bg-stone-50" /> : <p className="text-[13px] text-stone-400">No image stored (seeded demo record).</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            <div><span className="text-stone-500">Predicted:</span> <b>{categoryLabel(s.predictedCategory)}</b> ({(s.confidence * 100).toFixed(1)}%)</div>
            <div><span className="text-stone-500">Confirmed:</span> <b>{s.confirmed ? categoryLabel(s.confirmedCategory ?? s.category) : "not yet"}</b></div>
            <div><span className="text-stone-500">Weight:</span> <b>{fmtG(s.weightG)}</b> {s.weightSimulated ? "(simulated)" : "(measured)"}</div>
            <div><span className="text-stone-500">Model:</span> <span className="font-mono text-[12px]">{s.modelVersion} (simulated)</span></div>
            <div><span className="text-stone-500">Brand/model:</span> {[s.brand, s.model].filter(Boolean).join(" ") || "—"}</div>
            <div><span className="text-stone-500">Condition:</span> {s.operatingCondition} · damage: {s.visibleDamage || "none noted"}</div>
          </div>
          <p className="mt-2 text-[12px] text-amber-800">Photo shows the exterior only — internal components are database estimates, not detections.</p>
        </Card>

        <Card>
          <CardTitle sub="Transparent rule output — evidence, uncertainty, version">Recommendation</CardTitle>
          {s.recommendation ? (
            <>
              <p className="text-[14px] font-semibold">{s.recommendation.explanation}</p>
              <p className="mt-1 text-[13px]">Destination: <b>{DEST_LABEL[s.recommendation.destination]}</b></p>
              <ul className="mt-2 list-disc pl-5 text-[13px] text-stone-600">{s.recommendation.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
              {s.recommendation.uncertainty.map((u, i) => <p key={i} className="mt-1 text-[12px] text-amber-800">⚠ {u}</p>)}
              <p className="mt-2 font-mono text-[11px] text-stone-400">rule {s.recommendation.ruleVersion}</p>
            </>
          ) : <p className="text-[13px] text-stone-500">No recommendation yet.</p>}
          <div className="mt-3">
            <p className="mb-1 text-[12px] font-semibold text-stone-600">Lifecycle</p>
            <p className="font-mono text-[11.5px] text-stone-500">{Object.keys(SORT_FLOW).join(" → ")}</p>
          </div>
          {(s.status === "AWAITING_CONFIRMATION" || s.status === "NEEDS_MANUAL_REVIEW") && (
            <div className="mt-3 flex flex-wrap gap-2">
              <select className={selectCls} style={{ width: 230 }} value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">Confirm as predicted…</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <Btn onClick={() => act(() => confirmScan(s.id, (cat as DeviceCategory) || null), "Scan confirmed — ready to sort.")}>Confirm</Btn>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle sub={`${profile.version} · typical ${profile.typicalWeightG[0]}–${profile.typicalWeightG[1]} g · ${profile.limitations}`}>Typical composition (estimates, category-level)</CardTitle>
        {comps.length === 0 ? <p className="text-[13px] text-stone-500">Unknown category — no profile until confirmed.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b text-left text-stone-500">
                {["Component", "Material", "Est. mass", "Confidence", "Destination"].map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {comps.map((c) => (
                  <tr key={c.component} className="border-b border-stone-100">
                    <td className="py-1.5 pr-3 font-medium">{c.component}</td>
                    <td className="py-1.5 pr-3 text-stone-600">{c.material}</td>
                    <td className="py-1.5 pr-3">{c.estimatedMassG != null ? `${c.estimatedMassG} g (${((c.massFraction ?? 0) * 100).toFixed(1)}%)` : <span className="text-stone-400">qualitative — not weighed</span>}</td>
                    <td className="py-1.5 pr-3"><Badge color={c.confidence === "high" ? "green" : c.confidence === "qualitative" ? "amber" : "stone"}>{c.confidence}</Badge></td>
                    <td className="py-1.5 pr-3 text-stone-600">{c.destination}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[12px] text-stone-500">Sources: {[...new Set(profile.components.map((c) => c.source))].join("; ") || "—"}. Data sources for this scan: {s.dataSources.join(", ")}.</p>
      </Card>

      <Card>
        <CardTitle sub="Verified movement only — deposit is NOT sensed">Sorting</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectCls} style={{ width: 240 }} value={dest || s.sortDestination || ""} onChange={(e) => setDest(e.target.value)}>
            <option value="">Destination…</option>
            {Object.entries(DEST_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <Btn onClick={() => act(() => { const j = submitSortJob(s.id, (dest as any) || undefined); setOk(`Job ${j.id.slice(-6)} submitted (${j.mode}). Awaiting acknowledgement.`); })}>Authorize sorting</Btn>
          {job && <span className="text-[12.5px] text-stone-500">Job {job.id.slice(-6)} · {job.status} · {job.mode} · {job.servoAngle}° · attempts {job.attempts}{job.lastError ? ` · ${job.lastError}` : ""}</span>}
        </div>
        {(s.status === "READY_TO_SORT" || s.status === "NEEDS_MANUAL_REVIEW") && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Repair cost (₹, optional)"><input className={inputCls} value={repair} onChange={(e) => setRepair(e.target.value)} placeholder="e.g. 800" /></Field>
            <div className="flex items-end"><Btn kind="ghost" onClick={() => act(() => updateScan(s.id, { visibleDamage: s.visibleDamage }), "Saved.")}>Save notes</Btn></div>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Btn kind="ghost" onClick={() => window.print()}>Print report</Btn>
          <Btn kind="danger" onClick={() => { if (confirm(`Delete ${s.code}? This is audited and cannot be undone.`)) act(() => { deleteScan(s.id); back(); }); }}>Delete (audited)</Btn>
        </div>
      </Card>
    </div>
  );
}
