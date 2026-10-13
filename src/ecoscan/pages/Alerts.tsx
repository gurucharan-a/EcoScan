import { useEffect, useState } from "react";
import { useEco, ackAlert } from "@/ecoscan/services/ecoStore";
import { pgAlerts, type PgError as PgErr } from "@/ecoscan/services/ecoRemote";
import { usePg, PgBanner, PgError } from "@/ecoscan/components/PgMode";
import type { Alert } from "@/ecoscan/types";
import { Card, Btn, Badge, Empty } from "@/ecoscan/components/ui";

const sevColor = (s: string) => (s === "critical" ? "red" : s === "warning" ? "amber" : "blue") as "red" | "amber" | "blue";

function AlertList({ alerts, openScan, onAck }: {
  alerts: Alert[]; openScan?: (id: string) => void; onAck?: (id: string, resolved?: boolean) => void;
}) {
  if (alerts.length === 0) return <Empty title="No alerts" body="Device offline, low confidence, sorting failures, full bins, and hazardous items will raise alerts here." />;
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="divide-y divide-stone-100">
        {alerts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <Badge color={sevColor(a.severity)}>{a.severity.toUpperCase()}</Badge>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">{a.title} {a.acked && <span className="text-stone-400">(acked)</span>} {a.resolved && <span className="text-emerald-700">(resolved)</span>}</p>
              <p className="text-[12.5px] text-stone-500">{a.body}</p>
              <p className="font-mono text-[11px] text-stone-400">{new Date(a.at).toLocaleString()}{a.scanId ? ` · scan ${a.scanId.slice(-6)}` : ""}</p>
            </div>
            {a.scanId && openScan && <Btn kind="ghost" onClick={() => openScan(a.scanId!)}>Open scan</Btn>}
            {onAck && !a.acked && <Btn kind="ghost" onClick={() => onAck(a.id)}>Acknowledge</Btn>}
            {onAck && !a.resolved && <Btn kind="ghost" onClick={() => onAck(a.id, true)}>Resolve</Btn>}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Alerts({ openScan }: { openScan: (id: string) => void }) {
  const db = useEco();
  const { pg, base } = usePg();
  const [rows, setRows] = useState<Alert[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pg) return;
    setLoading(true);
    pgAlerts(base)
      .then((r) => { setRows(r); setErr(null); setLoading(false); })
      .catch((e: PgErr) => { setErr(e.message); setLoading(false); });
  }, [pg, base]);

  if (pg) {
    const open = rows.filter((a) => !a.resolved);
    return (
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">SIGNALS · POSTGRES</p>
          <h1 className="font-display text-2xl font-extrabold">Alerts & Notifications</h1>
        </div>
        <PgBanner what="Alerts are read from Postgres (acknowledgement stays browser-local in this version)." />
        {loading && <Card><p className="text-[13px] text-stone-500">Loading Postgres alerts…</p></Card>}
        {err && <PgError message={err} retry={() => window.location.reload()} />}
        {!loading && !err && <AlertList alerts={rows} openScan={openScan} />}
        {!loading && !err && <p className="text-[12px] text-stone-400">{open.length} open · {rows.length} total</p>}
      </div>
    );
  }

  const open = db.alerts.filter((a) => !a.resolved);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">SIGNALS · {open.length} OPEN</p>
        <h1 className="font-display text-2xl font-extrabold">Alerts & Notifications</h1>
        <p className="text-[13px] text-stone-500">Generated from real application events only. No external email/SMS is sent unless an integration is configured.</p>
      </div>
      <AlertList alerts={db.alerts} openScan={openScan} onAck={(id, resolved) => ackAlert(id, resolved)} />
    </div>
  );
}
