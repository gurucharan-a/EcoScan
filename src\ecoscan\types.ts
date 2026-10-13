// EcoScan domain model. Mirrors backend/app/models.py (SQLAlchemy) and
// prisma/ecoscan.prisma 1:1. Browser runtime persists this shape in localStorage.
export type DeviceCategory =
  | "mobile_phone" | "remote_control" | "laptop" | "desktop" | "monitor_tv"
  | "charger_adapter" | "circuit_board" | "keyboard_mouse" | "battery"
  | "cable" | "audio" | "small_appliance" | "unknown";

export const CATEGORIES: { id: DeviceCategory; label: string; hasBattery: boolean; hazardous: boolean }[] = [
  { id: "mobile_phone", label: "Mobile phones", hasBattery: true, hazardous: true },
  { id: "remote_control", label: "Remote controls", hasBattery: true, hazardous: false },
  { id: "laptop", label: "Laptops", hasBattery: true, hazardous: true },
  { id: "desktop", label: "Desktop computers", hasBattery: false, hazardous: false },
  { id: "monitor_tv", label: "Monitors & TVs", hasBattery: false, hazardous: true },
  { id: "charger_adapter", label: "Chargers & adapters", hasBattery: false, hazardous: false },
  { id: "circuit_board", label: "Circuit boards", hasBattery: false, hazardous: true },
  { id: "keyboard_mouse", label: "Keyboards & mice", hasBattery: false, hazardous: false },
  { id: "battery", label: "Batteries", hasBattery: true, hazardous: true },
  { id: "cable", label: "Cables", hasBattery: false, hazardous: false },
  { id: "audio", label: "Audio equipment", hasBattery: false, hazardous: false },
  { id: "small_appliance", label: "Small household electronics", hasBattery: false, hazardous: false },
  { id: "unknown", label: "Unknown / unclassified", hasBattery: false, hazardous: false },
];

export const categoryLabel = (c: DeviceCategory) =>
  CATEGORIES.find((x) => x.id === c)?.label ?? c;

export type ScanStatus =
  | "IDLE" | "SCANNING" | "ANALYZING" | "AWAITING_CONFIRMATION"
  | "READY_TO_SORT" | "SORTING" | "SORT_COMPLETE" | "FAILED" | "NEEDS_MANUAL_REVIEW";

export const SORT_FLOW: Record<ScanStatus, ScanStatus[]> = {
  IDLE: ["SCANNING"],
  SCANNING: ["ANALYZING", "FAILED"],
  ANALYZING: ["AWAITING_CONFIRMATION", "NEEDS_MANUAL_REVIEW", "FAILED"],
  AWAITING_CONFIRMATION: ["READY_TO_SORT", "NEEDS_MANUAL_REVIEW", "FAILED"],
  READY_TO_SORT: ["SORTING", "FAILED"],
  SORTING: ["SORT_COMPLETE", "FAILED"],
  SORT_COMPLETE: [],
  FAILED: ["SCANNING", "NEEDS_MANUAL_REVIEW"],
  NEEDS_MANUAL_REVIEW: ["READY_TO_SORT", "SCANNING"],
};

export function canScanTransition(from: ScanStatus, to: ScanStatus): boolean {
  return (SORT_FLOW[from] ?? []).includes(to);
}
export function assertScanTransition(from: ScanStatus, to: ScanStatus) {
  if (!canScanTransition(from, to)) throw new Error(`Illegal scan transition ${from} -> ${to}`);
}

export type RecommendationKind = "REUSE" | "REPAIR" | "RECYCLE" | "HAZARDOUS" | "MANUAL_REVIEW";

export interface ClassificationResult {
  category: DeviceCategory;
  confidence: number; // 0..1
  modelVersion: string;
  provider: "mock" | "heuristic" | "onnx" | "api";
  simulated: boolean;
  at: string;
}

export interface SensorReading {
  weightG: number | null;
  weightStable: boolean;
  cameraOk: boolean;
  loadCellOk: boolean;
  servoOk: boolean;
  rssiDbm: number | null;
  at: string;
  simulated: boolean;
}

export interface RecommendationResult {
  kind: RecommendationKind;
  explanation: string;
  evidence: string[];
  uncertainty: string[];
  ruleVersion: string;
  destination: SortDestination;
}

export type SortDestination = "REUSE_BIN" | "REPAIR_BIN" | "RECYCLE_BIN" | "HAZARDOUS_BIN" | "QUARANTINE";

