"""Prueba funcional focalizada del módulo Ticket servicio (crea y limpia sus propios datos)."""
import io
import os
import sys
import requests

API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].strip() + "/api"
ok_count, fails = 0, []


def check(name, cond, extra=""):
    global ok_count
    if cond:
        ok_count += 1
        print(f"PASS {name}")
    else:
        fails.append(name)
        print(f"FAIL {name} {extra}")


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


A = login("aeortega", "admin123")
users, cat = {}, {"regions": [], "cities": []}


def mk(kind, body):
    r = requests.post(f"{API}/catalog/{kind}", headers=A, json=body)
    if r.ok:
        cat[kind].append(r.json()["id"])
    return r


rA = mk("regions", {"nombre": "ts-r9"}).json()
rB = mk("regions", {"nombre": "TS-R8"}).json()
check("region created uppercase", rA.get("nombre") == "TS-R9")
check("duplicate region rejected", requests.post(f"{API}/catalog/regions", headers=A, json={"nombre": "TS-R9"}).status_code == 400)
cA = mk("cities", {"nombre": "ts ciudad", "region_id": rA["id"]}).json()
mk("cities", {"nombre": "TS SINREGION", "region_id": None})
check("duplicate city rejected", requests.post(f"{API}/catalog/cities", headers=A, json={"nombre": "TS CIUDAD"}).status_code == 400)
r = requests.post(f"{API}/users", headers=A, json={"documento": "ts_bad", "password": "x", "name": "X", "role": "tecnico", "ciudad": "NO EXISTE"})
check("user with unknown city rejected", r.status_code == 400, r.text)
r = requests.post(f"{API}/users", headers=A, json={"documento": "ts_bad", "password": "x", "name": "X", "role": "analista_tecnico"})
check("analyst without region rejected", r.status_code == 400, r.text)

for doc, name, role, ciudad, region in [("ts_tec1", "TEC UNO", "tecnico", "ts ciudad", None), ("ts_tec2", "TEC DOS", "tecnico", "TS SINREGION", None),
                                        ("ts_ana1", "ANALISTA UNO", "analista_tecnico", None, "TS-R9"), ("ts_ana2", "ANALISTA DOS", "analista_tecnico", None, "TS-R8")]:
    r = requests.post(f"{API}/users", headers=A, json={"documento": doc, "password": "test123", "name": name, "role": role, "ciudad": ciudad, "region": region})
    users[doc] = r.json()["id"] if r.ok else None
