"""EcoScan FastAPI backend — mirrors src/ecoscan/services/ecoStore.ts semantics.

Run locally (hardware mode):
    cd backend
    pip install -r requirements.txt
    uvicorn app.main:app --host 0.0.0.0 --port 8000

OpenAPI docs: http://localhost:8000/docs
The Vite frontend stays fully functional WITHOUT this server (local store);
set Settings -> API URL to point hardware mode at this server.
ESP32 authenticates with X-Device-Token (set DEVICE_TOKEN env, never commit it).
"""
from __future__ import annotations

import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = Path(os.environ.get("ECOSCAN_DB", str(Path(__file__).parent / "ecoscan.db")))
DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "dev-token-change-me")
MODEL_VERSION = "mock-clf-v0.3.0"
RULE_VERSION = "rules-v1.2.0"
PROFILE_VERSION = "v1.3.0"
CONF_THRESHOLD = 0.60

SERVO_ANGLE = {"REUSE_BIN": 30, "REPAIR_BIN": 70, "RECYCLE_BIN": 110, "HAZARDOUS_BIN": 150, "QUARANTINE": 90}
FLOW = {
    "IDLE": ["SCANNING"], "SCANNING": ["ANALYZING", "FAILED"],
    "ANALYZING": ["AWAITING_CONFIRMATION", "NEEDS_MANUAL_REVIEW", "FAILED"],
    "AWAITING_CONFIRMATION": ["READY_TO_SORT", "NEEDS_MANUAL_REVIEW", "FAILED"],
    "READY_TO_SORT": ["SORTING", "FAILED"], "SORTING": ["SORT_COMPLETE", "FAILED"],
    "SORT_COMPLETE": [], "FAILED": ["SCANNING", "NEEDS_MANUAL_REVIEW"],
    "NEEDS_MANUAL_REVIEW": ["READY_TO_SORT", "SCANNING"],
}

