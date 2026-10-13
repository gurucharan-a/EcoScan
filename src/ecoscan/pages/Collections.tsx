import { useState } from "react";
import { useEco, updateBin } from "@/ecoscan/services/ecoStore";
import { fmtG } from "@/ecoscan/lib/ecoUtils";
import { Card, CardTitle, Btn, Badge, Field, inputCls, selectCls } from "@/ecoscan/components/ui";

export default function Collections() {
  const db = useEco();
  const [recipient, setRecipient] = useState("");
  const [batch, setBatch] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">LOGISTICS</p>
        <h1 className="font-display text-2xl font-extrabold">Collection & Inventory</h1>
        <p className="text-[13px] text-stone-500">Fill levels are <b>estimates from recorded items</b> unless bin sensors exist. A recycler is shown as processed only with a handover record.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {db.bins.map((b) => (
          <Card key={b.id}>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-[15px] font-bold">{b.name}</h3>
              <span className="ml-auto"><Badge color={b.status === "COLLECTING" ? "green" : b.status === "NEAR_CAPACITY" || b.status === "READY_FOR_PICKUP" ? "amber" : "teal"}>{b.status}</Badge></span>
            </div>
            <p className="text-[12px] text-stone-500">{b.material} · {b.location} · {b.capacityL} L</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.round(b.fillEstimated * 100)}%` }} />
            </div>
            <p className="mt-1 text-[12.5px] text-stone-600">~{Math.round(b.fillEstimated * 100)}% full (est.) · {b.itemCount} items · {fmtG(b.totalWeightG)}</p>
            {b.batchId && <p className="font-mono text-[11.5px] text-stone-500">batch {b.batchId}{b.recipient ? ` → ${b.recipient}` : ""}{b.handoverAt ? ` · ${b.handoverAt.slice(0, 10)}` : ""}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {b.status === "NEAR_CAPACITY" && <Btn kind="ghost" onClick={() => updateBin(b.id, { status: "READY_FOR_PICKUP" })}>Mark ready for pickup</Btn>}
              {b.status === "READY_FOR_PICKUP" && (
                <span className="flex flex-1 gap-1.5">
                  <input className={inputCls} placeholder="Recycler / recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                  <Btn onClick={() => updateBin(b.id, { status: "HANDED_OVER", batchId: batch || `B-${Date.now().toString(36).toUpperCase()}`, recipient: recipient || "Authorized recycler", handoverAt: new Date().toISOString() })}>Hand over</Btn>
                </span>
              )}
              {b.status === "HANDED_OVER" && <Btn kind="ghost" onClick={() => updateBin(b.id, { status: "PROCESSED" })}>Mark processed (receipt verified)</Btn>}
              {b.status === "PROCESSED" && <Btn kind="ghost" onClick={() => updateBin(b.id, { status: "COLLECTING", itemCount: 0, totalWeightG: 0, fillEstimated: 0, batchId: null, recipient: undefined, handoverAt: null })}>Start new batch</Btn>}
            </div>
          </Card>
        ))}
        <Card>
          <CardTitle sub="Links scans to logistics">New collection batch</CardTitle>
          <Field label="Batch ID (leave blank to auto-generate)"><input className={inputCls} value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="B-2026-001" /></Field>
          <div className="mt-2">
            <Field label="Default status for full bins">
              <select className={selectCls} defaultValue="READY_FOR_PICKUP"><option>READY_FOR_PICKUP</option><option>COLLECTING</option></select>
            </Field>
          </div>
          <p className="mt-2 text-[12px] text-stone-500">Batches group items for a pickup; handover records make diversion verified in Sustainability.</p>
        </Card>
      </div>
    </div>
  );
}
