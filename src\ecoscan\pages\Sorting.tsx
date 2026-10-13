import { useEffect, useState } from "react";
import { useEco, submitSortJob, retryJob, ackJob } from "@/ecoscan/services/ecoStore";
import { pgListScans, pgSort, pgGetJob } from "@/ecoscan/services/ecoRemote";
import { usePg, PgBanner, PgError } from "@/ecoscan/components/PgMode";
import { DEST_LABEL, type Scan, type SortingJob } from "@/ecoscan/types";
import { Card, CardTitle, Btn, Badge, Empty } from "@/ecoscan/components/ui";

function PgSorting({ base, openScan }: { base: string; openScan: (id: string) => void }) {
  const [ready, setReady] = useState<Scan[]>([]);
  const [jobs, setJobs] = useState<Record<string, SortingJob>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    pgListScans(base, { status: "READY_TO_SORT", limit: 50 })
      .then((r) => { setReady(r); setErr(null); setLoading(false); })
      .catch((e) => { setErr((e as Error).message); setLoading(false); });
  };
  useEffect(load, [base]);

  const run = async (scanId: string) => {
    try {
      const j = await pgSort(base, scanId);
      setJobs((m) => ({ ...m, [scanId]: j }));
      setErr(null);
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        try {
          const cur = await pgGetJob(base, j.id);
          setJobs((m) => ({ ...m, [scanId]: cur }));
          if (cur.status === "COMPLETED" || cur.status === "FAILED") break;
        } catch { break; }
      }
      load();
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <PgBanner what="Jobs are created in Postgres; success requires ESP32 acknowledgement." />
      {err && <PgError message={err} retry={load} />}
      <Card>
        <CardTitle sub="Confirmed scans awaiting authorization (Postgres)">Ready to sort ({ready.length})</CardTitle>
        {loading ? <p className="text-[13px] text-stone-500">Loading…</p>
          : ready.length === 0 ? <Empty title="Nothing awaiting sorting" body="Confirm a scan first." />
          : <div className="space-y-2">{ready.map((s) => {
            const j = jobs[s.id];
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 px-3 py-2">
                <span className="font-mono text-[12px] font-bold">{s.code}</span>
                <span className="text-[13px] font-medium">{s.name}</span>
                <Badge color="teal">{s.sortDestination ? DEST_LABEL[s.sortDestination] : "—"}</Badge>
                <button className="text-[12.5px] text-emerald-800 underline" onClick={() => openScan(s.id)}>Report →</button>
                <span className="ml-auto" />
                {j && <span className="text-[12px] text-stone-500">{j.id.slice(-6)} · {j.status}{j.lastError ? ` · ${j.lastError}` : ""}</span>}
                <Btn onClick={() => run(s.id)}>Authorize sort</Btn>
              </div>
            );
          })}</div>}
      </Card>
    </div>
  );
}

