import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="font-display text-[15px] font-bold text-stone-900">{children}</h3>
      {sub && <p className="mt-0.5 text-[12.5px] text-stone-500">{sub}</p>}
    </div>
  );
}

export function Btn({ children, onClick, kind = "primary", disabled, type }: {
  children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger" | "teal";
  disabled?: boolean; type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-emerald-800 text-white hover:bg-emerald-900 disabled:bg-stone-300",
    teal: "bg-teal-700 text-white hover:bg-teal-800 disabled:bg-stone-300",
    ghost: "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50",
    danger: "bg-red-700 text-white hover:bg-red-800 disabled:bg-stone-300",
  } as const;
  return (
    <button type={type ?? "button"} disabled={disabled} onClick={onClick}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600", styles[kind])}>
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-stone-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-stone-400">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[13.5px] text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700";
export const selectCls = inputCls;

const tone: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  teal: "bg-teal-50 text-teal-800 border-teal-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-800 border-red-200",
  stone: "bg-stone-100 text-stone-700 border-stone-200",
  blue: "bg-sky-50 text-sky-800 border-sky-200",
};

export function Badge({ children, color = "stone" }: { children: ReactNode; color?: keyof typeof tone }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold", tone[color])}>
      {children}
    </span>
  );
}

export function recColor(kind: string): "green" | "teal" | "amber" | "red" | "stone" {
  if (kind === "REUSE") return "green";
  if (kind === "REPAIR") return "teal";
  if (kind === "RECYCLE") return "stone";
  if (kind === "HAZARDOUS") return "red";
  return "amber";
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
      <p className="font-display text-[15px] font-bold text-stone-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-stone-500">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// Minimal dependency-free bar chart (real data only).
export function Bars({ data, height = 120 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height }} role="img" aria-label="bar chart">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-t-md bg-emerald-700/85" title={`${d.label}: ${d.value}`}
            style={{ height: `${Math.max(4, (d.value / max) * (height - 28))}px` }} />
          <span className="text-[10px] font-medium text-stone-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;
  const segs = slices.map((s) => {
    const from = (acc / total) * 360;
    acc += s.value;
    const to = (acc / total) * 360;
    return `${s.color} ${from}deg ${to}deg`;
  });
  return (
    <div className="flex items-center gap-4">
      <div className="h-28 w-28 shrink-0 rounded-full border border-stone-200"
        style={{ background: `conic-gradient(${segs.join(",")})` }} />
      <div className="space-y-1">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[12px] text-stone-600">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="font-medium">{s.label}</span>
            <span className="text-stone-400">{s.value}</span>
          </div>
        ))}
        {total === 0 && <span className="text-[12px] text-stone-400">No data yet</span>}
      </div>
    </div>
  );
}

export function Progress({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={pct}>
      <div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
