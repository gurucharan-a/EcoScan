import { useState } from "react";
import { useEco, setDeviceOnline, updateSettings } from "@/ecoscan/services/ecoStore";
import { Card, CardTitle, Btn, Badge, Field, inputCls } from "@/ecoscan/components/ui";

export default function Hardware() {
  const db = useEco();
  const dev = db.devices[0];
  const [err, setErr] = useState<string | null>(null);
  const [tare, setTare] = useState("0");

  const test = (_which: "camera" | "loadCell" | "servo") => {
    if (!dev) return;
    if (db.settings.mode === "demo") {
      setDeviceOnline(false);
      setErr("Demo mode: peripheral test is simulated — readings are NOT from hardware. Switch to Hardware mode with a connected ESP32 for real checks.");
      return;
    }
    if (!dev.online) { setErr("Device offline — cannot test peripherals."); return; }
    setErr(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800">FLEET · 1 REGISTERED DEVICE</p>
        <h1 className="font-display text-2xl font-extrabold">Device & Hardware Management</h1>
        <p className="text-[13px] text-stone-500">A sensor is shown connected only after a real heartbeat reports it — never because it is configured.</p>
      </div>
      {err && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">{err}</div>}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle sub={`${dev?.board} · firmware ${dev?.firmware}`}>{dev?.name} ({dev?.id})</CardTitle>
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div>Status: {dev?.online ? <Badge color="green">ONLINE</Badge> : <Badge color="stone">OFFLINE</Badge>}</div>
            <div>Mode: <Badge color={dev?.mode === "simulated" ? "amber" : "green"}>{dev?.mode}</Badge></div>
            <div>Last heartbeat: {dev?.lastSeen ? new Date(dev.lastSeen).toLocaleString() : "never"}</div>
            <div>Wi-Fi RSSI: {dev?.rssiDbm != null ? `${dev.rssiDbm} dBm` : "— (reported by device only)"}</div>
            <div>Camera: <Badge color={dev?.camera === "ok" ? "green" : "stone"}>{dev?.camera}</Badge></div>
            <div>Load cell: <Badge color={dev?.loadCell === "ok" ? "green" : "stone"}>{dev?.loadCell}</Badge></div>
            <div>Servo: <Badge color={dev?.servo === "ok" ? "green" : dev?.servo === "fault" ? "red" : "stone"}>{dev?.servo}</Badge></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn kind="ghost" onClick={() => setDeviceOnline(true, { rssiDbm: -58, cameraOk: true, loadCellOk: true, servoOk: true })}>Simulate connect</Btn>
            <Btn kind="ghost" onClick={() => setDeviceOnline(false)}>Simulate disconnect</Btn>
          </div>
          <p className="mt-2 text-[12px] text-stone-400">Real ESP32 connects via backend POST /api/devices/{"{id}"}/heartbeat with its device token (see firmware/ + backend/).</p>
        </Card>
        <Card>
          <CardTitle sub="Never auto-operates the servo">Peripheral tests & calibration</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Btn kind="ghost" onClick={() => test("camera")}>Test camera</Btn>
            <Btn kind="ghost" onClick={() => test("loadCell")}>Test load cell</Btn>
            <Btn kind="ghost" onClick={() => test("servo")}>Test servo (bounded)</Btn>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Tare offset (g)" hint="Scale tare — applied to next weighing"><input className={inputCls} value={tare} onChange={(e) => setTare(e.target.value)} /></Field>
            <Field label="Servo travel limits" hint="Enforced in firmware (default 20–160°)"><input className={inputCls} defaultValue="20 – 160°" readOnly /></Field>
          </div>
          <p className="mt-2 text-[12.5px] text-stone-500">Calibration: place a known 500 g weight → record raw HX711 reading → set scale factor in firmware/config.h → verify ±2 g. Full procedure in docs/CALIBRATION.md.</p>
        </Card>
      </div>
      <Card>
        <CardTitle sub="Only real events — reconnects, faults, heartbeats">Telemetry & error history</CardTitle>
        {dev && dev.errors.length === 0 ? <p className="text-[13px] text-stone-500">No errors recorded.</p> : (
          <ul className="space-y-1 text-[13px]">{dev?.errors.slice(-10).reverse().map((e, i) => <li key={i} className="font-mono text-[12px] text-stone-600">{e.at} — {e.msg}</li>)}</ul>
        )}
        <div className="mt-3">
          <Field label="Backend API URL (hardware mode polls this; never embed secrets in frontend)">
            <input className={inputCls} defaultValue={db.settings.apiUrl} placeholder="http://192.168.1.50:8000"
              onBlur={(e) => updateSettings({ apiUrl: e.target.value })} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
