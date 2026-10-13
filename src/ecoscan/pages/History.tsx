import { useEffect, useMemo, useState } from "react";
import { useEco } from "@/ecoscan/services/ecoStore";
import { pgListScans } from "@/ecoscan/services/ecoRemote";
import { usePg, PgBanner, PgError } from "@/ecoscan/components/PgMode";
import { CATEGORIES, categoryLabel, type Scan } from "@/ecoscan/types";
import { fmtG, toCSV, download } from "@/ecoscan/lib/ecoUtils";
import { Card, Btn, Badge, Empty, inputCls, selectCls, recColor } from "@/ecoscan/components/ui";

function RowsTable({ rows, openScan }: { rows: Scan[]; openScan: (id: string) => void }) {
  if (rows.length === 0) return <Empty title="No matching scans" body="Adjust search or filters — or run a scan." />;
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead><tr className="border-b bg-stone-50 text-left text-stone-500">
            {["Scan", "Item", "Category", "Weight", "Recommendation", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-[11.5px] font-bold">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="px-3 py-2 font-mono text-[12px] font-bold text-emerald-900">{s.code}</td>
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 text-stone-600">{categoryLabel(s.category)} <span className="text-stone-400">{(s.confidence * 100).toFixed(0)}%</span></td>
                <td className="px-3 py-2">{fmtG(s.weightG)}</td>
                <td className="px-3 py-2">{s.recommendation ? <Badge color={recColor(s.recommendation.kind)}>{s.recommendation.kind}</Badge> : <span className="text-stone-400">—</span>}</td>
                <td className="px-3 py-2"><Badge color={s.status === "SORT_COMPLETE" ? "green" : s.status === "FAILED" ? "red" : s.status === "NEEDS_MANUAL_REVIEW" ? "amber" : "stone"}>{s.status}</Badge></td>
                <td className="px-3 py-2 text-right"><button className="font-semibold text-emerald-800 underline" onClick={() => openScan(s.id)}>Open →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PgHistory({ base, openScan, go }: { base: string; openScan: (id: string) => void; go: (p: any) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Scan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true); setErr(null);
    pgListScans(base, { q: q.trim() || undefined, limit: 100 })
      .then((r) => { setRows(r); setLoading(false); })
      .catch((e) => { setErr((e as Error).message); setLoading(false); });
  };
  useEffect(() => { load(); }, [base]);
  return (
    <div className="space-y-4">
      <PgBanner what="History reads live Postgres rows." />
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Search name, category, scan ID…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <Btn onClick={load}>Search</Btn>
      </div>
      {loading && <Card><p className="text-[13px] text-stone-500">Loading Postgres scans…</p></Card>}
      {err && <PgError message={err} retry={load} />}
      {!loading && !err && rows.length === 0 && <Empty title="No scans in Postgres" body="Run a scan in Postgres mode first." action={<Btn onClick={() => go("scanner")}>Open Live Scanner</Btn>} />}
      {!loading && !err && rows.length > 0 && <RowsTable rows={rows} openScan={openScan} />}
    </div>
  );
}

export default function History({ openScan, go }: { openScan: (id: string) => void; go: (p: any) => void }) {
  const db = useEco();
  const { pg, base } = usePg();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [rec, setRec] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"new" | "old" | "heavy" | "light">("new");
  const [page, setPage] = useState(0);
  const PER = 8;

  const rows = useMemo(() => {
    let r = [...db.scans];
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((s) => (s.name + s.code + s.id + s.category).toLowerCase().includes(t));
    }
    if (cat) r = r.filter((s) => s.category === cat);
    if (rec) r = r.filter((s) => s.recommendation?.kind === rec);
    if (status) r = r.filter((s) => s.status === status);
    r.sort((a, b) => sort === "new" ? +new Date(b.createdAt) - +new Date(a.createdAt)
      : sort === "old" ? +new Date(a.createdAt) - +new Date(b.createdAt)
      : sort === "heavy" ? (b.weightG ?? -1) - (a.weightG ?? -1) : (a.weightG ?? 1e9) - (b.weightG ?? 1e9));
    return r;
  }, [db.scans, q, cat, rec, status, sort]);

  if (pg) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">RECORDS · POSTGRES</p>
          <h1 className="font-display text-2xl font-extrabold">Scan History</h1>
        </div>
        <PgHistory base={base} openScan={openScan} go={go} />
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const view = rows.slice(page * PER, page * PER + PER);

  const exportCSV = () => {
    const csv = toCSV(rows.map((s) => ({
      code: s.code, name: s.name, category: s.category, predicted: s.predictedCategory,
      confidence: s.confidence, weight_g: s.weightG ?? "", recommendation: s.recommendation?.kind ?? "",
      destination: s.sortDestination ?? "", status: s.status, created: s.createdAt,
      rule: s.recommendation?.ruleVersion ?? "", model: s.modelVersion,
    })));
    download(`ecoscan-scans-${new Date().toISOString().slice(0, 10)}.csv`, csv || "code\n", "text/csv");
  };
  const exportJSON = () => download(`ecoscan-scans-${Date.now()}.json`, JSON.stringify(rows, null, 2), "application/json");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">RECORDS</p>
          <h1 className="font-display text-2xl font-extrabold">Scan History</h1>
          <p className="text-[13px] text-stone-500">{rows.length} of {db.scans.length} records · deletion is audited · reclassification keeps history.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Btn kind="ghost" onClick={exportCSV}>CSV export</Btn>
          <Btn kind="ghost" onClick={exportJSON}>JSON export</Btn>
          <Btn kind="ghost" onClick={() => window.print()}>Print</Btn>
        </div>
      </div>

      <Card>
        <div className="grid gap-2 md:grid-cols-5">
          <input className={inputCls} placeholder="Search name, category, scan ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          <select className={selectCls} value={cat} onChange={(e) => { setCat(e.target.value); setPage(0); }}>
            <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className={selectCls} value={rec} onChange={(e) => { setRec(e.target.value); setPage(0); }}>
            <option value="">All recommendations</option>{["REUSE", "REPAIR", "RECYCLE", "HAZARDOUS", "MANUAL_REVIEW"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className={selectCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            <option value="">All statuses</option>{["AWAITING_CONFIRMATION", "NEEDS_MANUAL_REVIEW", "READY_TO_SORT", "SORTING", "SORT_COMPLETE", "FAILED"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="new">Newest first</option><option value="old">Oldest first</option>
            <option value="heavy">Heaviest first</option><option value="light">Lightest first</option>
          </select>
        </div>
      </Card>

      {view.length === 0 ? <Empty title="No matching scans" body="Adjust search or filters — or run a scan." action={<Btn onClick={() => go("scanner")}>Open Live Scanner</Btn>} /> : (
        <>
          <RowsTable rows={view} openScan={openScan} />
          <div className="flex items-center gap-2 px-1 text-[12.5px]">
            <Btn kind="ghost" onClick={() => setPage(Math.max(0, page - 1))}>← Prev</Btn>
            <span className="text-stone-500">Page {page + 1} of {pages}</span>
            <Btn kind="ghost" onClick={() => setPage(Math.min(pages - 1, page + 1))}>Next →</Btn>
          </div>
        </>
      )}
    </div>
  );
}
