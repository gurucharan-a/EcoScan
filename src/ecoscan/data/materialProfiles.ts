// Versioned category-level composition database.
// All mass fractions are TYPICAL RANGES from teardown literature, not measurements
// of any specific item. Estimates = measured weight × fraction. Where sources are
// weak the component is marked qualitative and no mass is computed.
import type { MaterialProfile } from "@/ecoscan/types";

export const PROFILE_VERSION = "v1.3.0";

const P = (
  category: MaterialProfile["category"],
  typicalWeightG: [number, number],
  notes: string,
  limitations: string,
  components: MaterialProfile["components"],
): MaterialProfile => ({
  category, version: PROFILE_VERSION, typicalWeightG, notes, limitations,
  components, updatedAt: "2026-09-15T00:00:00Z",
});

export const MATERIAL_PROFILES: MaterialProfile[] = [
  P("mobile_phone", [120, 220],
    "Typical bar-type smartphone incl. battery. Source: teardown surveys (Baldé et al., UNU; iFixit teardowns).",
    "Category average — 5G flagships skew heavier on PCB/cameras; feature phones far lighter.",
    [
      { component: "Display assembly", materials: "Glass, LCD/OLED, indium-tin-oxide", massFractionMin: 0.18, massFractionMax: 0.25, recovery: "Glass recovery; ITO trace indium", handling: "Sharp edges — gloves", source: "UNU e-waste monitor teardown tables", reliability: "medium" },
      { component: "Battery (Li-ion pouch)", materials: "LiCoO₂/graphite, Al/Cu foil, electrolyte", massFractionMin: 0.22, massFractionMax: 0.30, recovery: "Licensed battery recycler only", handling: "HAZARD: puncture/fire risk; never crush", source: "Battery University teardown weights", reliability: "high" },
      { component: "Main PCB + shields", materials: "FR-4, Cu, Au, Ag, Pd, Sn", massFractionMin: 0.10, massFractionMax: 0.15, recovery: "Smelter / PCB refiner (Cu, Au recovery)", handling: "Lead-free but solder dust — wash hands", source: "Cucchiella et al. PCB metal content", reliability: "medium" },
      { component: "Enclosure + midframe", materials: "Al alloy / polycarbonate", massFractionMin: 0.18, massFractionMax: 0.25, recovery: "Al scrap / plastic granulation", handling: "Standard", source: "iFixit teardown mass splits", reliability: "medium" },
      { component: "Cameras, speakers, misc", materials: "Mixed e-components", massFractionMin: 0.08, massFractionMax: 0.12, recovery: "PCB stream", handling: "Standard", source: "Teardown surveys", reliability: "low" },
    ]),
  P("remote_control", [60, 140],
    "IR TV/set-top remote incl. 2×AAA compartment. Excludes batteries by default.",
    "Batteries may or may not be present — weighed separately when present.",
    [
      { component: "Plastic enclosure", materials: "ABS", massFractionMin: 0.45, massFractionMax: 0.60, recovery: "ABS granulation", handling: "Standard", source: "Teardown weighing (EcoScan lab sample n=6)", reliability: "medium" },
      { component: "Printed circuit board", materials: "FR-4, Cu, carbon contacts", massFractionMin: 0.10, massFractionMax: 0.18, recovery: "PCB refiner stream", handling: "Standard", source: "EcoScan lab sample", reliability: "medium" },
      { component: "Buttons + conductive contacts", materials: "Silicone, carbon ink", massFractionMin: 0.08, massFractionMax: 0.14, recovery: "General e-waste stream", handling: "Standard", source: "EcoScan lab sample", reliability: "low" },
      { component: "IR LED + lens", materials: "GaAs LED, acrylic lens", massFractionMin: null, massFractionMax: null, recovery: "General e-waste stream", handling: "Standard", source: "Qualitative — too light to weigh reliably", reliability: "qualitative" },
      { component: "Battery compartment + contacts", materials: "ABS, nickel-plated steel", massFractionMin: 0.06, massFractionMax: 0.10, recovery: "Metal + plastic streams", handling: "Remove batteries first", source: "EcoScan lab sample", reliability: "medium" },
      { component: "Batteries if present (2×AAA)", materials: "Alkaline Zn/MnO₂", massFractionMin: null, massFractionMax: null, recovery: "Battery collection point", handling: "Tape terminals if leaking", source: "Weighed only when present", reliability: "qualitative" },
    ]),
  P("laptop", [1100, 2500],
    "14–16″ notebook incl. battery. Workstation/mobile gaming units exceed range.",
    "RAM/SSD upgrades change fractions; battery wear changes mass.",
    [
      { component: "Display + lid", materials: "Glass, Al/Mg, backlight", massFractionMin: 0.20, massFractionMax: 0.28, recovery: "Display recycler (Hg-free LED check)", handling: "Check CCFL vs LED on units pre-2012", source: "UNU teardown tables", reliability: "medium" },
      { component: "Battery pack", materials: "Li-ion 18650/pouch cells", massFractionMin: 0.15, massFractionMax: 0.25, recovery: "Licensed battery recycler", handling: "HAZARD: swollen packs isolate + quarantine", source: "OEM spec sheets", reliability: "high" },
      { component: "Mainboard + CPU/GPU", materials: "FR-4, Cu, Au, solder", massFractionMin: 0.08, massFractionMax: 0.12, recovery: "PCB refiner", handling: "Standard", source: "Cucchiella et al.", reliability: "medium" },
      { component: "Chassis + keyboard + cooling", materials: "Al/Mg alloy, ABS, Cu heatpipes", massFractionMin: 0.30, massFractionMax: 0.42, recovery: "Metal + plastic streams", handling: "Standard", source: "iFixit mass splits", reliability: "medium" },
      { component: "Storage + RAM + misc", materials: "Mixed", massFractionMin: 0.03, massFractionMax: 0.06, recovery: "Reuse优先: test SSD/RAM for reuse", handling: "Data wipe before reuse", source: "Teardown surveys", reliability: "low" },
    ]),
  P("desktop", [6000, 12000],
    "Tower chassis incl. PSU, excl. monitor/peripherals.",
    "GPU and HDD count dominate variance; SSD-only builds lighter.",
    [
      { component: "Steel chassis", materials: "Galvanized steel", massFractionMin: 0.35, massFractionMax: 0.50, recovery: "Ferrous scrap", handling: "Sharp edges", source: "Teardown weighing", reliability: "medium" },
      { component: "Power supply", materials: "Steel, Cu, ferrite, PCB", massFractionMin: 0.10, massFractionMax: 0.18, recovery: "E-waste stream; capacitors discharge", handling: "Capacitor shock risk — trained staff", source: "OEM specs", reliability: "medium" },
      { component: "Motherboard + cards", materials: "FR-4, Cu, Au", massFractionMin: 0.08, massFractionMax: 0.12, recovery: "PCB refiner", handling: "Standard", source: "Cucchiella et al.", reliability: "medium" },
      { component: "Drives + fans + cables", materials: "Mixed", massFractionMin: 0.08, massFractionMax: 0.15, recovery: "Mixed streams; HDD magnets recoverable", handling: "Data wipe HDDs/SSDs", source: "Teardown surveys", reliability: "low" },
    ]),
  P("monitor_tv", [2500, 9000],
    "LED/LCD flat panel. CRT units are heavier and contain leaded glass — flagged hazardous.",
    "Panel size dominates; CRT must be handled as separate hazardous stream.",
    [
      { component: "LCD panel + glass", materials: "Glass, liquid crystals, ITO", massFractionMin: 0.30, massFractionMax: 0.45, recovery: "Panel glass recycler", handling: "Fragile — mercury check on CCFL units", source: "UNU monitor tables", reliability: "medium" },
      { component: "Backlight unit (LED)", materials: "LEDs, PMMA diffuser", massFractionMin: 0.05, massFractionMax: 0.10, recovery: "E-waste stream", handling: "Standard for LED; CCFL = Hg hazard", source: "UNU tables", reliability: "low" },
      { component: "PCBs + power board", materials: "FR-4, Cu", massFractionMin: 0.08, massFractionMax: 0.12, recovery: "PCB refiner", handling: "Capacitor discharge", source: "Teardown surveys", reliability: "medium" },
      { component: "Housing + stand", materials: "ABS/HIPS, steel", massFractionMin: 0.25, massFractionMax: 0.40, recovery: "Plastic + steel streams", handling: "Standard", source: "Teardown weighing", reliability: "medium" },
    ]),
  P("charger_adapter", [40, 300],
    "Phone/laptop adapters incl. cable where attached.",
    "GaN units lighter for same wattage.",
    [
      { component: "Casing", materials: "PC/ABS flame-retardant", massFractionMin: 0.25, massFractionMax: 0.40, recovery: "Plastic stream", handling: "Standard", source: "Teardown weighing", reliability: "medium" },
      { component: "PCB + transformer", materials: "Cu, ferrite, FR-4", massFractionMin: 0.35, massFractionMax: 0.50, recovery: "Cu recovery via e-waste stream", handling: "Standard", source: "Teardown surveys", reliability: "medium" },
      { component: "Cable + plug", materials: "Cu, PVC/TPE", massFractionMin: 0.15, massFractionMax: 0.30, recovery: "Wire granulator (Cu)", handling: "Standard", source: "Teardown weighing", reliability: "medium" },
    ]),
  P("circuit_board", [20, 500],
    "Bare/assembled PCB without enclosure.",
    "Metal value varies 10× with gold content — assay needed for valuation.",
    [
      { component: "Substrate", materials: "FR-4 glass/epoxy", massFractionMin: 0.55, massFractionMax: 0.70, recovery: "Smelter feed", handling: "Dust mask when cutting", source: "Cucchiella et al.", reliability: "medium" },
      { component: "Copper traces + planes", materials: "Cu ~15–25%", massFractionMin: 0.15, massFractionMax: 0.25, recovery: "Cu smelter", handling: "Standard", source: "Cucchiella et al.", reliability: "medium" },
      { component: "Precious metals", materials: "Au/Ag/Pd traces", massFractionMin: null, massFractionMax: null, recovery: "Precious-metal refiner", handling: "Standard", source: "Qualitative — needs assay", reliability: "qualitative" },
      { component: "Solder + components", materials: "Sn/Ag/Cu, ceramics", massFractionMin: 0.08, massFractionMax: 0.15, recovery: "Smelter feed", handling: "Lead check on pre-2006 boards", source: "Teardown surveys", reliability: "low" },
    ]),
  P("keyboard_mouse", [60, 900],
    "USB/wireless keyboard or mouse.",
    "Mechanical keyboards heavier (steel plate).",
    [
      { component: "Keycaps + case", materials: "ABS/PBT", massFractionMin: 0.45, massFractionMax: 0.60, recovery: "Plastic stream", handling: "Standard", source: "Teardown weighing", reliability: "medium" },
      { component: "PCB + switches/sensor", materials: "FR-4, Cu, switches", massFractionMin: 0.15, massFractionMax: 0.30, recovery: "E-waste stream", handling: "Standard", source: "Teardown surveys", reliability: "low" },
      { component: "Cable / battery", materials: "Cu/PVC or AAA cell", massFractionMin: 0.05, massFractionMax: 0.15, recovery: "Wire or battery stream", handling: "Remove battery first", source: "Teardown weighing", reliability: "low" },
    ]),
  P("battery", [15, 600],
    "Loose cells/packs (alkaline, Li-ion, NiMH, lead-acid small).",
    "Chemistry determines handling — never mix streams unsorted.",
    [
      { component: "Active cell chemistry", materials: "Li/alkaline/Pb depending on type", massFractionMin: 0.60, massFractionMax: 0.80, recovery: "Chemistry-specific recycler", handling: "HAZARD: tape terminals, isolate damage", source: "Battery University", reliability: "high" },
      { component: "Casing + terminals", materials: "Steel/Al/Ni", massFractionMin: 0.15, massFractionMax: 0.30, recovery: "Metal stream post-discharge", handling: "Standard after discharge", source: "Battery University", reliability: "medium" },
    ]),
  P("cable", [20, 400],
    "Power/USB/HDMI loose cables.",
    "Copper yield ~40–60% by mass for thick power cables.",
    [
      { component: "Copper conductors", materials: "Cu", massFractionMin: 0.40, massFractionMax: 0.60, recovery: "Wire granulator", handling: "Standard", source: "Scrap yield tables", reliability: "medium" },
      { component: "Insulation + jacket", materials: "PVC/TPE/rubber", massFractionMin: 0.35, massFractionMax: 0.55, recovery: "Plastic stream / energy recovery", handling: "PVC — no open burning", source: "Scrap tables", reliability: "medium" },
      { component: "Connectors", materials: "Ni/Au-plated brass, plastic", massFractionMin: 0.05, massFractionMax: 0.12, recovery: "E-waste stream", handling: "Standard", source: "Teardown weighing", reliability: "low" },
    ]),
  P("audio", [150, 4000],
    "Speakers, headphones, earbuds, small amps.",
    "Magnet mass dominates large speakers.",
    [
      { component: "Drivers + magnets", materials: "Ferrite/NdFeB, paper/polymer cone", massFractionMin: 0.25, massFractionMax: 0.45, recovery: "Magnet + steel streams", handling: "Pinch hazard on large drivers", source: "Teardown surveys", reliability: "low" },
      { component: "Enclosure", materials: "ABS/wood/MDF", massFractionMin: 0.30, massFractionMax: 0.50, recovery: "Plastic/wood streams", handling: "Standard", source: "Teardown weighing", reliability: "medium" },
      { component: "Electronics + battery", materials: "PCB, Li-ion (BT units)", massFractionMin: 0.05, massFractionMax: 0.20, recovery: "PCB / battery streams", handling: "Remove battery first", source: "Teardown surveys", reliability: "low" },
    ]),
  P("small_appliance", [300, 3000],
    "Kettles, irons, trimmers, toys with electronics.",
    "Heating elements and motors dominate; very heterogeneous class.",
    [
      { component: "Heating element / motor", materials: "NiCr, Cu, steel", massFractionMin: 0.20, massFractionMax: 0.40, recovery: "Metal streams", handling: "Standard", source: "Teardown surveys", reliability: "low" },
      { component: "Housing", materials: "PP/ABS/steel", massFractionMin: 0.35, massFractionMax: 0.55, recovery: "Plastic/metal streams", handling: "Standard", source: "Teardown weighing", reliability: "medium" },
      { component: "Controls + cord", materials: "Mixed", massFractionMin: 0.10, massFractionMax: 0.20, recovery: "E-waste stream", handling: "Standard", source: "Teardown surveys", reliability: "low" },
    ]),
  P("unknown", [0, 0],
    "No composition available until a category is confirmed.",
    "Predictions below threshold must not be assigned a category profile.",
    []),
];

export const getProfile = (category: string): MaterialProfile =>
  MATERIAL_PROFILES.find((p) => p.category === category) ?? MATERIAL_PROFILES[MATERIAL_PROFILES.length - 1];
