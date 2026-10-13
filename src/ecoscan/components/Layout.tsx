import type { ReactNode } from "react";
import {
  LayoutDashboard, ScanLine, History, Boxes, ArrowLeftRight, Cpu,
  Layers, Leaf, BookOpen, Bell, Settings,
} from "lucide-react";
import { useEco, dashboard, setMode } from "@/ecoscan/services/ecoStore";
import { cn } from "@/lib/utils";

export type EcoPage =
  | "overview" | "scanner" | "history" | "materials" | "sorting"
  | "collections" | "sustainability" | "knowledge" | "alerts" | "hardware" | "settings";

export const NAV: { id: EcoPage; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "scanner", label: "Live Scanner", icon: ScanLine },
  { id: "history", label: "Scan History", icon: History },
  { id: "materials", label: "Material Intelligence", icon: Boxes },
  { id: "sorting", label: "Sorting Control", icon: ArrowLeftRight },
  { id: "collections", label: "Collections", icon: Layers },
  { id: "sustainability", label: "Sustainability", icon: Leaf },
  { id: "knowledge", label: "Knowledge Center", icon: BookOpen },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "hardware", label: "Hardware", icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Layout({ page, setPage, scanDetail, children }: {
  page: EcoPage; setPage: (p: EcoPage) => void; scanDetail: string | null; children: ReactNode;
}) {
  const db = useEco();
  const sum = dashboard();
  const openAlerts = db.alerts.filter((a) => !a.resolved).length;
  const dev = db.devices[0];
  const demo = db.settings.mode === "demo";

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      {/* Mode banner */}
      <div className={cn("px-4 py-1.5 text-center text-[12px] font-bold tracking-wide",
        demo ? "bg-amber-400 text-amber-950" : "bg-emerald-800 text-white")}>
        {demo
          ? "DEMO MODE — simulated readings & sample data. Not from physical sensors."
          : "HARDWARE MODE — real device telemetry. Hardware actions require the device online."}
      </div>

      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
          <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-800 font-display text-lg font-extrabold text-white">E</div>
            <div>
              <div className="font-display text-[17px] font-extrabold leading-none">EcoScan</div>
              <div className="mt-0.5 text-[10px] font-semibold tracking-[0.14em] text-emerald-800">E-WASTE INTELLIGENCE</div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Primary">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => setPage(n.id)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition focus-visible:ring-2 focus-visible:ring-emerald-600",
                  (page === n.id && !scanDetail) ? "bg-emerald-800 text-white" : "text-stone-600 hover:bg-stone-100")}>
                <n.icon size={17} />
                {n.label}
                {n.id === "alerts" && openAlerts > 0 && (
                  <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{openAlerts}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="border-t border-stone-200 p-3">
            <div className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-[12px]">
              <span className={cn("h-2 w-2 rounded-full", dev?.online ? "bg-emerald-600" : "bg-stone-400")} />
              <span className="font-semibold">{dev?.online ? "Device online" : "Device offline"}</span>
              <span className="ml-auto text-stone-400">{demo ? "SIM" : "HW"}</span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Topbar */}
          <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <select aria-label="Mode" value={db.settings.mode}
                onChange={(e) => { if (confirm(e.target.value === "hardware" ? "Switch to HARDWARE mode? Demo data stays separate; hardware actions will require the device." : "Switch to DEMO mode? Simulated readings will be labeled as such.")) setMode(e.target.value as "demo" | "hardware"); }}
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-[12.5px] font-semibold">
                <option value="demo">Demo mode</option>
                <option value="hardware">Hardware mode</option>
              </select>
              <span className={cn("hidden items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-semibold sm:inline-flex",
                dev?.online ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-stone-50 text-stone-500")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", dev?.online ? "bg-emerald-600" : "bg-stone-400")} />
                {dev?.online ? `ESP32 online${dev.rssiDbm ? ` · ${dev.rssiDbm} dBm` : ""}` : "ESP32 offline"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-[12px] text-stone-500 lg:inline">{sum.totalScans} scans · {(sum.totalWeightG / 1000).toFixed(2)} kg recorded</span>
                <button onClick={() => setPage("alerts")} aria-label="Notifications"
                  className="relative rounded-lg border border-stone-300 p-2 hover:bg-stone-50">
                  <Bell size={16} />
                  {openAlerts > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{openAlerts}</span>}
                </button>
                <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-800 text-[12px] font-bold text-white" title="Operator">OP</div>
              </div>
            </div>
            {/* Mobile nav */}
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Primary mobile">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => setPage(n.id)}
                  className={cn("shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold",
                    page === n.id && !scanDetail ? "bg-emerald-800 text-white" : "bg-stone-100 text-stone-600")}>
                  {n.label}
                </button>
              ))}
            </nav>
          </header>
          <main className="p-4 lg:p-6">{children}</main>
          <footer className="flex flex-wrap gap-2 px-6 pb-6 text-[11.5px] text-stone-400">
            <span>EcoScan prototype · estimates labeled, never fabricated as measurements</span>
            <span className="ml-auto">Rules {db.scans[0]?.recommendation?.ruleVersion ?? "rules-v1.2.0"} · Model mock-clf-v0.3.0 · API /api/* documented in README</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
