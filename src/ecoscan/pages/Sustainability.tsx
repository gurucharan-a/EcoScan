import { useEco } from "@/ecoscan/services/ecoStore";
import { summarize } from "@/ecoscan/lib/sustainability";
import { categoryLabel } from "@/ecoscan/types";
import { Card, CardTitle, Bars, Badge } from "@/ecoscan/components/ui";

export default function Sustainability() {
  const db = useEco();
  const s = summarize(db.scans.map((x) => ({ category: x.category, weightG: x.weightG, recommendationKind: x.recommendation?.kind ?? null })), {
    co2PerKg: db.settings.co2PerKg, co2Source: db.settings.co2Source, materialValuePerKg: db.settings.materialValuePerKg, version: "factors-v1.1.0",
  });
  const verified = db.bins.filter((b) => b.status === "PROCESSED").reduce((a, b) => a + b.totalWeightG, 0) / 1000;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">IMPACT · ESTIMATED UNLESS VERIFIED</p>
        <h1 className="font-display text-2xl font-extrabold">Sustainability Analytics</h1>
        <p className="max-w-3xl text-[13px] text-stone-500">A recommendation is not an outcome. CO₂ and value figures are planning estimates; only handover/processing records in Collections count as verified.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: "Recorded e-waste", v: `${s.totalMassKg.toFixed(2)} kg`, s2: `${db.scans.length} scans` },
          { l: "Diverted (est.)", v: `${s.divertedKg.toFixed(2)} kg`, s2: "reuse+repair+recycle+haz" },
          { l: "Verified processed", v: `${verified.toFixed(2)} kg`, s2: "handover records only" },
          { l: "CO₂ avoided (est.)", v: `${s.co2AvoidedKg} kg`, s2: "±50% uncertainty" },
        ].map((k) => (
          <Card key={k.l} className="!p-3.5"><p className="text-[11.5px] font-semibold text-stone-500">{k.l}</p>
            <p className="font-display text-[22px] font-extrabold">{k.v}</p><p className="text-[11px] text-stone-400">{k.s2}</p></Card>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle sub="Recorded mass per device category">Mass by category</CardTitle>
          {s.byCategory.length === 0 ? <p className="text-[13px] text-stone-400">No data yet.</p> :
            <Bars data={s.byCategory.map((c) => ({ label: categoryLabel(c.category as any).split(" ")[0], value: Math.round(c.massKg * 1000) }))} />}
          <ul className="mt-2 space-y-0.5 text-[12.5px] text-stone-600">{s.byCategory.map((c) => <li key={c.category}>{categoryLabel(c.category as any)} — {c.massKg.toFixed(2)} kg · {c.count} items</li>)}</ul>
        </Card>
        <Card>
          <CardTitle sub="Where recommendations route items">Mass by destination</CardTitle>
          {s.byDestination.length === 0 ? <p className="text-[13px] text-stone-400">No data yet.</p> :
            <div className="space-y-1.5">{s.byDestination.map((d) => (
              <div key={d.destination} className="flex items-center gap-2 text-[13px]">
                <Badge color="stone">{d.destination}</Badge><span className="ml-auto font-semibold">{d.massKg.toFixed(2)} kg · {d.count}</span>
              </div>))}</div>}
          <p className="mt-3 text-[12.5px]">Reuse/repair recommendations: <b>{s.reuseRepairCount}</b> · Hazardous alerts: <b>{s.hazardousCount}</b></p>
        </Card>
      </div>
      <Card>
        <CardTitle sub="Every figure below is configurable in Settings">Calculation method & assumptions</CardTitle>
        <div className="space-y-1.5 text-[13px] text-stone-600">
          <p><b>Method:</b> {s.co2Method}</p>
          <p><b>Source:</b> {db.settings.co2Source}</p>
          <p><b>Uncertainty:</b> {s.co2Uncertainty}</p>
          <p><b>Material value:</b> diverted kg × ₹{db.settings.materialValuePerKg}/kg = ₹{s.estMaterialValueInr.toLocaleString("en-IN")} (average scrap planning rate, varies 10× by category).</p>
          <p className="text-amber-800"><b>Honesty rule:</b> we do not claim a recommendation guarantees environmental benefit — benefit occurs only on actual reuse/repair/recycling.</p>
        </div>
      </Card>
    </div>
  );
}
