# Entregas de documentos module (/api/docs) - regression tests
import os
import re
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/docs"
URL_OK = "https://example.com/TEST_doc.pdf"
CREATED = []


def login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login failed {u}")
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    s.user = r.json()["user"]
    return s


@pytest.fixture(scope="module")
def emisor():
    return login("docemisor", "prueba123")


@pytest.fixture(scope="module")
def receptor():
    return login("docreceptor", "prueba123")


@pytest.fixture(scope="module")
def sinciudad():
    return login("docsinciudad", "prueba123")


@pytest.fixture(scope="module")
def admin():
    return login("aeortega", "admin123")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    if CREATED:
        c = MongoClient(os.environ["MONGO_URL"])
        c[os.environ["DB_NAME"]].doc_deliveries.delete_many({"id": {"$in": CREATED}})


def create(s, rid, **kw):
    body = {"tipo": "Contrato", "receptor_id": rid, "documento_url": URL_OK}
    body.update(kw)
    r = s.post(f"{API}/entregas", json=body)
    if r.status_code == 200:
        CREATED.append(r.json()["id"])
    return r


# --- meta
def test_meta(emisor):
    r = emisor.get(f"{API}/meta")
    assert r.status_code == 200
    d = r.json()
    assert d["emisor"]["ciudad"] == "QUITO" and d["puede_registrar"] is True
    ids = [u["id"] for u in d["usuarios"]]
    assert emisor.user["id"] not in ids
    assert all("password_hash" not in u and "email" not in u for u in d["usuarios"])


def test_meta_sinciudad(sinciudad):
    d = sinciudad.get(f"{API}/meta").json()
    assert d["puede_registrar"] is False and d["emisor"]["ciudad"] is None


# --- create validations
def test_self_receptor(emisor):
    assert create(emisor, emisor.user["id"]).status_code == 400


def test_no_city(sinciudad, receptor):
    r = create(sinciudad, receptor.user["id"])
    assert r.status_code == 400 and "ciudad" in r.json()["detail"].lower()


@pytest.mark.parametrize("url", ["ftp://x.com/a.pdf", "example.com/a.pdf", "https://", "https://a b.com", ""])
def test_bad_url(emisor, receptor, url):
    assert create(emisor, receptor.user["id"], documento_url=url).status_code == 400


def test_bad_tipo(emisor, receptor):
    assert create(emisor, receptor.user["id"], tipo="Otro").status_code == 400


def test_bad_receptor(emisor):
    assert create(emisor, "nonexistent-id").status_code == 400


@pytest.mark.parametrize("missing", ["tema", "capacitador", "lugar", "participantes"])
def test_cap_missing(emisor, receptor, missing):
    body = {"tema": "TEST tema", "capacitador": "Cap", "lugar": "Sala", "participantes": ["A", "B"]}
    body[missing] = [] if missing == "participantes" else "  "
    assert create(emisor, receptor.user["id"], tipo="Capacitación", **body).status_code == 400


def test_cap_blank_participants(emisor, receptor):
    r = create(emisor, receptor.user["id"], tipo="Capacitación", tema="T", capacitador="C", lugar="L", participantes=["  ", ""])
    assert r.status_code == 400


# --- full flow
def test_flow(emisor, receptor, sinciudad, admin):
    r1 = create(emisor, receptor.user["id"])
    r2 = create(emisor, receptor.user["id"], tipo="Capacitación", tema="TEST_Seguridad", capacitador="Ing X",
                lugar="Sala 1", participantes=["Ana", " Luis  Perez ", ""])
    assert r1.status_code == 200 and r2.status_code == 200
    a, b = r1.json(), r2.json()
    assert re.fullmatch(r"CD-\d{4}-\d{6}", a["codigo"])
    assert int(b["codigo"][-6:]) == int(a["codigo"][-6:]) + 1
    assert a["estado"] == "Pendiente de recepción" and a["aceptado_at"] is None
    assert a["ciudad"] == "QUITO" and a["emisor_nombre"] and a["receptor_nombre"]
    assert b["capacitacion"]["participantes"] == ["Ana", "Luis Perez"]
    assert "_id" not in a

    # lists
    env = emisor.get(f"{API}/entregas", params={"scope": "enviadas"}).json()["items"]
    assert a["id"] in [x["id"] for x in env]
    rec = receptor.get(f"{API}/entregas", params={"scope": "recibidas"}).json()["items"]
    assert b["id"] in [x["id"] for x in rec]
    assert receptor.get(f"{API}/pendientes").json()["count"] >= 2
    assert emisor.get(f"{API}/entregas", params={"scope": "todas"}).status_code == 403
    assert emisor.get(f"{API}/entregas", params={"scope": "xx"}).status_code == 400
    todas = admin.get(f"{API}/entregas", params={"scope": "todas"})
    assert todas.status_code == 200 and a["id"] in [x["id"] for x in todas.json()["items"]]

    # visibility
    assert sinciudad.get(f"{API}/entregas/{a['id']}").status_code == 404
    assert admin.get(f"{API}/entregas/{a['id']}").status_code == 200
    assert receptor.get(f"{API}/entregas/{a['id']}").json()["codigo"] == a["codigo"]

    # accept permissions
    assert emisor.post(f"{API}/entregas/{a['id']}/aceptar").status_code == 403
    assert admin.post(f"{API}/entregas/{a['id']}/aceptar").status_code == 403
    assert sinciudad.post(f"{API}/entregas/{a['id']}/aceptar").status_code == 404
    ok = receptor.post(f"{API}/entregas/{a['id']}/aceptar")
    assert ok.status_code == 200 and ok.json()["estado"] == "Recibido" and ok.json()["aceptado_at"]
    assert receptor.post(f"{API}/entregas/{a['id']}/aceptar").status_code == 400
    assert emisor.get(f"{API}/entregas/{a['id']}").json()["estado"] == "Recibido"

    # acta
    for s in (emisor, receptor, admin):
        p = s.get(f"{API}/entregas/{b['id']}/acta")
        assert p.status_code == 200 and p.headers["content-type"].startswith("application/pdf")
        assert p.content[:4] == b"%PDF"
    assert sinciudad.get(f"{API}/entregas/{b['id']}/acta").status_code == 404

    # dashboard
    assert emisor.get(f"{API}/dashboard").status_code == 403
    d = admin.get(f"{API}/dashboard").json()
    assert d["kpis"]["total"] >= 2 and d["kpis"]["total"] == d["kpis"]["pendientes"] + d["kpis"]["recibidas"]
    assert "QUITO" in [x["name"] for x in d["por_ciudad"]]
    assert {"Contrato", "Acta de entrega", "Capacitación"} <= {x["name"] for x in d["por_tipo"]}


def test_unauth():
    assert requests.get(f"{API}/meta").status_code in (401, 403)