app = FastAPI(title="EcoScan API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    con = db()
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS scans(
          id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, category TEXT,
          predicted TEXT, confidence REAL, weight_g REAL, weight_sim INTEGER DEFAULT 0,
          image_name TEXT, damage TEXT DEFAULT '', condition TEXT DEFAULT 'untested',
          battery INTEGER DEFAULT 0, swollen INTEGER DEFAULT 0,
          recommendation TEXT, destination TEXT, status TEXT DEFAULT 'SCANNING',
          confirmed INTEGER DEFAULT 0, confirmed_category TEXT,
          model_version TEXT, rule_version TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE IF NOT EXISTS jobs(
          id TEXT PRIMARY KEY, scan_id TEXT, destination TEXT, status TEXT,
          mode TEXT, servo_angle REAL, attempts INTEGER DEFAULT 0,
          last_error TEXT, ack_at TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE IF NOT EXISTS telemetry(
          id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, payload TEXT, at TEXT);
        CREATE TABLE IF NOT EXISTS alerts(
          id TEXT PRIMARY KEY, severity TEXT, title TEXT, body TEXT,
          scan_id TEXT, acked INTEGER DEFAULT 0, resolved INTEGER DEFAULT 0, at TEXT);
        CREATE TABLE IF NOT EXISTS audit(
          id TEXT PRIMARY KEY, actor TEXT, action TEXT, entity TEXT,
          entity_id TEXT, payload TEXT, at TEXT);
        """
    )
    con.commit()
    con.close()


init_db()


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def audit(con: sqlite3.Connection, actor: str, action: str, entity: str, entity_id: str, payload: str = "{}") -> None:
    con.execute(
        "INSERT INTO alerts SELECT 0 WHERE 0"  # no-op keep linters calm
    ) if False else None
    con.execute(
        "INSERT INTO audit(id,actor,action,entity,entity_id,payload,at) VALUES(?,?,?,?,?,?,?)",
        (f"aud_{uuid.uuid4().hex[:10]}", actor, action, entity, entity_id, payload, now()),
    )


def need_token(token: Optional[str]) -> None:
    if token != DEVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid X-Device-Token")


# ---------- schemas ----------
class ScanIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    image_name: Optional[str] = None
    weight_g: Optional[float] = Field(default=None, ge=0, le=20000)
    weight_simulated: bool = True
    brand: Optional[str] = None
    model: Optional[str] = None
    visible_damage: str = ""
    operating_condition: Literal["powers_on", "powers_on_issue", "dead", "untested"] = "untested"
    battery_present: bool = False
    battery_swollen: bool = False


class ClassifyIn(BaseModel):
    category: str
    confidence: float = Field(ge=0, le=1)
    provider: Literal["mock", "heuristic", "onnx", "api"] = "mock"
    simulated: bool = True


class ConfirmIn(BaseModel):
    category: Optional[str] = None


class SortIn(BaseModel):
    destination: Optional[str] = None


class HeartbeatIn(BaseModel):
    rssi_dbm: Optional[int] = None
    camera_ok: bool = False
    load_cell_ok: bool = False
    servo_ok: bool = False
    weight_g: Optional[float] = None


class AckIn(BaseModel):
    ok: bool
    detail: str = ""


# ---------- routes ----------
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "model": MODEL_VERSION, "rules": RULE_VERSION, "profiles": PROFILE_VERSION, "time": now()}


@app.get("/api/dashboard/summary")
def summary() -> dict[str, Any]:
    con = db()
    scans = con.execute("SELECT status,recommendation,weight_g FROM scans").fetchall()
    jobs = con.execute("SELECT status FROM jobs").fetchall()
    con.close()
    total_w = sum((r["weight_g"] or 0) for r in scans)
    done = [j for j in jobs if j["status"] in ("COMPLETED", "FAILED")]
    ok = [j for j in done if j["status"] == "COMPLETED"]
    return {
        "total_scans": len(scans),
        "total_weight_g": total_w,
        "awaiting_review": sum(1 for r in scans if r["status"] in ("AWAITING_CONFIRMATION", "NEEDS_MANUAL_REVIEW")),
        "sort_success_rate": round(len(ok) / len(done) * 100, 1) if done else None,
    }


@app.post("/api/scans")
def create_scan(body: ScanIn) -> dict[str, Any]:
    con = db()
    n = con.execute("SELECT COUNT(*) c FROM scans").fetchone()["c"] + 1
    sid, code = f"scan_{uuid.uuid4().hex[:10]}", f"EC-{n:04d}"
    con.execute(
        "INSERT INTO scans(id,code,name,category,predicted,confidence,weight_g,weight_sim,image_name,damage,condition,battery,swollen,status,model_version,created_at,updated_at)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (sid, code, body.name, "unknown", "unknown", 0, body.weight_g, int(body.weight_simulated),
         body.image_name, body.visible_damage, body.operating_condition,
         int(body.battery_present), int(body.battery_swollen), "SCANNING", MODEL_VERSION, now(), now()),
    )
    audit(con, "operator", "scan.create", "scan", sid, code)
    con.commit()
    row = con.execute("SELECT * FROM scans WHERE id=?", (sid,)).fetchone()
    con.close()
    return dict(row)


@app.get("/api/scans")
def list_scans(q: str = "", category: str = "", status: str = "", limit: int = 50, offset: int = 0) -> dict[str, Any]:
    con = db()
    rows = con.execute("SELECT * FROM scans ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset)).fetchall()
    con.close()
    items = [dict(r) for r in rows]
    if q:
        t = q.lower()
        items = [r for r in items if t in (r["name"] + r["code"] + r["category"]).lower()]
    if category:
        items = [r for r in items if r["category"] == category]
    if status:
        items = [r for r in items if r["status"] == status]
    return {"items": items, "count": len(items)}


@app.get("/api/scans/{scan_id}")
def get_scan(scan_id: str) -> dict[str, Any]:
    con = db()
    row = con.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone()
    con.close()
    if not row:
        raise HTTPException(404, "Scan not found")
    return dict(row)


def transition(status: str, to: str) -> None:
    if to not in FLOW.get(status, []):
        raise HTTPException(400, f"Illegal scan transition {status} -> {to}")


@app.post("/api/scans/{scan_id}/classify")
def classify(scan_id: str, body: ClassifyIn) -> dict[str, Any]:
    con = db()
    row = con.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "Scan not found")
    transition(row["status"], "ANALYZING")
    nxt = "NEEDS_MANUAL_REVIEW" if (body.category == "unknown" or body.confidence < CONF_THRESHOLD) else "AWAITING_CONFIRMATION"
    con.execute(
        "UPDATE scans SET predicted=?,confidence=?,category=?,status=?,updated_at=? WHERE id=?",
        (body.category, body.confidence, body.category, nxt, now(), scan_id),
    )
    if nxt == "NEEDS_MANUAL_REVIEW":
        con.execute(
            "INSERT INTO alerts(id,severity,title,body,scan_id,at) VALUES(?,?,?,?,?,?)",
            (f"al_{uuid.uuid4().hex[:10]}", "warning", "Low classification confidence",
             f"{row['code']}: {body.category} at {body.confidence:.1%} — manual review required.", scan_id, now()),
        )
    audit(con, "ai", "scan.classify", "scan", scan_id, body.category)
    con.commit()
    out = dict(con.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone())
    con.close()
    return out


def rule_kind(category: str, conf: float, cond: str, swollen: bool) -> tuple[str, str]:
    if category == "unknown" or conf < CONF_THRESHOLD:
        return ("MANUAL_REVIEW", "QUARANTINE")
    if swollen or category == "battery":
        return ("HAZARDOUS", "HAZARDOUS_BIN")
    if cond == "powers_on":
        return ("REUSE", "REUSE_BIN")
    if cond in ("powers_on_issue", "dead", "untested") and category in (
        "mobile_phone", "laptop", "desktop", "monitor_tv", "audio", "small_appliance", "charger_adapter", "keyboard_mouse"):
        return ("REPAIR", "REPAIR_BIN")
    return ("RECYCLE", "RECYCLE_BIN")


@app.post("/api/scans/{scan_id}/recommendation")
def recommend(scan_id: str) -> dict[str, Any]:
    con = db()
    row = con.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "Scan not found")
    cat = row["confirmed_category"] or row["category"]
    kind, dest = rule_kind(cat, row["confidence"], row["condition"], bool(row["swollen"]))
    rec = f"{kind}|{dest}|{RULE_VERSION}"
    con.execute("UPDATE scans SET recommendation=?,destination=?,updated_at=? WHERE id=?", (rec, dest, now(), scan_id))
    if kind == "HAZARDOUS":
        con.execute("INSERT INTO alerts(id,severity,title,body,scan_id,at) VALUES(?,?,?,?,?,?)",
                    (f"al_{uuid.uuid4().hex[:10]}", "critical", "Hazardous item detected", f"{row['code']} routed to {dest}.", scan_id, now()))
    audit(con, "system", "scan.recommend", "scan", scan_id, kind)
    con.commit()
    out = dict(con.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone())
    con.close()
    return out


@app.post("/api/scans/{scan_id}/confirm")
def confirm(scan_id: str, body: ConfirmIn) -> dict[str, Any]:
    con = db()
    row = con.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "Scan not found")
    if row["status"] not in ("AWAITING_CONFIRMATION", "NEEDS_MANUAL_REVIEW"):
        con.close()
        raise HTTPException(400, f"Cannot confirm from state {row['status']}")
    cat = body.category or row["predicted"]
    con.execute("UPDATE scans SET category=?,confirmed=1,confirmed_category=?,status='READY_TO_SORT',updated_at=? WHERE id=?",
                (cat, cat, now(), scan_id))
    audit(con, "operator", "scan.confirm", "scan", scan_id, cat)
    con.commit()
    con.close()
    return recommend(scan_id)


@app.post("/api/scans/{scan_id}/sort")
def sort(scan_id: str, body: SortIn) -> dict[str, Any]:
    con = db()
    row = con.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "Scan not found")
    dest = body.destination or row["destination"]
    if not dest:
        con.close()
        raise HTTPException(400, "No destination")
    if not row["confirmed"]:
        con.close()
        raise HTTPException(400, "Scan must be confirmed first")
    if bool(row["swollen"]) and dest not in ("HAZARDOUS_BIN", "QUARANTINE"):
        con.close()
        raise HTTPException(400, "Safety interlock: swollen battery must go to Hazardous/Quarantine")
    transition(row["status"], "SORTING")
    jid = f"job_{uuid.uuid4().hex[:10]}"
    con.execute(
        "INSERT INTO jobs(id,scan_id,destination,status,mode,servo_angle,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        (jid, scan_id, dest, "SENT", "hardware", SERVO_ANGLE.get(dest, 90), now(), now()))
    con.execute("UPDATE scans SET status='SORTING',destination=?,updated_at=? WHERE id=?", (dest, now(), scan_id))
    audit(con, "operator", "sort.submit", "job", jid, dest)
    con.commit()
    out = dict(con.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone())
    con.close()
    return out


@app.get("/api/sorting/jobs/{job_id}")
def job(job_id: str) -> dict[str, Any]:
    con = db()
    row = con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    con.close()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)


@app.post("/api/devices/{device_id}/heartbeat")
def heartbeat(device_id: str, body: HeartbeatIn, x_device_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    need_token(x_device_token)
    con = db()
    con.execute("INSERT INTO telemetry(device_id,payload,at) VALUES(?,?,?)", (device_id, body.model_dump_json(), now()))
    audit(con, "device", "device.heartbeat", "device", device_id, body.model_dump_json())
    con.commit()
    con.close()
    return {"ok": True, "at": now()}


@app.post("/api/devices/{device_id}/commands")
def command(device_id: str, body: dict, x_device_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    need_token(x_device_token)
    return {"ok": True, "device": device_id, "echo": body}


@app.post("/api/sorting/jobs/{job_id}/ack")
def ack(job_id: str, body: AckIn, x_device_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    need_token(x_device_token)
    con = db()
    job = con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not job:
        con.close()
        raise HTTPException(404, "Job not found")
    if job["status"] == "COMPLETED":
        con.close()
        raise HTTPException(409, "Duplicate ack — job already completed")
    if body.ok:
        con.execute("UPDATE jobs SET status='COMPLETED',ack_at=?,updated_at=? WHERE id=?", (now(), now(), job_id))
        con.execute("UPDATE scans SET status='SORT_COMPLETE',updated_at=? WHERE id=?", (now(), job["scan_id"]))
    else:
        att = (job["attempts"] or 0) + 1
        st = "FAILED" if att >= 3 else "SENT"
        con.execute("UPDATE jobs SET status=?,attempts=?,last_error=?,updated_at=? WHERE id=?", (st, att, body.detail, now(), job_id))
        if st == "FAILED":
            con.execute("UPDATE scans SET status='FAILED' WHERE id=?", (job["scan_id"],))
    audit(con, "device", "sort.ack", "job", job_id, body.detail)
    con.commit()
    out = dict(con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())
    con.close()
    return out


@app.get("/api/material-profiles")
def profiles() -> dict[str, Any]:
    return {"version": PROFILE_VERSION, "note": "Category-level typical ranges; see frontend src/ecoscan/data/materialProfiles.ts for full table."}


@app.get("/api/collections")
def collections() -> dict[str, Any]:
    return {"bins": ["REUSE_BIN", "REPAIR_BIN", "RECYCLE_BIN", "HAZARDOUS_BIN", "QUARANTINE"],
            "note": "Bin ledger lives in the frontend store for offline demo; this endpoint lists canonical destinations."}


@app.get("/api/alerts")
def alerts() -> dict[str, Any]:
    con = db()
    rows = con.execute("SELECT * FROM alerts ORDER BY at DESC LIMIT 100").fetchall()
    con.close()
    return {"items": [dict(r) for r in rows]}


@app.get("/api/analytics/sustainability")
def sustainability() -> dict[str, Any]:
    return {"method": "diverted_kg × co2_per_kg (default 1.8, configurable)",
            "uncertainty": "±50% planning estimate; verified only on handover records."}


@app.get("/api/audit-log")
def audit_log(limit: int = 100) -> dict[str, Any]:
    con = db()
    rows = con.execute("SELECT * FROM audit ORDER BY at DESC LIMIT ?", (limit,)).fetchall()
    con.close()
    return {"items": [dict(r) for r in rows]}


@app.get("/api/devices")
def devices() -> dict[str, Any]:
    con = db()
    row = con.execute("SELECT device_id,at FROM telemetry ORDER BY id DESC LIMIT 1").fetchone()
    con.close()
    return {"devices": [{"id": "esp32-01", "board": "ESP32-WROVER + OV2640",
                         "last_seen": row["at"] if row else None,
                         "online": bool(row)}]}
