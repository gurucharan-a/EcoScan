import { useState } from "react";
import { GUIDES, FAQS } from "@/ecoscan/data/knowledge";
import { Card, Btn, Empty, inputCls } from "@/ecoscan/components/ui";

export default function Knowledge() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>("batteries");
  const t = q.toLowerCase();
  const guides = GUIDES.filter((g) => (g.title + g.body).toLowerCase().includes(t));
  const faqs = FAQS.filter((f) => (f.q + f.a).toLowerCase().includes(t));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">LEARN</p>
        <h1 className="font-display text-2xl font-extrabold">Knowledge & Safe Disposal Center</h1>
        <p className="text-[13px] text-stone-500">No fabricated recyclers or regulations — location data appears only when your operator configures verified points.</p>
      </div>
      <input className={inputCls} placeholder="Search disposal guidance, battery safety, repair…" value={q} onChange={(e) => setQ(e.target.value)} />
      {guides.length === 0 && faqs.length === 0 && <Empty title="No matching guidance" body="Try 'battery', 'repair', or 'recycle'." />}
      <div className="grid gap-3 lg:grid-cols-2">
        {guides.map((g) => (
          <Card key={g.id}>
            <button className="w-full text-left" onClick={() => setOpen(open === g.id ? null : g.id)}>
              <h3 className="font-display text-[15px] font-bold">{g.title}</h3>
              <p className="text-[11.5px] text-stone-400">Source: {g.source} · updated {g.updated}</p>
            </button>
            {open === g.id && <p className="mt-2 text-[13.5px] leading-relaxed text-stone-700">{g.body}</p>}
          </Card>
        ))}
      </div>
      <Card>
        <h3 className="font-display text-[15px] font-bold">Frequently asked questions</h3>
        <div className="mt-2 divide-y divide-stone-100">
          {faqs.map((f, i) => (
            <div key={i} className="py-2.5"><p className="text-[13.5px] font-semibold">{f.q}</p><p className="mt-0.5 text-[13px] text-stone-600">{f.a}</p></div>
          ))}
        </div>
        <div className="mt-2 rounded-lg bg-stone-50 p-3 text-[12.5px] text-stone-500">
          Local collection points: <b>no verified points configured in this installation.</b> Add them in Settings → Collection points (name, address, authorization ID required).
          <span className="ml-2"><Btn kind="ghost" onClick={() => alert("Operator flow: Settings → Collection points → Add with authorization ID. No demo recyclers are pre-loaded by design.")}>How to add</Btn></span>
        </div>
      </Card>
    </div>
  );
}
