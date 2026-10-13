import { useEco, dashboard, seedDemo } from "@/ecoscan/services/ecoStore";
import { summarize } from "@/ecoscan/lib/sustainability";
import { Card, CardTitle, Badge, Bars, Donut, Empty, recColor, Btn } from "@/ecoscan/components/ui";
import { categoryLabel } from "@/ecoscan/types";
import { fmtG } from "@/ecoscan/lib/ecoUtils";

export default function Dashboard({ go, openScan }: { go: (p: any) => void; openScan: (id: string) => void }) {
  const db = useEco();
  const s = dashboard();

  if (s.totalScans === 0) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">COMMAND CENTER</p>
          <h1 className="font-display text-2xl font-extrabold">Overview Dashboard</h1>
          <p className="text-[13px] text-stone-500">Genuine aggregates from stored scans — no hardcoded totals.</p>
        </div>
        <Empty title="No scans yet" body="This is a new installation. Load clearly-labeled demo data or run your first scan to populate every metric on this page."
          action={<><Btn onClick={() => seedDemo()}>Load demo data</Btn><span className="mx-2" /><Btn kind="ghost" onClick={() => go("scanner")}>Open Live Scanner</Btn></>} />
      </div>
    );
  }

  const sust = summarize(db.scans.map((x) => ({ category: x.category, weightG: x.weightG, recommendationKind: x.recommendation?.kind ?? null })), {
    co2PerKg: db.settings.co2PerKg, co2Source: db.settings.co2Source, materialValuePerKg: db.settings.materialValuePerKg, version: "factors-v1.1.0",
  });

  const kpis: { label: string; value: string; sub: string }[] = [
    { label: "Items scanned", value: String(s.totalScans), sub: "stored records" },
    { label: "Measured weight", value: fmtG(s.totalWeightG), sub: "load-cell / entered" },
    { label: "Awaiting review", value: String(s.awaitingReview), sub: "confirm in Scanner" },
    { label: "Reuse / Repair", value: String(s.reuseRepair), sub: "recommended" },
    { label: "Recycling", value: String(s.recycle), sub: "routed" },
    { label: "Hazardous", value: String(s.hazardous), sub: "special handling" },
    { label: "Sort success", value: s.sortSuccessRate == null ? "—" : `${s.sortSuccessRate}%`, sub: "acked completions" },
    { label: "CO₂ avoided (est.)", value: `${sust.co2AvoidedKg} kg`, sub: "±50% planning est." },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">COMMAND CENTER</p>
        <h1 className="font-display text-2xl font-extrabold">Overview Dashboard</h1>
        <p className="text-[13px] text-stone-500">Live aggregates from {s.totalScans} stored scans · {db.settings.mode === "demo" ? "demo data labeled" : "hardware measurements"}.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="!p-3.5">
            <p className="text-[11.5px] font-semibold text-stone-500">{k.label}</p>
            <p className="font-display text-[22px] font-extrabold leading-tight">{k.value}</p>
            <p className="text-[11px] text-stone-400">{k.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub="Scans + weighed mass per day (last 7 days)">Collection trend</CardTitle>
          <Bars data={s.last7d.map((d) => ({ label: d.day, value: d.count }))} />
          <p className="mt-2 text-[12px] text-stone-500">Weight trend: {s.last7d.map((d) => `${d.day} ${fmtG(d.weightG)}`).join(" · ")}</p>
        </Card>
        <Card>
          <CardTitle sub="Stored scan categories">Waste category mix</CardTitle>
          <Donut slices={s.byCategory.map((c, i) => ({ label: categoryLabel(c.name as any), value: c.count, color: ["#166534", "#0f766e", "#a16207", "#b91c1c", "#57534e", "#0284c7"][i % 6] }))} />
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle sub="Newest first — click to open the full report">Latest scan activity</CardTitle>
          <div className="divide-y divide-stone-100">
            {s.recent.map((r) => (
              <button key={r.id} onClick={() => openScan(r.id)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-stone-50">
                <span className="font-mono text-[12px] font-bold text-emerald-900">{r.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.name}</span>
                {r.recommendation && <Badge color={recColor(r.recommendation.kind)}>{r.recommendation.kind}</Badge>}
                <span className="text-[12px] text-stone-400">{fmtG(r.weightG)}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle sub="Estimated recoverable value from diverted mass">Material recovery (estimated)</CardTitle>
          <p className="font-display text-3xl font-extrabold">₹{sust.estMaterialValueInr.toLocaleString("en-IN")}</p>
          <p className="mt-1 text-[12px] text-stone-500">Method: diverted kg × ₹{db.settings.co2PerKg && db.settings.materialValuePerKg}/kg. ESTIMATED — verified only on handover records.</p>
          <div className="mt-3 flex gap-2">
            <Btn kind="ghost" onClick={() => go("sustainability")}>Sustainability detail</Btn>
            <Btn kind="ghost" onClick={() => go("collections")}>Collections</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
