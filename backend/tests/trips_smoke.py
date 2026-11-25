"""Prueba focalizada: Rutas de servicio + Viaje salida/retorno (crea y limpia sus propios datos)."""
import io
import sys
import requests
import openpyxl

API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].strip() + "/api"
ok_count, fails = 0, []


def check(name, cond, extra=""):
    global ok_count
    if cond:
        ok_count += 1
        print(f"PASS {name}")
    else:
        fails.append(name)
        print(f"FAIL {name} {str(extra)[:300]}")


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


A = login("aeortega", "admin123")
city = requests.post(f"{API}/catalog/cities", headers=A, json={"nombre": "TS VIAJE CITY"}).json()
city2 = requests.post(f"{API}/catalog/cities", headers=A, json={"nombre": "TS VIAJE OTRA"}).json()
users, routes, trips = {}, [], []
for doc, name, ciudad in [("tv_tec1", "TV TECNICO UNO", "TS VIAJE CITY"), ("tv_tec2", "TV TECNICO SIN CIUDAD", None)]:
    r = requests.post(f"{API}/users", headers=A, json={"documento": doc, "password": "test123", "name": name, "role": "tecnico", "ciudad": ciudad})
    users[doc] = r.json().get("id")
check("setup users", all(users.values()))
placa = next(v["Placa Vehiculo"] for v in requests.get(f"{API}/modules/flota", headers=A).json() if str(v.get("Status", "")).lower() == "activo" and v.get("Placa Vehiculo"))
try:
    T1 = login("tv_tec1", "test123")
    # ---- Catálogo
    r = requests.post(f"{API}/service-routes", headers=A, json={"ruta": "  Centro   Norte ", "ciudad": "ts viaje city"})
    check("create route", r.ok and r.json()["codigo"].startswith("RS-") and r.json()["ruta"] == "Centro Norte", r.text)
    r1 = r.json(); routes.append(r1["id"])
    check("duplicate route rejected", requests.post(f"{API}/service-routes", headers=A, json={"ruta": "centro norte", "ciudad": "TS VIAJE CITY"}).status_code == 400)
    check("unknown city rejected", requests.post(f"{API}/service-routes", headers=A, json={"ruta": "X", "ciudad": "NOPE"}).status_code == 400)
    r2 = requests.post(f"{API}/service-routes", headers=A, json={"ruta": "Ruta inactiva", "ciudad": "TS VIAJE CITY"}).json(); routes.append(r2["id"])
    requests.put(f"{API}/service-routes/{r2['id']}", headers=A, json={"ruta": r2["ruta"], "ciudad": r2["ciudad"], "estado": "Inactivo"})
    r3 = requests.post(f"{API}/service-routes", headers=A, json={"ruta": "Ruta otra ciudad", "ciudad": "TS VIAJE OTRA"}).json(); routes.append(r3["id"])
    lst = requests.get(f"{API}/service-routes", headers=A, params={"ciudad": "TS VIAJE CITY", "estado": "Activo"}).json()
    check("filter by city + estado", [x["id"] for x in lst] == [r1["id"]], lst)
    check("tecnico cannot edit catalog", requests.post(f"{API}/service-routes", headers=T1, json={"ruta": "Y", "ciudad": "TS VIAJE CITY"}).status_code == 403)
    t = requests.get(f"{API}/service-routes/template", headers=A)
    hdr = [c.value for c in openpyxl.load_workbook(io.BytesIO(t.content)).active[1]]
    check("template Ruta/Ciudad", t.ok and hdr == ["Ruta", "Ciudad"], hdr)
    wb = openpyxl.Workbook(); ws = wb.active
    for row in [["Ruta", "Ciudad"], ["Sur - Valle", "TS VIAJE CITY"], ["CENTRO NORTE", "ts viaje city"], ["Sur - Valle", "TS VIAJE CITY"], ["Z", "NO EXISTE"], [None, "TS VIAJE CITY"]]:
        ws.append(row)
    buf = io.BytesIO(); wb.save(buf)
    imp = requests.post(f"{API}/service-routes/import", headers=A, files={"file": ("r.xlsx", buf.getvalue())}).json()
    check("import report", imp["inserted"] == 1 and imp["duplicates"] == 2 and len(imp["errors"]) == 4 and imp["total_filas"] == 5, imp)
    routes += [x["id"] for x in requests.get(f"{API}/service-routes", headers=A, params={"ciudad": "TS VIAJE CITY"}).json() if x["id"] not in routes]

    # ---- Conductor -> ciudad -> rutas activas
    fc = requests.get(f"{API}/service-routes/for-conductor", headers=T1, params={"conductor_id": users["tv_tec1"]}).json()
    check("routes for conductor = active of his city", sorted(x["ruta"] for x in fc["routes"]) == ["Centro Norte", "Sur - Valle"] and not fc["message"], fc)
    fc2 = requests.get(f"{API}/service-routes/for-conductor", headers=T1, params={"conductor_id": users["tv_tec2"]}).json()
    check("conductor without city -> message", fc2["message"] and not fc2["routes"], fc2)

    # ---- Salida
    base = {"fecha_salida": "2026-11-20", "placa": placa, "conductor_id": users["tv_tec1"], "km_salida": 1000, "ruta_id": r1["id"]}
    check("salida missing km rejected", requests.post(f"{API}/viajes/salida", headers=T1, json={**base, "km_salida": ""}).status_code == 400)
    check("salida route other city rejected", requests.post(f"{API}/viajes/salida", headers=T1, json={**base, "ruta_id": r3["id"]}).status_code == 400)
    check("salida inactive route rejected", requests.post(f"{API}/viajes/salida", headers=T1, json={**base, "ruta_id": r2["id"]}).status_code == 400)
    check("salida conductor without city rejected", requests.post(f"{API}/viajes/salida", headers=T1, json={**base, "conductor_id": users["tv_tec2"]}).status_code == 400)
    s1 = requests.post(f"{API}/viajes/salida", headers=T1, json=base)
    check("salida ok without return fields", s1.ok and s1.json()["Estado Viaje"] == "En curso" and s1.json()["Ciudad"] == "TS VIAJE CITY" and s1.json()["Ruta"] == "Centro Norte", s1.text)
    v1 = s1.json(); trips.append(v1["id"])
    check("code format VJ-YYYY-NNNNNN", v1["Codigo Viaje"].startswith("VJ-2026-") and len(v1["Codigo Viaje"]) == 14, v1["Codigo Viaje"])
    v2 = requests.post(f"{API}/viajes/salida", headers=A, json={**base, "km_salida": 2000}).json(); trips.append(v2["id"])
    check("codes unique & sequential", int(v2["Codigo Viaje"][-6:]) == int(v1["Codigo Viaje"][-6:]) + 1, (v1["Codigo Viaje"], v2["Codigo Viaje"]))
    check("generic POST rutas blocked", requests.post(f"{API}/modules/rutas", headers=A, json={"data": {"Placa Vehiculo": placa}}).status_code == 400)
    check("generic PUT on en curso blocked", requests.put(f"{API}/modules/rutas/{v1['id']}", headers=A, json={"data": {"Estado Viaje": "Finalizado"}}).status_code == 400)
    hist = requests.get(f"{API}/vehicles/{placa}/history", headers=A).json()
    check("en curso excluded from history", all(x["id"] not in trips for x in hist["rutas"]))

    # ---- Retorno
    pend = requests.get(f"{API}/viajes/pendientes", headers=T1).json()
    check("pending = only own en curso", [x["id"] for x in pend] == [v1["id"]], [x.get("Codigo Viaje") for x in pend])
    check("cannot return other user's trip", requests.put(f"{API}/viajes/{v2['id']}/retorno", headers=T1, json={"data": {"Fecha de Llegada": "2026-11-21", "Kms Final (Odómetro)": 2100}}).status_code == 404)
    check("return date before departure rejected", requests.put(f"{API}/viajes/{v1['id']}/retorno", headers=T1, json={"data": {"Fecha de Llegada": "2026-11-19", "Kms Final (Odómetro)": 1100}}).status_code == 400)
    check("return km < departure rejected", requests.put(f"{API}/viajes/{v1['id']}/retorno", headers=T1, json={"data": {"Fecha de Llegada": "2026-11-21", "Kms Final (Odómetro)": 900}}).status_code == 400)
    check("return missing km rejected", requests.put(f"{API}/viajes/{v1['id']}/retorno", headers=T1, json={"data": {"Fecha de Llegada": "2026-11-21"}}).status_code == 400)
    n_before = len(requests.get(f"{API}/modules/rutas", headers=A).json())
    ret = requests.put(f"{API}/viajes/{v1['id']}/retorno", headers=T1, json={"data": {
        "Fecha de Llegada": "2026-11-21", "Kms Final (Odómetro)": "1150", "Precio x Galón ($/gal)": "2.5", "Total Combustible ($)": "25",
        "Gasto peajes ($)": "3", "Otros Gastos ($)": "2", "Tipo de Combustible": "Diesel", "Observaciones": "ok"}})
    d = ret.json()
    check("return finalizes same record", ret.ok and d["id"] == v1["id"] and d["Codigo Viaje"] == v1["Codigo Viaje"] and d["Estado Viaje"] == "Finalizado" and d.get("_finalized_at"), ret.text)
    check("calculations", d["Kms Recorridos"] == 150 and d["Volumen de Combustible (gal)"] == 10 and d["Recorrido por und. de comb. (Km/gal)"] == 15 and d["Gasto Total ($)"] == 30, d)
    check("no duplicate record", len(requests.get(f"{API}/modules/rutas", headers=A).json()) == n_before)
    check("second return blocked", requests.put(f"{API}/viajes/{v1['id']}/retorno", headers=T1, json={"data": {"Fecha de Llegada": "2026-11-22", "Kms Final (Odómetro)": 1200}}).status_code == 409)
    check("finalized not pending anymore", requests.get(f"{API}/viajes/pendientes", headers=T1).json() == [])
    hist = requests.get(f"{API}/vehicles/{placa}/history", headers=A).json()
    check("finalized trip counted in history", any(x["id"] == v1["id"] for x in hist["rutas"]) and all(x["id"] != v2["id"] for x in hist["rutas"]))
    requests.put(f"{API}/service-routes/{r1['id']}", headers=A, json={"ruta": "Centro Norte RENOMBRADA", "ciudad": "TS VIAJE CITY", "estado": "Activo"})
    mine = requests.get(f"{API}/viajes", headers=T1).json()
    check("tecnico list = own trips only", [x["id"] for x in mine] == [v1["id"]], len(mine))
    check("catalog change keeps trip snapshot", mine[0]["Ruta"] == "Centro Norte")
    allv = requests.get(f"{API}/viajes", headers=A).json()
    check("admin list includes legacy (Finalizado)", len(allv) > 1000 and all(x.get("Estado Viaje") in ("En curso", "Finalizado") for x in allv))
    fl = next(v for v in requests.get(f"{API}/modules/flota", headers=A).json() if v["Placa Vehiculo"] == placa)
    check("flota city must exist in catalog", requests.put(f"{API}/modules/flota/{fl['id']}", headers=A, json={"data": {"Ubicacion": "CIUDAD FALSA"}}).status_code == 400)
    check("dashboard still OK", requests.get(f"{API}/dashboard", headers=A).status_code == 200)
finally:
    from pymongo import MongoClient
    env = dict(l.split("=", 1) for l in open("/app/backend/.env").read().splitlines() if "=" in l)
    mdb = MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]
    mdb.rutas.delete_many({"id": {"$in": trips}})
    mdb.service_routes.delete_many({"id": {"$in": routes}})
    for uid in users.values():
        if uid:
            requests.delete(f"{API}/users/{uid}", headers=A)
    for c in (city, city2):
        if c.get("id"):
            requests.delete(f"{API}/catalog/cities/{c['id']}", headers=A)
    print("cleanup done")

print(f"\n{ok_count} passed, {len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
