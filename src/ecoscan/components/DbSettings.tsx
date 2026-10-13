import { useState } from "react";
import { useEco, updateSettings } from "@/ecoscan/services/ecoStore";
import { pgHealth } from "@/ecoscan/services/ecoRemote";
import { Card, CardTitle, Btn, Field, Badge, inputCls, selectCls } from "@/ecoscan/components/ui";

export default function DbSettings() {
  const db = useEco();
  const s = db.settings;
  const [base, setBase] = useState(s.pgBase);
  const [probe, setProbe] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const test = async (b: string) => {
    setProbing(true); setErr(null); setProbe(null);
    try {
      const h = await pgHealth(b);
      setProbe(`OK — model ${h.model} · rules ${h.rules} · db: ${h.database}`);
    } catch (e) { setErr((e as Error).message); }
    finally { setProbing(false); }
  };

  return (
    <Card>
      <CardTitle sub="Browser localStorage (offline, single device) or Prisma Postgres (shared, needs DATABASE_URL on the server)">Database backend</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Active database">
          <select className={selectCls} value={s.dbMode}
            onChange={(e) => {
              const m = e.target.value as "local" | "postgres";
              if (m === "postgres" && !confirm("Switch to Postgres? Pages will read/write the shared database via the Prisma API instead of this browser.")) return;
              updateSettings({ dbMode: m });
            }}>
            <option value="local">Browser DB (localStorage)</option>
            <option value="postgres">Postgres via Prisma API</option>
          </select>
        </Field>
        <Field label="Postgres API base URL" hint='"" = same origin /api/ecoscan (Vercel deployment)'>
          <input className={inputCls} value={base} onChange={(e) => setBase(e.target.value)}
            placeholder="https://your-app.vercel.app"
            onBlur={() => updateSettings({ pgBase: base.trim() })} />
        </Field>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Btn kind="ghost" onClick={() => test(base.trim())} disabled={probing}>{probing ? "Testing…" : "Test connection"}</Btn>
        {s.dbMode === "postgres" ? <Badge color="blue">POSTGRES ACTIVE</Badge> : <Badge color="stone">BROWSER DB ACTIVE</Badge>}
      </div>
      {probe && <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-900">{probe}</p>}
      {err && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{err}</p>}
      <p className="mt-2 text-[12px] text-stone-500">
        Server setup: set <span className="font-mono">DATABASE_URL</span> (Supabase / Neon / Prisma Postgres) on the host,
        then run <span className="font-mono">npx prisma db push --schema=prisma/ecoscan.prisma</span> once.
        Without it the API answers 503 <span className="font-mono">NO_DATABASE</span> — never fake data. See docs/DATABASE.md.
      </p>
    </Card>
  );
}
