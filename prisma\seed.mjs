// ServiceGrid database seed — deterministic demo workspace.
// Run:  npm run db:seed   (needs DATABASE_URL)
// Demo logins (password for all: demo123):
//   customer@servicegrid.demo / technician@servicegrid.demo (Arun Kumar) / admin@servicegrid.demo
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASS = bcrypt.hashSync("demo123", 10);

const SITES = [
  { id: "site-a", name: "Site A — Guindy Plant", code: "GND", lat: 13.0067, lng: 80.2206, address: "Guindy Industrial Estate, Chennai" },
  { id: "site-b", name: "Site B — Ambattur Works", code: "AMB", lat: 13.1143, lng: 80.1548, address: "Ambattur Industrial Estate, Chennai" },
  { id: "site-c", name: "Site C — Sriperumbudur Unit", code: "SRP", lat: 12.9689, lng: 79.9462, address: "SIPOT, Sriperumbudur" },
  { id: "site-d", name: "Site D — Oragadam Facility", code: "ORG", lat: 12.8183, lng: 79.9197, address: "SIPCOT Industrial Park, Oragadam" },
  { id: "site-e", name: "Site E — Chennai Central Warehouse", code: "CCW", lat: 13.1681, lng: 80.29, address: "Madhavaram Industrial Area, Chennai" },
];

const SKILLS = [
  ["Electrical", "Electrical"], ["Mechanical", "Mechanical"], ["HVAC", "Climate"],
  ["PLC", "Automation"], ["Automation", "Automation"], ["Networking", "Electrical"],
  ["Industrial Electronics", "Electrical"], ["Hydraulics", "Mechanical"], ["Pneumatics", "Mechanical"],
  ["Preventive Maintenance", "Reliability"], ["Troubleshooting", "Reliability"], ["Vibration", "Reliability"],
];

const MACHINES = [
  { id: "m-101", code: "M-101", name: "Hydraulic Press 150T", siteId: "site-a", status: "OPERATIONAL", skills: ["hydraulics", "welding"] },
  { id: "m-102", code: "M-102", name: "CNC Mill VMC-850", siteId: "site-a", status: "DEGRADED", skills: ["electrical", "plc"] },
  { id: "m-103", code: "M-103", name: "Air Compressor 75kW", siteId: "site-a", status: "OPERATIONAL", skills: ["compressor", "pneumatics"] },
  { id: "m-104", code: "M-104", name: "Conveyor Line C-4 (HERO)", siteId: "site-a", status: "DOWN", skills: ["electrical", "conveyor", "plc"] },
  { id: "m-105", code: "M-105", name: "Injection Moulder IM-22", siteId: "site-b", status: "OPERATIONAL", skills: ["hydraulics", "electrical"] },
  { id: "m-110", code: "M-110", name: "Chiller CH-500", siteId: "site-c", status: "OPERATIONAL", skills: ["compressor", "electrical"] },
];

const PARTS = [
  ["FLT-200", "Hydraulic Filter 200mic", 850], ["BRG-6205", "Bearing 6205-ZZ", 1200],
  ["SEAL-KIT", "Seal Kit Universal", 2400], ["BELT-V88", "V-Belt V88", 600],
  ["FUSE-10A", "Fuse 10A ceramic", 120], ["PLC-IO8", "PLC IO Module 8ch", 8500],
];

async function main() {
  for (const s of SKILLS) {
    await prisma.skill.upsert({ where: { name: s[0] }, update: { category: s[1] }, create: { name: s[0], category: s[1] } });
  }
  for (const s of SITES) {
    await prisma.site.upsert({ where: { code: s.code }, update: { ...s }, create: { ...s } });
  }
  for (const m of MACHINES) {
    await prisma.machine.upsert({
      where: { code: m.code },
      update: { ...m },
      create: { ...m, eligible: true, warrantyActive: true, contractActive: true },
    });
  }
  for (const [sku, name, cost] of PARTS) {
    for (const s of ["site-a", "site-b", "site-c"]) {
      await prisma.partInventory.upsert({
        where: { sku_siteId: { sku, siteId: s } },
        update: {},
        create: { sku, name, qty: 8, reservedQty: 0, siteId: s, unitCost: cost },
      });
    }
  }

  async function user(email, name, role, siteId) {
    return prisma.user.upsert({
      where: { email },
      update: { name, role, siteId, passwordHash: PASS, onboarded: true },
      create: { email, name, role, siteId, passwordHash: PASS, onboarded: true },
    });
  }

  const cust = await user("customer@servicegrid.demo", "Demo Customer", "CUSTOMER", "site-a");
  await prisma.customerProfile.upsert({
    where: { userId: cust.id },
    update: {},
    create: { userId: cust.id, company: "ABC Industries", phone: "+91-98400-11223", address: "Plot 14, Guindy Industrial Estate, Chennai", lat: 13.0067, lng: 80.2206, siteId: "site-a" },
  });
  await user("admin@servicegrid.demo", "Platform Administrator", "ADMIN", null);
  await user("ops@servicegrid.demo", "Operations Operator", "OPS_MANAGER", null);

  async function tech(email, name, siteId, skills, lat, lng, load) {
    const u = await user(email, name, "TECHNICIAN", siteId);
    const t = await prisma.technician.upsert({
      where: { userId: u.id },
      update: { name, siteId, skills, lat, lng, online: true, currentLoad: load, availability: 0.9 },
      create: { userId: u.id, name, siteId, skills, certifications: [], lat, lng, online: true, currentLoad: load, availability: 0.9, experienceYears: 5, region: "Chennai" },
    });
    for (const sk of skills) {
      const map = { electrical: "Electrical", plc: "PLC", automation: "Automation", mechanical: "Mechanical", hydraulics: "Hydraulics", pneumatics: "Pneumatics", hvac: "HVAC", networking: "Networking" };
      const skill = await prisma.skill.findUnique({ where: { name: map[sk] ?? sk } });
      if (skill) await prisma.technicianSkill.upsert({ where: { technicianId_skillId: { technicianId: t.id, skillId: skill.id } }, update: {}, create: { technicianId: t.id, skillId: skill.id } });
    }
    return t;
  }

  await tech("technician@servicegrid.demo", "Arun Kumar", "site-a", ["electrical", "plc", "automation"], 13.012, 80.224, 0.2);
  await tech("rahul@servicegrid.demo", "Rahul Menon", "site-b", ["mechanical", "hydraulics"], 13.11, 80.15, 0.4);
  await tech("priya@servicegrid.demo", "Priya Nair", "site-c", ["electrical", "networking", "automation"], 12.97, 79.95, 0.3);

  await prisma.setting.upsert({ where: { key: "slaHours" }, update: { value: { P1: 4, P2: 24, P3: 72, P4: 168 } }, create: { key: "slaHours", value: { P1: 4, P2: 24, P3: 72, P4: 168 } } });
  await prisma.setting.upsert({ where: { key: "matchWeights" }, update: { value: { skill: 0.5, distance: 0.25, availability: 0.15, workload: 0.1 } }, create: { key: "matchWeights", value: { skill: 0.5, distance: 0.25, availability: 0.15, workload: 0.1 } } });

  console.log("Seed complete: 4 sites staffed, 3 technicians, 1 customer, admin/ops, skills, parts, SLA + matching config.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
