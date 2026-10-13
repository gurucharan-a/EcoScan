import { useEco, ackAlert } from "@/ecoscan/services/ecoStore";
import { Card, Btn, Badge, Empty } from "@/ecoscan/components/ui";

const sevColor = (s: string) => (s === "critical" ? "red" : s === "warning" ? "amber" : "blue") as "red" | "amber" | "blue";

export default function Alerts({ openScan }: { openScan: (id: string) => void }) {
  const db = useEco();
  const open = db.alerts.filter((a) => !a.resolved);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">SIGNALS · {open.length} OPEN</p>
        <h1 className="font-display text-2xl font-extrabold">Alerts & Notifications</h1>
        <p className="text-[13px] text-stone-500">Generated from real application events only. No external email/SMS is sent unless an integration is configured.</p>
      </div>
      {db.alerts.length === 0 ? <Empty title="No alerts" body="Device offline, low confidence, sorting failures, full bins, and hazardous items will raise alerts here." /> : (
        <Card className="!p-0 overflow-hidden">
          <div className="divide-y divide-stone-100">
            {db.alerts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Badge color={sevColor(a.severity)}>{a.severity.toUpperCase()}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">{a.title} {a.acked && <span className="text-stone-400">(acked)</span>} {a.resolved && <span className="text-emerald-700">(resolved)</span>}</p>
                  <p className="text-[12.5px] text-stone-500">{a.body}</p>
                  <p className="font-mono text-[11px] text-stone-400">{new Date(a.at).toLocaleString()}{a.scanId ? ` · scan ${a.scanId.slice(-6)}` : ""}</p>
                </div>
                {a.scanId && <Btn kind="ghost" onClick={() => openScan(a.scanId!)}>Open scan</Btn>}
                {!a.acked && <Btn kind="ghost" onClick={() => ackAlert(a.id)}>Acknowledge</Btn>}
                {!a.resolved && <Btn kind="ghost" onClick={() => ackAlert(a.id, true)}>Resolve</Btn>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
