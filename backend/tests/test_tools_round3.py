"""Backend tests for Tools module Round 3 features:
- Bulk deactivate/reactivate tools
- Warehouse inventory PDF
- Technician history + PDF
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "aeortega"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="session")
def h():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ---- Bulk deactivate ----
def test_bulk_deactivate_and_reactivate(h):
    # Pick 2 Active tools not currently assigned (to make assignments-cerradas independent)
    tools = requests.get(f"{API}/tools/tools", headers=h).json()
    active = [t for t in tools if t.get("estado") == "Activa"][:2]
    assert len(active) == 2, "Need at least 2 active tools; run seed first"
    ids = [t["id"] for t in active]

    # Deactivate
    r = requests.post(f"{API}/tools/tools/bulk-deactivate", headers=h,
                      json={"tool_ids": ids, "action": "deactivate"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True
    assert d["matched"] == 2
    assert d["estado_final"] == "Inactiva"
    assert "assignments_cerradas" in d

    # Verify GET reflects Inactiva
    tools2 = requests.get(f"{API}/tools/tools", headers=h).json()
    by_id = {t["id"]: t for t in tools2}
    for tid in ids:
        assert by_id[tid]["estado"] == "Inactiva"

    # Reactivate
    r2 = requests.post(f"{API}/tools/tools/bulk-deactivate", headers=h,
                       json={"tool_ids": ids, "action": "reactivate"}, timeout=30)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["estado_final"] == "Activa"
    assert d2["matched"] == 2

    tools3 = requests.get(f"{API}/tools/tools", headers=h).json()
    by_id = {t["id"]: t for t in tools3}
    for tid in ids:
        assert by_id[tid]["estado"] == "Activa"


def test_bulk_deactivate_invalid_action(h):
    tools = requests.get(f"{API}/tools/tools", headers=h).json()
    tid = tools[0]["id"]
    r = requests.post(f"{API}/tools/tools/bulk-deactivate", headers=h,
                      json={"tool_ids": [tid], "action": "invalid_x"}, timeout=15)
    assert r.status_code == 400


def test_bulk_deactivate_empty_list(h):
    r = requests.post(f"{API}/tools/tools/bulk-deactivate", headers=h,
                      json={"tool_ids": [], "action": "deactivate"}, timeout=15)
    assert r.status_code == 400


def test_bulk_deactivate_closes_vigente_assignments(h):
    # Setup: assign one fresh tool to a tech, then bulk deactivate that tool
    tools = requests.get(f"{API}/tools/tools", headers=h).json()
    techs = requests.get(f"{API}/tools/technicians", headers=h).json()
    tech = next((t for t in techs if t.get("ciudad")), None)
    assert tech
    current = requests.get(f"{API}/tools/reports/current", headers=h).json()
    busy = {a["tool_id"] for a in current}
    whs = requests.get(f"{API}/tools/warehouses", headers=h).json()
    for w in whs:
        at = requests.get(f"{API}/tools/warehouses/{w['id']}/tools", headers=h).json()
        busy |= {a["tool_id"] for a in at}
    free = [t for t in tools if t.get("estado") == "Activa" and t["id"] not in busy][:1]
    assert free, "No free tools available; seed more"
    tool = free[0]
    ar = requests.post(f"{API}/tools/assignments/batch", headers=h,
                      json={"technician_id": tech["id"], "tool_ids": [tool["id"]], "destination_type": "technician"},
                      timeout=60)
    assert ar.status_code == 200, ar.text

    # Now bulk-deactivate that tool
    r = requests.post(f"{API}/tools/tools/bulk-deactivate", headers=h,
                      json={"tool_ids": [tool["id"]], "action": "deactivate"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["assignments_cerradas"] >= 1

    # Verify no longer in current
    cur = requests.get(f"{API}/tools/reports/current", headers=h).json()
    assert tool["id"] not in {a["tool_id"] for a in cur}

    # Cleanup: reactivate
    requests.post(f"{API}/tools/tools/bulk-deactivate", headers=h,
                  json={"tool_ids": [tool["id"]], "action": "reactivate"}, timeout=30)


# ---- Warehouse inventory PDF ----
def test_warehouse_inventory_pdf(h):
    whs = requests.get(f"{API}/tools/warehouses", headers=h).json()
    assert whs
    # Use any warehouse (even empty is allowed – PDF should still generate)
    wh = whs[0]
    r = requests.get(f"{API}/tools/warehouses/{wh['id']}/inventory/pdf", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    cd = r.headers.get("content-disposition", "")
    assert "inventario_" in cd and ".pdf" in cd


def test_warehouse_inventory_pdf_not_found(h):
    r = requests.get(f"{API}/tools/warehouses/nonexistent-id-xyz/inventory/pdf", headers=h, timeout=15)
    assert r.status_code == 404


# ---- Technician history ----
def test_technician_history(h):
    techs = requests.get(f"{API}/tools/technicians", headers=h).json()
    assert techs
    # Prefer a tech that has assignments
    target = None
    for t in techs:
        cur = requests.get(f"{API}/tools/reports/current", headers=h, params={"technician_id": t["id"]}).json()
        if cur:
            target = t
            break
    if target is None:
        target = techs[0]

    r = requests.get(f"{API}/tools/technicians/{target['id']}/history", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "technician" in d and "assignments" in d and "stats" in d
    assert d["technician"]["id"] == target["id"]
    assert "_id" not in d["technician"]
    stats = d["stats"]
    for k in ("total", "activas", "devueltas", "valor_total"):
        assert k in stats
    assert stats["total"] == len(d["assignments"])
    assert stats["total"] == stats["activas"] + stats["devueltas"]
    # Order desc by fecha_asignacion
    fechas = [a.get("fecha_asignacion") for a in d["assignments"] if a.get("fecha_asignacion")]
    assert fechas == sorted(fechas, reverse=True)
    # No _id leak
    for a in d["assignments"]:
        assert "_id" not in a


def test_technician_history_not_found(h):
    r = requests.get(f"{API}/tools/technicians/nonexistent-id/history", headers=h, timeout=15)
    assert r.status_code == 404


def test_technician_history_pdf(h):
    techs = requests.get(f"{API}/tools/technicians", headers=h).json()
    assert techs
    r = requests.get(f"{API}/tools/technicians/{techs[0]['id']}/history/pdf", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
