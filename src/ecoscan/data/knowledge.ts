// EcoScan Knowledge & Safe Disposal Center — content base (reviewed Sept 2026).
// Each entry carries source + updated date. Location-specific recyclers are NOT
// fabricated: the app says "no verified local points configured" until an operator adds one.

export const GUIDES = [
  {
    id: "batteries",
    title: "Battery safety (all chemistries)",
    body: "Tape both terminals with non-conductive tape. Never crush, puncture, or refrigerate damaged cells. A swollen pouch or hot cell goes into a fire-safe container outdoors and to a battery collection point — never into household bins. Leaking alkaline cells: gloves + eye protection, wipe with vinegar solution, bag separately.",
    source: "Battery University BU-705; CPCB battery handling guidance",
    updated: "2026-09-10",
  },
  {
    id: "phones",
    title: "Phones, laptops & tablets",
    body: "Back up and factory-reset, remove SIM/SD, sign out of device-lock accounts (FRP/Activation Lock) or reuse is impossible. If the battery is swollen, do not charge or power on. Prefer reuse → certified repair → authorized recycler, in that order.",
    source: "Baldé et al., Global E-waste Monitor; manufacturer take-back pages",
    updated: "2026-09-10",
  },
  {
    id: "screens",
    title: "Monitors & TVs (esp. old units)",
    body: "Pre-2012 CCFL-backlit LCDs contain small mercury lamps — do not break the panel. CRT units contain leaded glass and go only to authorized handlers. LED panels are lower-risk but still e-waste.",
    source: "UNU e-waste monitor technical annex",
    updated: "2026-09-10",
  },
  {
    id: "repair-vs-replace",
    title: "Repair vs replace heuristic",
    body: "Repair is usually defensible when: the device is <5 years old, spare parts exist, repair quote is <60% of a replacement, and no swollen battery or board-level burn is present. EcoScan applies this as a provisional rule — a bench technician makes the final call.",
    source: "EcoScan rules-v1.2.0 rationale; iFixit repairability notes",
    updated: "2026-09-12",
  },
  {
    id: "recycling",
    title: "Responsible recycling steps",
    body: "1) Remove batteries. 2) Wipe personal data (phones/PCs). 3) Keep screens intact. 4) Hand over to an authorized collection point and keep the receipt/batch ID. 5) Record the batch ID in EcoScan Collections so diversion becomes verified, not estimated.",
    source: "CPCB E-Waste Management Rules summary",
    updated: "2026-09-12",
  },
  {
    id: "data-wipe",
    title: "Data sanitization before reuse",
    body: "Phones: encrypted factory reset. Laptops/desktops: OS reinstall after full-disk wipe (NIST 800-88 Clear/Purge guidance). SSDs: vendor secure-erase. When in doubt, remove and retain the drive and recycle the rest.",
    source: "NIST SP 800-88 Rev.1 summary",
    updated: "2026-09-12",
  },
];

export const FAQS = [
  { q: "Can a photo tell what's inside my device?", a: "No. EcoScan identifies the likely device category from the photo, then looks up typical composition from a database. It never claims to have seen internal parts. Only measured weight comes from a sensor; everything else is an estimate or needs manual confirmation." },
  { q: "Why is my item 'Unknown / manual review'?", a: "Confidence was below the 60% threshold (configurable). The classifier refuses to force a class — confirm the category manually and the analysis unlocks." },
  { q: "Why can't I auto-sort a swollen battery?", a: "Safety interlock: swollen/leaking batteries, unknown items, and low-confidence predictions are blocked from ordinary bins and route to Hazardous/Quarantine." },
  { q: "Are the CO₂ savings real?", a: "They are planning estimates (diverted kg × a configurable factor, default 1.8 kgCO₂e/kg, ±50%). Savings are verified only when a handover/processing record exists in Collections." },
  { q: "Where do I drop e-waste near me?", a: "EcoScan ships with no pre-loaded local recyclers (we don't fabricate them). Ask your operator to configure verified collection points in Settings → Collection points, or check your municipal / producer take-back program." },
];