export default function Sorting({ openScan }: { openScan: (id: string) => void }) {
  const db = useEco();
  const { pg, base } = usePg();
  const [err, setErr] = useState<string | null>(null);
  const [stop, setStop] = useState(false);
  const dev = db.devices[0];
  const simulated = db.settings.mode === "demo";
  const ready = db.scans.filter((s) => s.status === "READY_TO_SORT");

  if (pg) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">ACTUATION · POSTGRES + HARDWARE</p>
          <h1 className="font-display text-2xl font-extrabold">Sorting Control</h1>
        </div>
        <PgSorting base={base} openScan={openScan} />
      </div>
    );
  }

  const run = (scanId: string) => {
    if (stop) { setErr("Stop requested — clear the stop before authorizing movement."); return; }
    try { submitSortJob(scanId); setErr(null); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">ACTUATION · {simulated ? "SIMULATED ACTUATOR" : "HARDWARE ACTUATOR"}</p>
          <h1 className="font-display text-2xl font-extrabold">Sorting Control</h1>
          <p className="text-[13px] text-stone-500">Explicit state machine · ack-gated success · interlocks enforced · {simulated ? "movement completes in simulation (deposit NOT sensed)" : "ESP32 must acknowledge completion"}.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Btn kind={stop ? "primary" : "danger"} onClick={() => setStop(!stop)}>{stop ? "Clear stop" : "Emergency stop"}</Btn>
        </div>
      </div>

      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-800">{err}</div>}
      {stop && <div className="rounded-lg border border-red-300 bg-red-100 px-4 py-2 text-[13px] font-bold text-red-900">STOP ACTIVE — all sorting commands blocked until cleared.</div>}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardTitle sub={dev?.lastSeen ? `last heartbeat ${new Date(dev.lastSeen).toLocaleTimeString()}` : "no heartbeat yet"}>Controller</CardTitle>
          <p className="text-[13px]"><b>{dev?.name}</b> · {dev?.board} · fw {dev?.firmware}</p>
          <p className="mt-1 text-[13px]">Status: {dev?.online ? <Badge color="green">ONLINE</Badge> : <Badge color="stone">OFFLINE</Badge>} · servo {dev?.servo} · mode {dev?.mode}</p>
          {!simulated && !dev?.online && <p className="mt-2 text-[12.5px] text-red-700">Hardware actions blocked while offline — never falls back to fabricated readings.</p>}
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle sub="Confirmed scans awaiting authorization">Ready to sort ({ready.length})</CardTitle>
          {ready.length === 0 ? <Empty title="Nothing awaiting sorting" body="Confirm a scan in Live Scanner or Scan History first." /> : (
            <div className="space-y-2">
              {ready.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 px-3 py-2">
                  <span className="font-mono text-[12px] font-bold">{s.code}</span>
                  <span className="text-[13px] font-medium">{s.name}</span>
                  <Badge color="teal">{s.sortDestination ? DEST_LABEL[s.sortDestination] : "—"}</Badge>
                  <button className="text-[12.5px] text-emerald-800 underline" onClick={() => openScan(s.id)}>Report →</button>
                  <span className="ml-auto" />
                  <Btn onClick={() => run(s.id)}>Authorize sort</Btn>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle sub="Ack-gated: success only on acknowledgement">Sorting jobs</CardTitle>
        {db.jobs.length === 0 ? <Empty title="No sorting jobs yet" body="Jobs appear here with full lifecycle: QUEUED → SENT → ACKED → COMPLETED (or FAILED/TIMEOUT with retry)." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead><tr className="border-b text-left text-stone-500">
                {["Job", "Scan", "Destination", "Mode", "Angle", "Status", "Attempts", ""].map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {db.jobs.slice(0, 20).map((j) => (
                  <tr key={j.id} className="border-b border-stone-100">
                    <td className="py-1.5 pr-3 font-mono">{j.id.slice(-6)}</td>
                    <td className="py-1.5 pr-3 font-mono">{db.scans.find((s) => s.id === j.scanId)?.code ?? "—"}</td>
                    <td className="py-1.5 pr-3">{DEST_LABEL[j.destination]}</td>
                    <td className="py-1.5 pr-3"><Badge color={j.mode === "simulated" ? "amber" : "green"}>{j.mode}</Badge></td>
                    <td className="py-1.5 pr-3">{j.servoAngle}°</td>
                    <td className="py-1.5 pr-3"><Badge color={j.status === "COMPLETED" ? "green" : j.status === "FAILED" ? "red" : "stone"}>{j.status}</Badge>{j.lastError && <span className="ml-1 text-red-700">{j.lastError}</span>}</td>
                    <td className="py-1.5 pr-3">{j.attempts}/3</td>
                    <td className="py-1.5 pr-3 text-right">
                      {(j.status === "FAILED") && <button className="mr-2 font-semibold text-emerald-800 underline" onClick={() => { try { retryJob(j.id); setErr(null); } catch (e) { setErr((e as Error).message); } }}>Retry</button>}
                      {!simulated && j.status === "SENT" && <button className="font-semibold text-emerald-800 underline" onClick={() => { try { ackJob(j.id, true, "Manual ack (demo of HW path)"); } catch (e) { setErr((e as Error).message); } }}>Ack (test)</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {db.events.length > 0 && <p className="mt-2 font-mono text-[11px] text-stone-400">Latest events: {db.events.slice(-3).reverse().map((e) => `${e.kind} ${e.jobId.slice(-6)}`).join(" · ")}</p>}
      </Card>
    </div>
  );
}