check("create test users", all(users.values()))
created_tickets = []
try:
    u1 = next(u for u in requests.get(f"{API}/users", headers=A).json() if u["id"] == users["ts_tec1"])
    check("region derived from city", u1["region"] == "TS-R9" and u1["ciudad"] == "TS CIUDAD", u1)
    r = requests.post(f"{API}/users", headers=A, json={"documento": "ts_bad", "password": "x", "name": "X", "role": "analista_tecnico", "region": "TS-R9"})
    check("second analyst same region rejected", r.status_code == 400, r.text)
    check("delete city in use blocked", requests.delete(f"{API}/catalog/cities/{cA['id']}", headers=A).status_code == 400)
    check("rename region in use blocked", requests.put(f"{API}/catalog/regions/{rA['id']}", headers=A, json={"nombre": "OTRA"}).status_code == 400)
    check("delete region with cities blocked", requests.delete(f"{API}/catalog/regions/{rA['id']}", headers=A).status_code == 400)
    check("catalog used by /cities", "TS CIUDAD" in requests.get(f"{API}/cities", headers=A).json()["cities"])
    check("catalog used by expenses meta", "TS CIUDAD" in requests.get(f"{API}/expenses/meta", headers=A).json()["regions"].get("TS-R9", []))
    check("non-admin cannot edit catalog", requests.post(f"{API}/catalog/cities", headers=login("ts_tec1", "test123"), json={"nombre": "X"}).status_code == 403)

    T1, T2 = login("ts_tec1", "test123"), login("ts_tec2", "test123")
    N1, N2 = login("ts_ana1", "test123"), login("ts_ana2", "test123")
    png = b"\x89PNG\r\n\x1a\n" + os.urandom(2048)

    r = requests.post(f"{API}/ts/tickets", headers=T1, data={"modelo": "M1", "serie": "", "descripcion": "x"}, files={"file": ("a.png", png, "image/png")})
    check("missing field rejected", r.status_code == 400 and "Serie" in r.text, r.text)
    r = requests.post(f"{API}/ts/tickets", headers=T1, data={"modelo": "M1", "serie": "S1", "descripcion": "x"})
    check("missing media rejected", r.status_code == 400 and "Multimedia" in r.text, r.text)
    r = requests.post(f"{API}/ts/tickets", headers=T1, data={"modelo": "M1", "serie": "S1", "descripcion": "x"}, files={"file": ("a.pdf", b"x", "application/pdf")})
    check("bad extension rejected", r.status_code == 400, r.text)
    r = requests.post(f"{API}/ts/tickets", headers=N1, data={"modelo": "M1", "serie": "S1", "descripcion": "x"}, files={"file": ("a.png", png, "image/png")})
    check("analyst cannot create", r.status_code == 403)
    r = requests.post(f"{API}/ts/tickets", headers=A, data={"modelo": "M1", "serie": "S1", "descripcion": "x"}, files={"file": ("a.png", png, "image/png")})
    check("admin cannot create", r.status_code == 403)

    r = requests.post(f"{API}/ts/tickets", headers=T1, data={"modelo": "LAV-900", "serie": "SN123", "descripcion": "No centrifuga"}, files={"file": ("foto.png", png, "image/png")})
    check("tec1 creates ticket", r.ok, r.text)
    t1 = r.json()["ticket"]; created_tickets.append(t1["id"])
    check("auto-assigned to region analyst", t1["estado"] == "Asignado" and t1["analista_id"] == users["ts_ana1"] and t1["numero"].startswith("TS-"), t1)

    r = requests.post(f"{API}/ts/tickets", headers=T2, data={"modelo": "REF-1", "serie": "SN9", "descripcion": "No enfría"}, files={"file": ("v.mp4", os.urandom(4096), "video/mp4")})
    t2 = r.json()["ticket"]; created_tickets.append(t2["id"])
    check("no analyst -> stays Creado with warning", t2["estado"] == "Creado" and r.json()["warning"], r.text)
    la = requests.get(f"{API}/ts/tickets", headers=A).json()
    check("admin sees unassigned warning count", la["sin_asignar"] >= 1)
    na1 = requests.get(f"{API}/ts/notifications", headers=N1).json()
    check("notif: analyst notified on creation", any(n["ticket_id"] == t1["id"] and n["tipo"] == "creado" and not n["read"] for n in na1["items"]), na1)
    nad = requests.get(f"{API}/ts/notifications", headers=A).json()
    check("notif: admin notified of both tickets", {t1["id"], t2["id"]} <= {n["ticket_id"] for n in nad["items"]})
    check("notif: creator not self-notified", all(n["ticket_id"] != t1["id"] for n in requests.get(f"{API}/ts/notifications", headers=T1).json()["items"]))

    check("tec2 cannot see tec1 ticket (API)", requests.get(f"{API}/ts/tickets/{t1['id']}", headers=T2).status_code == 404)
    check("ana2 cannot see tec1 ticket", requests.get(f"{API}/ts/tickets/{t1['id']}", headers=N2).status_code == 404)
    l1 = requests.get(f"{API}/ts/tickets", headers=N1).json()
    check("ana1 sees only assigned", [t["id"] for t in l1["items"]] == [t1["id"]])
    l1b = requests.get(f"{API}/ts/tickets", headers=N1, params={"analista_id": users["ts_ana2"]}).json()
    check("filters cannot widen scope", all(t["analista_id"] == users["ts_ana1"] for t in l1b["items"]))
    lt = requests.get(f"{API}/ts/tickets", headers=T1).json()
    check("tec1 sees only own", all(t["tecnico_id"] == users["ts_tec1"] for t in lt["items"]) and lt["total"] == 1)

    r = requests.put(f"{API}/ts/tickets/{t2['id']}/asignar", headers=A, json={"analista_id": users["ts_ana2"]})
    check("admin manual assign -> Asignado", r.ok and r.json()["estado"] == "Asignado", r.text)
    nt2 = requests.get(f"{API}/ts/notifications", headers=T2).json()
    check("notif: tecnico notified on assignment", any(n["ticket_id"] == t2["id"] and n["tipo"] == "asignado" for n in nt2["items"]), nt2)
    na2 = requests.get(f"{API}/ts/notifications", headers=N2).json()
    check("notif: new analyst notified", any(n["ticket_id"] == t2["id"] and n["titulo"].startswith("Se te asignó") for n in na2["items"]) and na2["unread"] >= 1, na2)
    requests.post(f"{API}/ts/notifications/read-all", headers=N2)
    check("notif: read-all clears unread", requests.get(f"{API}/ts/notifications", headers=N2).json()["unread"] == 0)
    nid = nt2["items"][0]["id"]
    requests.post(f"{API}/ts/notifications/{nid}/read", headers=T2)
    check("notif: mark one read", requests.get(f"{API}/ts/notifications", headers=T2).json()["unread"] == nt2["unread"] - 1)
    check("tec cannot reassign", requests.put(f"{API}/ts/tickets/{t1['id']}/asignar", headers=T1, json={"analista_id": users["ts_ana2"]}).status_code == 403)

    check("tec cannot change state", requests.put(f"{API}/ts/tickets/{t1['id']}/estado", headers=T1, json={"estado": "Cerrado"}).status_code == 403)
    check("tec cannot respond", requests.put(f"{API}/ts/tickets/{t1['id']}/respuesta", headers=T1, json={"respuesta": "x"}).status_code == 403)
    check("admin cannot respond", requests.put(f"{API}/ts/tickets/{t1['id']}/respuesta", headers=A, json={"respuesta": "x"}).status_code == 403)
    check("invalid url rejected", requests.put(f"{API}/ts/tickets/{t1['id']}/respuesta", headers=N1, json={"respuesta": "x", "links": ["ftp://a"]}).status_code == 400)
    r = requests.put(f"{API}/ts/tickets/{t1['id']}/respuesta", headers=N1, json={"respuesta": "Revisar rodamiento", "links": ["https://example.com/manual.pdf"]})
    check("analyst saves response + links", r.ok and r.json()["respuesta_links"][0]["url"].startswith("https://"), r.text)
    r = requests.put(f"{API}/ts/tickets/{t1['id']}/estado", headers=N1, json={"estado": "Info cargada"})
    check("analyst changes state", r.ok and r.json()["estado"] == "Info cargada")

    check("tec msg", requests.post(f"{API}/ts/tickets/{t1['id']}/mensajes", headers=T1, json={"texto": "Hola, ¿qué reviso?"}).ok)
    check("analyst msg", requests.post(f"{API}/ts/tickets/{t1['id']}/mensajes", headers=N1, json={"texto": "Revisa el rodamiento"}).ok)
    check("admin cannot chat", requests.post(f"{API}/ts/tickets/{t1['id']}/mensajes", headers=A, json={"texto": "x"}).status_code == 403)
    T1b = login("ts_tec1", "test123")
    msgs = requests.get(f"{API}/ts/tickets/{t1['id']}/mensajes", headers=T1b).json()
    check("messages persisted after re-login, chronological", len(msgs) == 2 and msgs[0]["role"] == "tecnico")

    det = requests.get(f"{API}/ts/tickets/{t1['id']}", headers=T1).json()
    m = requests.get(f"{API}/ts/media/{det['media'][0]['id']}", headers=T1)
    check("media served from storage", m.ok and m.content == png, m.status_code)
    check("media blocked for unauthorized", requests.get(f"{API}/ts/media/{det['media'][0]['id']}", headers=T2).status_code == 404)
    check("history recorded", [h["a"] for h in det["history"]] == ["Creado", "Asignado", "Info cargada"])
    check("tec perms read-only", det["perms"] == {"can_change_state": False, "can_respond": False, "can_chat": True, "can_reassign": False})

    fa = requests.get(f"{API}/ts/tickets", headers=A, params={"estado": "Info cargada", "tecnico_id": users["ts_tec1"]}).json()
    check("combined filters", fa["total"] == 1 and fa["counts"]["Info cargada"] == 1)
    fz = requests.get(f"{API}/ts/tickets", headers=A, params={"desde": "2000-01-01", "hasta": "2000-01-02"}).json()
    check("date filter", fz["total"] == 0)

    r = requests.put(f"{API}/ts/tickets/{t1['id']}/estado", headers=N1, json={"estado": "Cerrado"})
    check("close sets closed_at", r.ok and r.json()["closed_at"])
    check("closed blocks messages", requests.post(f"{API}/ts/tickets/{t1['id']}/mensajes", headers=T1, json={"texto": "x"}).status_code == 400)

    p = requests.get(f"{API}/me/permissions", headers=N1).json()["perms"]
    check("analyst has no other modules by default", not any(v["view"] for v in p.values()))
    check("existing module still OK", requests.get(f"{API}/modules/flota", headers=A).ok)
finally:
    from pymongo import MongoClient
    env = dict(l.split("=", 1) for l in open("/app/backend/.env").read().splitlines() if "=" in l)
    mdb = MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]
    for col in ("ts_media", "ts_messages", "ts_status_history", "ts_notifications"):
        mdb[col].delete_many({"ticket_id": {"$in": created_tickets}})
    mdb.service_tickets.delete_many({"id": {"$in": created_tickets}})
    for uid in users.values():
        if uid:
            requests.delete(f"{API}/users/{uid}", headers=A)
    for cid in cat["cities"]:
        requests.delete(f"{API}/catalog/cities/{cid}", headers=A)
    for rid in cat["regions"]:
        requests.delete(f"{API}/catalog/regions/{rid}", headers=A)
    print("cleanup done")

print(f"\n{ok_count} passed, {len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
