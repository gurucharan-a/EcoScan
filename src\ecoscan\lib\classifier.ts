// Replaceable image-classification interface.
// Default provider is a clearly-labeled SIMULATED classifier (filename heuristic +
// deterministic pseudo-confidence) so the full workflow is testable without hardware
// or a trained model. Swap `classifyImage` with an ONNX/API provider when available.
import type { ClassificationResult, DeviceCategory } from "@/ecoscan/types";

export const MODEL_VERSION = "mock-clf-v0.3.0";
export const INFERENCE_STATUS_NOTE = "Simulated inference — not a trained vision model.";

export interface ClassifyOptions { fileName?: string; fileSizeBytes?: number; }

const KEYWORDS: { kw: string[]; cat: DeviceCategory }[] = [
  { kw: ["phone", "mobile", "iphone", "smartphone", "pixel", "galaxy"], cat: "mobile_phone" },
  { kw: ["remote", "tv_remote", "ir_"], cat: "remote_control" },
  { kw: ["laptop", "notebook", "macbook", "thinkpad"], cat: "laptop" },
  { kw: ["desktop", "tower", "pc_"], cat: "desktop" },
  { kw: ["monitor", "tv", "television", "display"], cat: "monitor_tv" },
  { kw: ["charger", "adapter", "power_brick"], cat: "charger_adapter" },
  { kw: ["pcb", "circuit", "motherboard"], cat: "circuit_board" },
  { kw: ["keyboard", "mouse"], cat: "keyboard_mouse" },
  { kw: ["battery", "cell", "aaa", "li-ion", "lipo"], cat: "battery" },
  { kw: ["cable", "usb", "hdmi", "wire", "cord"], cat: "cable" },
  { kw: ["speaker", "headphone", "earbud", "audio", "amp"], cat: "audio" },
  { kw: ["kettle", "iron", "trimmer", "toy", "appliance"], cat: "small_appliance" },
];

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

export async function classifyImage(dataUrl: string | null, opts: ClassifyOptions = {}): Promise<ClassificationResult> {
  // Simulate latency of real inference (300–700ms) for honest progress UI.
  await new Promise((r) => setTimeout(r, 350 + Math.floor(Math.random() * 300)));
  const name = (opts.fileName || "").toLowerCase();
  const hit = KEYWORDS.find((k) => k.kw.some((w) => name.includes(w)));
  if (hit) {
    const conf = 0.68 + hash01(name) * 0.27; // 0.68–0.95 deterministic
    return {
      category: hit.cat, confidence: Math.round(conf * 1000) / 1000,
      modelVersion: MODEL_VERSION, provider: "heuristic", simulated: true,
      at: new Date().toISOString(),
    };
  }
  // No filename signal -> low-confidence unknown (honest, never forced).
  const conf = 0.18 + hash01(name + (dataUrl?.length ?? 7)) * 0.25;
  return {
    category: "unknown", confidence: Math.round(conf * 1000) / 1000,
    modelVersion: MODEL_VERSION, provider: "mock", simulated: true,
    at: new Date().toISOString(),
  };
}

// Suggested demo image names that deterministically hit each class (for exhibition).
export const DEMO_IMAGE_HINTS = [
  "phone_demo.jpg", "remote_demo.jpg", "laptop_demo.jpg", "battery_swollen_demo.jpg",
  "cable_demo.jpg", "charger_demo.jpg", "pcb_demo.jpg",
];