export const DEST_LABEL: Record<SortDestination, string> = {
  REUSE_BIN: "Reuse bin",
  REPAIR_BIN: "Repair bin",
  RECYCLE_BIN: "Recycling bin",
  HAZARDOUS_BIN: "Hazardous bin",
  QUARANTINE: "Quarantine (manual review)",
};

export interface ComponentEstimate {
  component: string;
  material: string;
  massFraction: number | null; // null = qualitative only
  estimatedMassG: number | null;
  confidence: "high" | "medium" | "low" | "qualitative";
  destination: string;
}

export interface Scan {
  id: string;
  code: string; // EC-0001
  name: string;
  category: DeviceCategory;
  predictedCategory: DeviceCategory;
  confidence: number;
  modelVersion: string;
  inferenceSimulated: boolean;
  weightG: number | null;
  weightSimulated: boolean;
  imageDataUrl: string | null;
  imageName: string | null;
  brand?: string;
  model?: string;
  visibleDamage: string;
  operatingCondition: "powers_on" | "powers_on_issue" | "dead" | "untested";
  batteryPresent: boolean;
  batterySwollen: boolean;
  sensor: SensorReading | null;
  recommendation: RecommendationResult | null;
  status: ScanStatus;
  sortDestination: SortDestination | null;
  sortJobId: string | null;
  confirmed: boolean;
  confirmedCategory: DeviceCategory | null;
  createdAt: string;
  updatedAt: string;
  dataSources: string[];
}

export interface MaterialComponent {
  component: string;
  materials: string;
  massFractionMin: number | null;
  massFractionMax: number | null;
  recovery: string;
  handling: string;
  source: string;
  reliability: "high" | "medium" | "low" | "qualitative";
}

export interface MaterialProfile {
  category: DeviceCategory;
  version: string;
  typicalWeightG: [number, number];
  notes: string;
  limitations: string;
  components: MaterialComponent[];
  updatedAt: string;
}

export interface SortingJob {
  id: string;
  scanId: string;
  destination: SortDestination;
  status: "QUEUED" | "SENT" | "ACKED" | "COMPLETED" | "FAILED" | "TIMEOUT";
  mode: "simulated" | "hardware";
  servoAngle: number | null;
  attempts: number;
  lastError: string | null;
  ackAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SortingEvent {
  id: string; jobId: string; scanId: string; kind: string; detail: string; at: string;
}

export interface EcoDevice {
  id: string;
  name: string;
  board: string;
  firmware: string;
  online: boolean;
  lastSeen: string | null;
  rssiDbm: number | null;
  camera: "ok" | "fault" | "absent" | "unknown";
  loadCell: "ok" | "fault" | "absent" | "unknown";
  servo: "ok" | "fault" | "absent" | "unknown";
  mode: "simulated" | "hardware";
  telemetry: SensorReading[];
  errors: { msg: string; at: string }[];
}

export interface Bin {
  id: string;
  name: string;
  material: string;
  capacityL: number;
  itemCount: number;
  totalWeightG: number;
  fillEstimated: number; // 0..1 estimate from recorded items
  status: "COLLECTING" | "NEAR_CAPACITY" | "READY_FOR_PICKUP" | "HANDED_OVER" | "PROCESSED";
  location: string;
  batchId: string | null;
  recipient?: string;
  handoverAt?: string | null;
}

export interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  scanId?: string;
  deviceId?: string;
  acked: boolean;
  resolved: boolean;
  at: string;
}

export interface AuditEvent {
  id: string; actor: string; action: string; entity: string; entityId: string;
  payload: unknown; at: string;
}

export interface EcoSettings {
  confidenceThreshold: number; // below -> manual review
  autoSortAllowed: boolean;
  destMap: Record<RecommendationKind, SortDestination>;
  co2PerKg: number; // kg CO2e avoided per kg diverted (configurable, cited)
  co2Source: string;
  materialValuePerKg: number;
  mode: "demo" | "hardware";
  apiUrl: string;
  deviceTokenPresent: boolean;
}

export interface EcoDB {
  version: 1;
  scans: Scan[];
  jobs: SortingJob[];
  events: SortingEvent[];
  devices: EcoDevice[];
  bins: Bin[];
  alerts: Alert[];
  audit: AuditEvent[];
  profiles: MaterialProfile[];
  settings: EcoSettings;
  seq: number;
}
