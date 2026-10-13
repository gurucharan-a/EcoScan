import { useRef, useState } from "react";
import { useEco, createScan, applyClassification, runRecommendation, confirmScan, setDeviceOnline } from "@/ecoscan/services/ecoStore";
import { classifyImage } from "@/ecoscan/lib/classifier";
import { CATEGORIES, DEST_LABEL, categoryLabel, type DeviceCategory, type Scan } from "@/ecoscan/types";
import { Card, CardTitle, Btn, Field, Badge, Progress, inputCls, selectCls, recColor } from "@/ecoscan/components/ui";

// Scanner workflow: capture/upload -> classify -> weigh -> assess -> recommend -> confirm.
export default function Scanner({ openScan }: { openScan: (id: string) => void }) {
  const db = useEco();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [weight, setWeight] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [damage, setDamage] = useState("");
  const [cond, setCond] = useState<Scan["operatingCondition"]>("untested");
  const [batt, setBatt] = useState(false);
  const [swollen, setSwollen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [dupWarn, setDupWarn] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overrideCat, setOverrideCat] = useState<DeviceCategory | "">("");

  const active: Scan | null = db.scans.find((s) => s.id === activeId) ?? null;
  const demo = db.settings.mode === "demo";

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { setErr("Only image files (JPG/PNG/WebP) are accepted."); return; }
    if (f.size > 6 * 1024 * 1024) { setErr("Image exceeds 6 MB — please resize and retry."); return; }
    setErr(null);
    const r = new FileReader();
    r.onload = () => { setImage(String(r.result)); setImageName(f.name); };
    r.readAsDataURL(f);
  };

  const simulateCapture = () => {
    // No camera hardware in demo: generate an honest labeled placeholder.
    const c = document.createElement("canvas");
    c.width = 480; c.height = 320;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1c3a2e"; g.fillRect(0, 0, 480, 320);
    g.fillStyle = "#e7f0ea"; g.font = "bold 26px sans-serif";
    g.fillText("SIMULATED capture", 110, 150);
    g.font = "16px sans-serif"; g.fillText("no camera hardware — use upload for real images", 60, 185);
    setImage(c.toDataURL("image/png"));
    setImageName("simulated_capture.png");
  };

  const start = async () => {
    setErr(null); setDupWarn(null);
    const w = weight.trim() === "" ? null : Number(weight);
    if (weight.trim() !== "" && !(w != null && w >= 0 && w <= 20000)) { setErr("Weight must be 0–20000 g."); return; }
    if (!image) { setErr("Capture or upload an image first (or proceed explicitly without one from history)."); return; }
    setBusy(true); setPct(10);
    try {
      const { scan, duplicateOf } = createScan({
        name: name.trim() || "Untitled item",
        imageDataUrl: image, imageName,
        weightG: w, weightSimulated: demo,
        brand: brand || undefined, model: model || undefined,
        visibleDamage: damage, operatingCondition: cond,
        batteryPresent: batt, batterySwollen: swollen,
      });
      if (duplicateOf) setDupWarn(`Possible duplicate of ${duplicateOf.code} (${duplicateOf.name}) — same image or weight within 10 min. Review before sorting.`);
      setActiveId(scan.id);
      setPct(45);
      const cls = await classifyImage(image, { fileName: imageName ?? undefined });
      setPct(70);
      applyClassification(scan.id, cls.category, cls.confidence, cls.provider, cls.simulated);
      runRecommendation(scan.id);
      setPct(100);
      if (demo) {
        // Demo telemetry heartbeat so Hardware page shows activity.
        setDeviceOnline(false);
      }
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const doConfirm = (cat: DeviceCategory | null) => {
    if (!active) return;
    try {
      confirmScan(active.id, cat);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">OPERATE</p>
        <h1 className="font-display text-2xl font-extrabold">Live Scanner</h1>
        <p className="text-[13px] text-stone-500">
          {demo ? "Demo mode: capture is simulated; classification is a labeled mock — never presented as a trained model." : "Hardware mode: connect the ESP32 on the Hardware page; sorting is blocked while offline."}
        </p>
      </div>

      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-800">{err} <button className="ml-2 font-bold underline" onClick={() => setErr(null)}>Dismiss</button></div>}
      {dupWarn && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">{dupWarn}</div>}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle sub={demo ? "Simulated chamber — telemetry labeled SIM" : "Chamber feed when the ESP32 camera is online"}>1 · Image</CardTitle>
          {image
            ? <img src={image} alt="Scan preview" className="max-h-64 w-full rounded-lg border border-stone-200 object-contain bg-stone-50" />
            : <div className="grid h-48 place-items-center rounded-lg border border-dashed border-stone-300 bg-stone-50 text-[13px] text-stone-400">No image — capture or upload</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn kind="ghost" onClick={simulateCapture}>Capture (simulated)</Btn>
            <Btn kind="ghost" onClick={() => fileRef.current?.click()}>Upload image</Btn>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <p className="mt-2 text-[11.5px] text-stone-400">Tip: name the file phone_demo.jpg / remote_demo.jpg / battery_swollen_demo.jpg for deterministic demo classes.</p>
        </Card>

        <Card>
          <CardTitle sub="Weight from load cell (or entered value, labeled)">2 · Item + weight</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Item name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Old TV remote" /></Field>
            <Field label="Measured weight (g)" hint={demo ? "SIMULATED entry" : "From HX711 when online"}>
              <input className={inputCls} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 82" />
            </Field>
            <Field label="Brand (optional)"><input className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
            <Field label="Model (optional)"><input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Visible damage (observed, not inferred)"><input className={inputCls} value={damage} onChange={(e) => setDamage(e.target.value)} placeholder="e.g. cracked screen, scuffed case" /></Field></div>
            <Field label="Operating condition (user-reported)">
              <select className={selectCls} value={cond} onChange={(e) => setCond(e.target.value as any)}>
                <option value="untested">Untested</option>
                <option value="powers_on">Powers on normally</option>
                <option value="powers_on_issue">Powers on with issues</option>
                <option value="dead">Dead / won't power on</option>
              </select>
            </Field>
            <div className="flex items-end gap-4 pb-1 text-[13px]">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={batt} onChange={(e) => setBatt(e.target.checked)} /> Battery present</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={swollen} onChange={(e) => { setSwollen(e.target.checked); if (e.target.checked) setBatt(true); }} /> Swollen/leaking</label>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Btn onClick={start} disabled={busy}>{busy ? "Scanning…" : "Capture & Analyze"}</Btn>
            {busy && <div className="flex-1"><Progress pct={pct} /></div>}
            {!busy && active && <Btn kind="ghost" onClick={() => { setActiveId(null); setImage(null); setWeight(""); setName(""); }}>Reset</Btn>}
          </div>
        </Card>
      </div>

      {active && (
        <Card>
          <CardTitle sub={`${active.code} · ${active.status} · click through for the full report`}>3 · Result — confirm before sorting</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="teal">{categoryLabel(active.predictedCategory)}</Badge>
            <Badge color={active.confidence >= db.settings.confidenceThreshold ? "green" : "amber"}>{(active.confidence * 100).toFixed(1)}% confidence {active.inferenceSimulated ? "(simulated)" : ""}</Badge>
            <Badge color="stone">{active.weightG != null ? `${active.weightG} g ${active.weightSimulated ? "(sim)" : "(measured)"}` : "no weight"}</Badge>
            {active.recommendation && <Badge color={recColor(active.recommendation.kind)}>{active.recommendation.kind} → {DEST_LABEL[active.recommendation.destination]}</Badge>}
            <Badge color="stone">{active.status}</Badge>
          </div>
          {active.recommendation && (
            <div className="mt-3 rounded-lg bg-stone-50 p-3 text-[13px]">
              <p className="font-semibold">{active.recommendation.explanation}</p>
              <ul className="mt-1 list-disc pl-5 text-stone-600">{active.recommendation.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
              {active.recommendation.uncertainty.length > 0 && <p className="mt-1 text-[12px] text-amber-800">Uncertainty: {active.recommendation.uncertainty.join(" ")}</p>}
              <p className="mt-1 font-mono text-[11px] text-stone-400">rule {active.recommendation.ruleVersion} · model mock-clf-v0.3.0 (simulated)</p>
            </div>
          )}
          {(active.status === "AWAITING_CONFIRMATION" || active.status === "NEEDS_MANUAL_REVIEW") && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Btn onClick={() => doConfirm(null)}>Confirm: {categoryLabel(active.predictedCategory)}</Btn>
              <select className={selectCls} style={{ width: 220 }} value={overrideCat} onChange={(e) => setOverrideCat(e.target.value as DeviceCategory)}>
                <option value="">Correct category…</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <Btn kind="teal" disabled={!overrideCat} onClick={() => overrideCat && doConfirm(overrideCat as DeviceCategory)}>Confirm correction</Btn>
              <Btn kind="ghost" onClick={() => openScan(active.id)}>Open full report</Btn>
            </div>
          )}
          {active.status === "READY_TO_SORT" && (
            <div className="mt-3 flex gap-2">
              <Btn kind="ghost" onClick={() => openScan(active.id)}>Open report & sort →</Btn>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
