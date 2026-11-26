"""Pago a talleres — Fase A: talleres, tarifarios, importación Excel, archivos y permisos (API pública)."""
import io
import os
import uuid

import openpyxl
import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/tallerpay"
RUN = uuid.uuid4().hex[:6].upper()
SAP1, SAP2, SAP3 = f"TEST{RUN}A", f"TEST{RUN}B", f"TEST{RUN}C"

CREATED = {"workshops": [], "tariffs": [], "files": []}


def _login(u, p):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        pytest.skip(f"login {u} failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("aeortega", "admin123")


@pytest.fixture(scope="module")
def coord():
    return _login("jullaguari", "indurama123")


@pytest.fixture(scope="module")
def lider():
    return _login("jelaje", "indurama123")


def _xlsx(headers, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mc = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    # delete only by ids / SAPs created in this run
    mc.tp_tariffs.delete_many({"codigo_sap": {"$in": [SAP1, SAP2, SAP3, SAP1 + "X"]}})
    mc.tp_tariff_files.delete_many({"id": {"$in": CREATED["files"]}})
    mc.tp_workshops.delete_many({"codigo_sap": {"$in": [SAP1, SAP2, SAP3, SAP1 + "X"]}})
    mc.role_permissions.delete_many({"role": {"$in": ["coordinador", "lider"]}, "_tp_test": RUN})


# ---- Talleres CRUD
class TestWorkshops:
    def test_create_normalizes_sap(self, admin):
        r = admin.post(f"{API}/talleres", json={"codigo_sap": f"  {SAP1.lower()} ", "nombre": "TEST Taller A",
                                                "ruc": "1790012345001", "ciudad": "ambato", "correo": "A@B.COM",
                                                "lineas": ["blanca", "cafe"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["codigo_sap"] == SAP1 and d["ciudad"] == "AMBATO" and d["correo"] == "a@b.com" and d["activo"] is True
        CREATED["workshops"].append(d["id"])
        g = admin.get(f"{API}/talleres/{d['id']}")
        assert g.status_code == 200 and g.json()["nombre"] == "TEST Taller A"

    def test_duplicate_sap(self, admin):
        r = admin.post(f"{API}/talleres", json={"codigo_sap": SAP1, "nombre": "dup", "lineas": ["cafe"]})
        assert r.status_code == 400 and SAP1 in r.json()["detail"]

    @pytest.mark.parametrize("payload,frag", [
        ({"codigo_sap": "", "nombre": "x"}, "SAP"),
        ({"codigo_sap": "TESTZZ1", "nombre": ""}, "nombre"),
        ({"codigo_sap": "TESTZZ1", "nombre": "x", "ruc": "123"}, "RUC"),
        ({"codigo_sap": "TESTZZ1", "nombre": "x", "ciudad": "NOEXISTE"}, "ciudad"),
        ({"codigo_sap": "TESTZZ1", "nombre": "x", "correo": "bad"}, "Correo"),
        ({"codigo_sap": "TESTZZ1", "nombre": "x", "lineas": []}, "línea"),
    ])
    def test_validation(self, admin, payload, frag):
        r = admin.post(f"{API}/talleres", json=payload)
        assert r.status_code == 400, r.text
        assert frag.lower() in r.json()["detail"].lower()

    def test_list_filters_and_kpis(self, admin):
        r = admin.get(f"{API}/talleres", params={"q": SAP1.lower()})
        d = r.json()
        assert r.status_code == 200 and len(d["items"]) == 1 and d["items"][0]["tarifas"] == 0
        res = d["resumen"]
        assert res["total"] == res["activos"] + res["inactivos"]
        ina = admin.get(f"{API}/talleres", params={"estado": "inactivos"}).json()["items"]
        assert all(not w["activo"] for w in ina)


# ---- Tarifarios
class TestTariffs:
    def test_create_cafe_only_workshop(self, admin):
        r = admin.post(f"{API}/talleres", json={"codigo_sap": SAP2, "nombre": "TEST Taller B", "lineas": ["cafe"]})
        assert r.status_code == 200, r.text
        CREATED["workshops"].append(r.json()["id"])

    def test_tariff_crud(self, admin):
        wid = CREATED["workshops"][0]
        r = admin.post(f"{API}/tarifarios", json={"taller_id": wid, "linea": "blanca", "peso": 1, "valor": 18.5,
                                                  "vigente_desde": "2026-01-01"})
        assert r.status_code == 200, r.text
        t = r.json()
        CREATED["tariffs"].append(t["id"])
        assert t["codigo_sap"] == SAP1 and t["valor"] == 18.5
        dup = admin.post(f"{API}/tarifarios", json={"taller_id": wid, "linea": "blanca", "peso": 1, "valor": 9})
        assert dup.status_code == 400
        for bad in ({"peso": 0, "valor": 1}, {"peso": 1, "valor": 0}, {"peso": -2, "valor": 5}):
            b = admin.post(f"{API}/tarifarios", json={"taller_id": wid, "linea": "cafe", **bad})
            assert b.status_code == 400, bad
        u = admin.put(f"{API}/tarifarios/{t['id']}", json={"taller_id": wid, "linea": "blanca", "peso": 1, "valor": 20})
        assert u.status_code == 200 and u.json()["valor"] == 20
        lst = admin.get(f"{API}/tarifarios", params={"taller_id": wid, "linea": "blanca"}).json()["items"]
        assert [x["valor"] for x in lst] == [20]

    def test_linea_not_served(self, admin):
        r = admin.post(f"{API}/tarifarios", json={"taller_id": CREATED["workshops"][1], "linea": "blanca", "peso": 1, "valor": 5})
        assert r.status_code == 400

    def test_remove_linea_with_tariffs_rejected(self, admin):
        wid = CREATED["workshops"][0]
        r = admin.put(f"{API}/talleres/{wid}", json={"codigo_sap": SAP1, "nombre": "TEST Taller A", "lineas": ["cafe"]})
        assert r.status_code == 400 and "Blanca" in r.json()["detail"]

    def test_deactivate_blocks_tariffs(self, admin):
        wid = CREATED["workshops"][1]
        r = admin.post(f"{API}/talleres/{wid}/estado", json={"activo": False, "motivo": "TEST"})
        assert r.status_code == 200 and r.json()["activo"] is False and r.json()["estado_historial"][-1]["motivo"] == "TEST"
        t = admin.post(f"{API}/tarifarios", json={"taller_id": wid, "linea": "cafe", "peso": 1, "valor": 5})
        assert t.status_code == 400 and "inactivo" in t.json()["detail"]
        r2 = admin.post(f"{API}/talleres/{wid}/estado", json={"activo": True})
        assert r2.json()["activo"] is True

    def test_delete_tariff(self, admin):
        wid = CREATED["workshops"][0]
        r = admin.post(f"{API}/tarifarios", json={"taller_id": wid, "linea": "cafe", "peso": 2.5, "valor": 30})
        tid = r.json()["id"]
        assert admin.delete(f"{API}/tarifarios/{tid}").status_code == 200
        assert admin.delete(f"{API}/tarifarios/{tid}").status_code == 404


# ---- Importación Excel
class TestImports:
    def test_templates(self, admin):
        for p in ("talleres/template", "tarifarios/template"):
            r = admin.get(f"{API}/{p}")
            assert r.status_code == 200 and r.content[:2] == b"PK"

    def test_import_workshops(self, admin):
        data = _xlsx(["codigo_sap", "nombre", "ruc", "ciudad", "lineas"], [
            [SAP3, "TEST Import C", None, "AMBATO", ""],
            [SAP1, "TEST Taller A renamed", None, None, "blanca,cafe"],
            [SAP3, "dup", None, None, "cafe"],
            ["", "sin sap", None, None, None],
        ])
        r = admin.post(f"{API}/talleres/import", files={"file": ("t.xlsx", data)})
        assert r.status_code == 200, r.text
        d = r.json()
        assert (d["inserted"], d["updated"], d["duplicates"], d["total_filas"]) == (1, 1, 1, 4), d
        assert len(d["errors"]) == 2
        c = admin.get(f"{API}/talleres", params={"q": SAP3}).json()["items"][0]
        assert c["lineas"] == ["blanca", "cafe"]

    def test_import_missing_cols(self, admin):
        r = admin.post(f"{API}/talleres/import", files={"file": ("t.xlsx", _xlsx(["nombre"], [["x"]]))})
        assert r.status_code == 400

    def test_import_workshop_bypasses_linea_guard(self, admin):
        """Import should not remove a línea that has tariffs (same rule as PUT)."""
        data = _xlsx(["codigo_sap", "nombre", "lineas"], [[SAP1, "TEST Taller A", "cafe"]])
        r = admin.post(f"{API}/talleres/import", files={"file": ("t.xlsx", data)})
        w = admin.get(f"{API}/talleres/{CREATED['workshops'][0]}").json()
        # restore to keep state consistent
        admin.put(f"{API}/talleres/{w['id']}", json={"codigo_sap": SAP1, "nombre": "TEST Taller A", "lineas": ["blanca", "cafe"]})
        assert "blanca" in w["lineas"], f"Import removed blanca despite tariffs: {r.json()}"

    def test_import_tariffs(self, admin):
        admin.post(f"{API}/talleres/{CREATED['workshops'][1]}/estado", json={"activo": False})
        data = _xlsx(["codigo_sap", "linea", "peso", "valor", "descripcion", "vigente_desde"], [
            [SAP1, "Línea Blanca", 1, 22, "upd", "2026-01-05"],
            [SAP1, "cafe", 3, 40, "new", None],
            [SAP1, "cafe", 3, 41, "dup", None],
            ["NOPE999", "cafe", 1, 1, "", None],
            [SAP2, "cafe", 1, 1, "", None],
            [SAP3, "rojo", 1, 1, "", None],
        ])
        r = admin.post(f"{API}/tarifarios/import", files={"file": ("t.xlsx", data)})
        admin.post(f"{API}/talleres/{CREATED['workshops'][1]}/estado", json={"activo": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert (d["inserted"], d["updated"], d["duplicates"]) == (1, 1, 1), d
        assert len(d["errors"]) == 4
        lst = admin.get(f"{API}/tarifarios", params={"taller_id": CREATED["workshops"][0]}).json()["items"]
        assert {(x["linea"], x["peso"], x["valor"]) for x in lst} == {("blanca", 1, 22), ("cafe", 3, 40)}


# ---- Archivos
class TestFiles:
    def test_file_lifecycle(self, admin):
        wid = CREATED["workshops"][0]
        pdf = b"%PDF-1.4\n%TEST\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
        r = admin.post(f"{API}/talleres/{wid}/archivos", files={"file": ("TEST_tarifa.pdf", pdf, "application/pdf")},
                       data={"linea": "blanca", "descripcion": "TEST"})
        assert r.status_code == 200, r.text
        f = r.json()
        CREATED["files"].append(f["id"])
        assert f["linea"] == "blanca" and "storage_path" not in f
        lst = admin.get(f"{API}/talleres/{wid}/archivos").json()["items"]
        assert any(x["id"] == f["id"] for x in lst)
        dl = admin.get(f"{API}/archivos/{f['id']}")
        assert dl.status_code == 200 and dl.content == pdf and dl.headers["content-type"].startswith("application/pdf")
        assert admin.delete(f"{API}/archivos/{f['id']}").status_code == 200
        assert admin.get(f"{API}/archivos/{f['id']}").status_code == 404

    def test_file_rejections(self, admin):
        wid = CREATED["workshops"][0]
        r = admin.post(f"{API}/talleres/{wid}/archivos", files={"file": ("x.exe", b"MZ")})
        assert r.status_code == 400
        r = admin.post(f"{API}/talleres/{wid}/archivos", files={"file": ("x.pdf", b"")})
        assert r.status_code == 400
        r = admin.post(f"{API}/talleres/{wid}/archivos", files={"file": ("x.pdf", b"%PDF")}, data={"linea": "roja"})
        assert r.status_code == 400
        big = b"0" * (10 * 1024 * 1024 + 10)
        r = admin.post(f"{API}/talleres/{wid}/archivos", files={"file": ("big.png", big)})
        assert r.status_code in (400, 413)


# ---- Permisos
class TestPermissions:
    def test_coord_lider_read_only(self, coord, lider):
        wid = CREATED["workshops"][0]
        for s in (coord, lider):
            assert s.get(f"{API}/talleres").status_code == 200
            assert s.get(f"{API}/tarifarios").status_code == 200
            assert s.get(f"{API}/talleres/{wid}/archivos").status_code == 200
            assert s.post(f"{API}/talleres", json={"codigo_sap": "TESTNO", "nombre": "x"}).status_code == 403
            assert s.put(f"{API}/talleres/{wid}", json={"codigo_sap": SAP1, "nombre": "x"}).status_code == 403
            assert s.post(f"{API}/talleres/{wid}/estado", json={"activo": False}).status_code == 403
            assert s.post(f"{API}/tarifarios", json={"taller_id": wid, "linea": "cafe", "peso": 9, "valor": 1}).status_code == 403
            assert s.post(f"{API}/talleres/import", files={"file": ("t.xlsx", _xlsx(["codigo_sap", "nombre"], []))}).status_code == 403
            assert s.post(f"{API}/talleres/{wid}/archivos", files={"file": ("a.pdf", b"%PDF")}).status_code == 403

    @pytest.mark.parametrize("u,p", [("memejia", "indurama123"), ("gerente", "indurama123")])
    def test_other_roles_forbidden(self, u, p):
        s = _login(u, p)
        for path in ("talleres", "tarifarios", "status", "talleres/template"):
            assert s.get(f"{API}/{path}").status_code == 403, path
        assert s.post(f"{API}/talleres", json={"codigo_sap": "TESTNO", "nombre": "x"}).status_code == 403

    def test_grant_edit_then_create(self, admin, coord):
        m = admin.get(f"{BASE_URL}/api/permissions/matrix").json()["matrix"]
        cm = m["coordinador"]
        cm["tp_talleres"]["edit"] = True
        try:
            assert admin.put(f"{BASE_URL}/api/permissions/matrix", json={"matrix": {"coordinador": cm}}).status_code == 200
            r = coord.post(f"{API}/talleres", json={"codigo_sap": SAP1 + "X", "nombre": "TEST coord", "lineas": ["cafe"]})
            assert r.status_code == 200, r.text
            # tarifarios edit still not granted
            assert coord.post(f"{API}/tarifarios", json={"taller_id": r.json()["id"], "linea": "cafe", "peso": 1, "valor": 1}).status_code == 403
        finally:
            mc = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            mc.role_permissions.delete_one({"role": "coordinador"})  # no stored doc existed before (defaults)
