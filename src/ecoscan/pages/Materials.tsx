import { useState } from "react";
import { useEco, getDB } from "@/ecoscan/services/ecoStore";
import { CATEGORIES, categoryLabel } from "@/ecoscan/types";
import { PROFILE_VERSION } from "@/ecoscan/data/materialProfiles";
import { Card, CardTitle, Badge, Btn, Field, inputCls } from "@/ecoscan/components/ui";

export default function Materials() {
  const db = useEco();
  const [sel, setSel] = useState(CATEGORIES[1].id);
  const p = db.profiles.find((x) => x.category === sel)!;
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const list = CATEGORIES.filter((c) => c.id !== "unknown")
    .filter((c) => (c.label + c.id).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">DATABASE {PROFILE_VERSION}</p>
        <h1 className="font-display text-2xl font-extrabold">Component & Material Intelligence</h1>
        <p className="max-w-3xl text-[13px] text-stone-500">Category-level typical profiles — not measurements of any specific item. Same-category products vary; qualitative rows never get fabricated masses. Editing is versioned (demo: edits are local drafts).</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
        <Card>
          <Field label="Search profiles"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. battery" /></Field>
          <div className="mt-2 max-h-[480px] space-y-1 overflow-y-auto">
            {list.map((c) => (
              <button key={c.id} onClick={() => setSel(c.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium ${sel === c.id ? "bg-emerald-800 text-white" : "hover:bg-stone-100 text-stone-700"}`}>
                {c.label}
                <span className={`ml-2 text-[10.5px] ${sel === c.id ? "text-emerald-200" : "text-stone-400"}`}>{c.hasBattery ? "· batt" : ""}{c.hazardous ? " · haz" : ""}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle sub={`${p.version} · typical ${p.typicalWeightG[0]}–${p.typicalWeightG[1]} g · updated ${p.updatedAt.slice(0, 10)}`}>{categoryLabel(p.category)}</CardTitle>
          <p className="text-[13px] text-stone-600">{p.notes}</p>
          <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">Limitation: {p.limitations}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead><tr className="border-b text-left text-stone-500">
                {["Component", "Materials", "Typical fraction", "Recovery", "Handling", "Reliability"].map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {p.components.map((c) => (
                  <tr key={c.component} className="border-b border-stone-100">
                    <td className="py-1.5 pr-3 font-medium">{c.component}</td>
                    <td className="py-1.5 pr-3 text-stone-600">{c.materials}</td>
                    <td className="py-1.5 pr-3">{c.massFractionMin != null ? `${Math.round(c.massFractionMin * 100)}–${Math.round((c.massFractionMax ?? 0) * 100)}%` : <span className="text-stone-400">qualitative</span>}</td>
                    <td className="py-1.5 pr-3 text-stone-600">{c.recovery}</td>
                    <td className="py-1.5 pr-3 text-stone-600">{c.handling}</td>
                    <td className="py-1.5 pr-3"><Badge color={c.reliability === "high" ? "green" : c.reliability === "qualitative" ? "amber" : "stone"}>{c.reliability}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-stone-500">Sources: {[...new Set(p.components.map((c) => c.source))].join("; ")}</p>
          <div className="mt-3 flex gap-2">
            <Btn kind="ghost" onClick={() => { void getDB(); setNote("Profile editing is versioned — in this prototype, propose changes via Settings → Export, then an operator commits a new profile version. Rule: never overwrite history; bump version."); }}>Propose edit</Btn>
          </div>
          {note && <p className="mt-2 text-[12.5px] text-stone-600">{note}</p>}
        </Card>
      </div>
    </div>
  );
}
