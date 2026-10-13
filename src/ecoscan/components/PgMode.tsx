import { useEco } from "@/ecoscan/services/ecoStore";

/** Postgres mode helpers. When off, every page uses the browser-local store. */
export function usePg(): { pg: boolean; base: string } {
  const db = useEco();
  return { pg: db.settings.dbMode === "postgres", base: db.settings.pgBase };
}

export function PgBanner({ what }: { what: string }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-[12.5px] text-sky-900">
      <b>Postgres mode</b> — {what} Data lives in Postgres via Prisma; writes are real and shared across devices.
      Switch back to Browser DB in Settings any time.
    </div>
  );
}

export function PgError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
      <b>Postgres unreachable.</b> {message}
      <div className="mt-2 flex gap-2">
        <button className="font-bold underline" onClick={retry}>Retry</button>
        <span className="text-red-400">Check Settings → Database (base URL + DATABASE_URL on the server).</span>
      </div>
    </div>
  );
}
