import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app.main as m  # noqa: E402


def _client(tmp_path):
    m.DB_PATH = tmp_path / "t.db"
    m.init_db()
    return TestClient(m.app)


def test_full_scan_lifecycle(tmp_path):
    c = _client(tmp_path)
    assert c.get("/api/health").json()["ok"] is True
    s = c.post("/api/scans", json={"name": "remote", "weight_g": 82}).json()
    assert s["status"] == "SCANNING"
    s2 = c.post(f"/api/scans/{s['id']}/classify",
                json={"category": "remote_control", "confidence": 0.88}).json()
    assert s2["status"] == "AWAITING_CONFIRMATION"
    r = c.post(f"/api/scans/{s['id']}/recommendation").json()
    assert "REUSE" in (r["recommendation"] or "") or r["destination"] == "REUSE_BIN"
    c2 = c.post(f"/api/scans/{s['id']}/confirm", json={}).json()
    assert c2["status"] in ("READY_TO_SORT", "SORTING", "SORT_COMPLETE")
    j = c.post(f"/api/scans/{s['id']}/sort", json={}).json()
    assert j["status"] == "SENT"
    a = c.post(f"/api/sorting/jobs/{j['id']}/ack", json={"ok": True, "detail": "bench ack"},
               headers={"X-Device-Token": "dev-token-change-me"}).json()
    assert a["status"] == "COMPLETED"


def test_low_confidence_goes_to_review(tmp_path):
    c = _client(tmp_path)
    s = c.post("/api/scans", json={"name": "blur"}).json()
    s2 = c.post(f"/api/scans/{s['id']}/classify",
                json={"category": "unknown", "confidence": 0.2}).json()
    assert s2["status"] == "NEEDS_MANUAL_REVIEW"


def test_swollen_battery_interlock(tmp_path):
    c = _client(tmp_path)
    s = c.post("/api/scans", json={"name": "pack", "battery_swollen": True}).json()
    c.post(f"/api/scans/{s['id']}/classify",
           json={"category": "battery", "confidence": 0.94})
    r = c.post(f"/api/scans/{s['id']}/recommendation").json()
    assert r["destination"] == "HAZARDOUS_BIN"
    c.post(f"/api/scans/{s['id']}/confirm", json={})
    bad = c.post(f"/api/scans/{s['id']}/sort", json={"destination": "RECYCLE_BIN"})
    assert bad.status_code == 400


def test_illegal_transition_rejected(tmp_path):
    c = _client(tmp_path)
    s = c.post("/api/scans", json={"name": "x"}).json()
    bad = c.post(f"/api/scans/{s['id']}/sort", json={})
    assert bad.status_code == 400
