"""Backend tests for Tools module new features: seed, warehouses, batch assignments, returns, transfers."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-control-36.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "aeortega"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---- Seed ----
def test_seed_test_data(h):
    r = requests.post(f"{API}/tools/seed-test-data", headers=h, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True
    assert d["tools_creadas"] == 20
    assert d["ciudades_procesadas"] >= 1
    assert d["tecnicos_creados"] == 5 * d["ciudades_procesadas"]
    assert d["bodegas_totales"] >= d["ciudades_procesadas"]


def test_seed_requires_admin():
    # Unauth
    r = requests.post(f"{API}/tools/seed-test-data", timeout=15)
    assert r.status_code in (401, 403)


# ---- Warehouses ----
def test_list_warehouses(h):
    r = requests.get(f"{API}/tools/warehouses", headers=h, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    for w in data:
        assert "id" in w and "ciudad" in w and "nombre" in w
        assert "_id" not in w


# ---- Batch assignment: technician ----
def test_batch_assign_technician_and_pdf(h):
    tools = requests.get(f"{API}/tools/tools", headers=h).json()
    techs = requests.get(f"{API}/tools/technicians", headers=h).json()
    active_tools = [t for t in tools if t.get("estado") == "Activa"]
    assert techs and active_tools
    tech = techs[0]
    # Find 2 unassigned active tools
    current = requests.get(f"{API}/tools/reports/current", headers=h).json()
    busy = {a["tool_id"] for a in current}
    free = [t for t in active_tools if t["id"] not in busy][:2]
    assert len(free) == 2
    payload = {
        "technician_id": tech["id"],
        "tool_ids": [t["id"] for t in free],
        "destination_type": "technician",
    }
    r = requests.post(f"{API}/tools/assignments/batch", headers=h, json=payload, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["destination_type"] == "technician"
    assert d["total_herramientas"] == 2
    batch_id = d["batch_id"]
    # Download PDF
    pr = requests.get(f"{API}/tools/assignments/batch/{batch_id}/pdf", headers=h, timeout=30)
    assert pr.status_code == 200
    assert pr.headers.get("content-type", "").startswith("application/pdf")
    assert pr.content[:4] == b"%PDF"
    return {"tech_id": tech["id"], "tool_ids": payload["tool_ids"]}


# ---- Batch assignment: warehouse ----
def test_batch_assign_warehouse(h):
    tools = requests.get(f"{API}/tools/tools", headers=h).json()
    whs = requests.get(f"{API}/tools/warehouses", headers=h).json()
    assert whs
    wh = whs[0]
    current = requests.get(f"{API}/tools/reports/current", headers=h).json()
    busy = {a["tool_id"] for a in current}
    # Also check current warehouse tools to avoid duplicating
    at_wh = requests.get(f"{API}/tools/warehouses/{wh['id']}/tools", headers=h).json()
    busy |= {a["tool_id"] for a in at_wh}
    free = [t for t in tools if t.get("estado") == "Activa" and t["id"] not in busy][:2]
    assert len(free) >= 1
    payload = {
        "warehouse_id": wh["id"],
        "tool_ids": [t["id"] for t in free],
        "destination_type": "warehouse",
    }
    r = requests.post(f"{API}/tools/assignments/batch", headers=h, json=payload, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["destination_type"] == "warehouse"
    # Verify GET /warehouses/{id}/tools reflects new tools
    at_wh2 = requests.get(f"{API}/tools/warehouses/{wh['id']}/tools", headers=h).json()
    codes = {a["tool_id"] for a in at_wh2}
    for tid in payload["tool_ids"]:
        assert tid in codes


def test_batch_missing_warehouse_id_error(h):
    r = requests.post(f"{API}/tools/assignments/batch", headers=h,
                      json={"tool_ids": ["x"], "destination_type": "warehouse"}, timeout=15)
    assert r.status_code == 400


# ---- Reports must exclude warehouse ----
def test_reports_exclude_warehouse(h):
    cur = requests.get(f"{API}/tools/reports/current", headers=h).json()
    hist = requests.get(f"{API}/tools/reports/history", headers=h).json()
    for a in cur + hist:
        assert a.get("destination_type") != "warehouse", f"warehouse leak: {a}"


# ---- Returns ----
def test_return_batch_flow(h):
    # Setup: assign 2 fresh tools to a tech, then return them
    tools = requests.get(f"{API}/tools/tools", headers=h).json()
    techs = requests.get(f"{API}/tools/technicians", headers=h).json()
    # Prefer tech with ciudad
    tech = next((t for t in techs if t.get("ciudad")), None)
    assert tech
    current = requests.get(f"{API}/tools/reports/current", headers=h).json()
    busy = {a["tool_id"] for a in current}
    whs = requests.get(f"{API}/tools/warehouses", headers=h).json()
    wh_tool_ids = set()
    for w in whs:
        at = requests.get(f"{API}/tools/warehouses/{w['id']}/tools", headers=h).json()
        wh_tool_ids |= {a["tool_id"] for a in at}
    free = [t for t in tools if t.get("estado") == "Activa" and t["id"] not in busy and t["id"] not in wh_tool_ids][:2]
    assert len(free) == 2
    ap = {"technician_id": tech["id"], "tool_ids": [t["id"] for t in free], "destination_type": "technician"}
    r = requests.post(f"{API}/tools/assignments/batch", headers=h, json=ap, timeout=60)
    assert r.status_code == 200, r.text
    # Get current assignments for this tech
    cur2 = requests.get(f"{API}/tools/reports/current", headers=h, params={"technician_id": tech["id"]}).json()
    aids = [a["id"] for a in cur2 if a["tool_id"] in {t["id"] for t in free}]
    assert len(aids) == 2
    # Return them
    rr = requests.post(f"{API}/tools/returns", headers=h,
                       json={"technician_id": tech["id"], "assignment_ids": aids}, timeout=60)
    assert rr.status_code == 200, rr.text
    ret = rr.json()
    assert ret["total_herramientas"] == 2
    assert ret["warehouse_id"]
    # PDF
    pr = requests.get(f"{API}/tools/returns/{ret['batch_id']}/pdf", headers=h, timeout=30)
    assert pr.status_code == 200 and pr.content[:4] == b"%PDF"
    # Verify tools now in warehouse
    at = requests.get(f"{API}/tools/warehouses/{ret['warehouse_id']}/tools", headers=h).json()
    codes = {a["tool_id"] for a in at}
    for t in free:
        assert t["id"] in codes


# ---- Transfers ----
def test_transfer_flow(h):
    whs = requests.get(f"{API}/tools/warehouses", headers=h).json()
    assert len(whs) >= 2
    # Find a source warehouse with at least 1 tool
    src = None
    tools_at_src = []
    for w in whs:
        at = requests.get(f"{API}/tools/warehouses/{w['id']}/tools", headers=h).json()
        if at:
            src = w
            tools_at_src = at
            break
    assert src, "No warehouse has tools; cannot test transfer"
    dst = next(w for w in whs if w["id"] != src["id"])
    tool_ids = [tools_at_src[0]["tool_id"]]
    r = requests.post(f"{API}/tools/transfers", headers=h,
                      json={"from_warehouse_id": src["id"], "to_warehouse_id": dst["id"],
                            "tool_ids": tool_ids, "notas": "test transfer"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    batch_id = d["batch_id"]
    # PDF
    pr = requests.get(f"{API}/tools/transfers/{batch_id}/pdf", headers=h, timeout=30)
    assert pr.status_code == 200 and pr.content[:4] == b"%PDF"
    # In destination warehouse
    at_dst = requests.get(f"{API}/tools/warehouses/{dst['id']}/tools", headers=h).json()
    assert any(a["tool_id"] == tool_ids[0] for a in at_dst)
    # Not in source
    at_src = requests.get(f"{API}/tools/warehouses/{src['id']}/tools", headers=h).json()
    assert all(a["tool_id"] != tool_ids[0] for a in at_src)


def test_transfer_same_warehouse_rejected(h):
    whs = requests.get(f"{API}/tools/warehouses", headers=h).json()
    w = whs[0]
    r = requests.post(f"{API}/tools/transfers", headers=h,
                      json={"from_warehouse_id": w["id"], "to_warehouse_id": w["id"], "tool_ids": ["x"]}, timeout=15)
    assert r.status_code == 400


def test_transfer_tool_not_in_source_rejected(h):
    whs = requests.get(f"{API}/tools/warehouses", headers=h).json()
    assert len(whs) >= 2
    src, dst = whs[0], whs[1]
    # Pick a tool that is NOT at src
    tools = requests.get(f"{API}/tools/tools", headers=h).json()
    at_src = requests.get(f"{API}/tools/warehouses/{src['id']}/tools", headers=h).json()
    src_ids = {a["tool_id"] for a in at_src}
    outside = next((t["id"] for t in tools if t["id"] not in src_ids), None)
    assert outside
    r = requests.post(f"{API}/tools/transfers", headers=h,
                      json={"from_warehouse_id": src["id"], "to_warehouse_id": dst["id"],
                            "tool_ids": [outside]}, timeout=15)
    assert r.status_code == 400


def test_list_transfers(h):
    r = requests.get(f"{API}/tools/transfers", headers=h, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for t in data:
        assert "_id" not in t
        assert "pdf_hex" not in t


# ---- Dashboard ----
def test_tools_dashboard(h):
    r = requests.get(f"{API}/tools/dashboard", headers=h, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "kpis" in d and "ciudades" in d
    for k in ("total_activa", "total_valor", "count_tools", "count_activas", "count_inactivas"):
        assert k in d["kpis"]
