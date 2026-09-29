from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import json
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import re
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict

# ---- DB ----
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---- App ----
app = FastAPI(title="Control de Flota Vehicular")
api = APIRouter(prefix="/api")

JWT_ALG = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
security = HTTPBearer(auto_error=False)

# ---- Utils ----
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_token(user_id: str, username: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(request: Request, creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = None
    if creds and creds.credentials:
        token = creds.credentials
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    user.pop("_id", None)
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Requiere rol administrador")
    return user

# ---- Models ----
class LoginIn(BaseModel):
    username: str
    password: str

ALLOWED_ROLES = ("admin", "user", "coordinador", "lider", "tesorero", "gerente")

class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    email: Optional[str] = None
    role: str = "user"  # admin | user | coordinador | lider | tesorero | gerente
    ciudad: Optional[str] = None
    region: Optional[str] = None  # 'R1' | 'R2' | None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    ciudad: Optional[str] = None
    region: Optional[str] = None

class UserOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    name: str
    email: Optional[str] = None
    role: str
    created_at: Optional[str] = None

# Generic module models: each record is a dict with 'id' + arbitrary fields
class RecordIn(BaseModel):
    data: Dict[str, Any]

# ---- Auth Endpoints ----
@api.post("/auth/login")
async def login(payload: LoginIn):
    user = await db.users.find_one({"username": payload.username.lower().strip()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    token = create_token(user["id"], user["username"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "name": user["name"],
            "email": user.get("email"),
            "role": user["role"],
            "ciudad": user.get("ciudad"),
            "region": user.get("region"),
        },
    }

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---- Users mgmt (admin) ----
@api.get("/users")
async def list_users(user: dict = Depends(require_admin)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return docs

@api.post("/users")
async def create_user(payload: UserCreate, user: dict = Depends(require_admin)):
    username = payload.username.lower().strip()
    exists = await db.users.find_one({"username": username})
    if exists:
        raise HTTPException(status_code=400, detail="Nombre de usuario ya existe")
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Rol inválido")
    doc = {
        "id": str(uuid.uuid4()),
        "username": username,
        "name": payload.name.strip(),
        "email": payload.email,
        "role": payload.role,
        "ciudad": (payload.ciudad or "").strip() or None,
        "region": (payload.region or "").strip().upper() or None,
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc

@api.patch("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, user: dict = Depends(require_admin)):
    update: Dict[str, Any] = {}
    if payload.name is not None: update["name"] = payload.name
    if payload.email is not None: update["email"] = payload.email
    if payload.role is not None:
        if payload.role not in ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail="Rol inválido")
        update["role"] = payload.role
    if payload.ciudad is not None:
        update["ciudad"] = (payload.ciudad or "").strip() or None
    if payload.region is not None:
        update["region"] = (payload.region or "").strip().upper() or None
    if payload.password:
        update["password_hash"] = hash_password(payload.password)
    if not update:
        raise HTTPException(status_code=400, detail="Sin cambios")
    res = await db.users.update_one({"id": user_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True}

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_admin)):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}

# ---- Generic CRUD for modules ----
MODULES = {
    "flota": "flota",
    "seguros": "seguros",
    "impuestos": "impuestos",
    "talleres": "talleres",
    "conductores": "conductores",
    "multas": "multas",
    "mantenimiento": "mantenimiento",
    "rutas": "rutas",
}

def _norm(s):
    return str(s or "").strip().upper()

async def _resolve_cities(module: str, user: dict, ciudades_param: Optional[str]) -> Optional[set]:
    """Return set of uppercase city names to keep, or None to keep everything."""
    if module in ("talleres", "conductores"):
        return None
    if user.get("role") == "user":
        c = _norm(user.get("ciudad"))
        return {c} if c else set()
    if not ciudades_param:
        return None
    parts = [_norm(p) for p in ciudades_param.split(",") if p and p.strip()]
    return set(parts) if parts else None

async def _filter_by_cities(module: str, docs: list, cities: Optional[set]) -> list:
    if cities is None:
        return docs
    if not cities:
        return []
    if module == "flota":
        return [d for d in docs if _norm(d.get("Ubicacion")) in cities]
    if module == "impuestos":
        return [d for d in docs if _norm(d.get("Ciudad")) in cities]
    flota_docs = await db.flota.find({}, {"_id": 0, "Placa Vehiculo": 1, "Ubicacion": 1}).to_list(5000)
    placas_ok = {_norm(f.get("Placa Vehiculo")) for f in flota_docs if _norm(f.get("Ubicacion")) in cities}
    def get_placa(d):
        v = d.get("Placa Vehículo") or d.get("Placa Vehiculo")
        return _norm(v)
    return [d for d in docs if get_placa(d) in placas_ok]



def _validate_module(m: str) -> str:
    if m not in MODULES:
        raise HTTPException(status_code=404, detail="Módulo no existe")
    return MODULES[m]

@api.get("/modules/{module}")
async def list_records(module: str, ciudades: Optional[str] = None, user: dict = Depends(get_current_user)):
    col = _validate_module(module)
    docs = await db[col].find({}, {"_id": 0}).to_list(5000)
    cities = await _resolve_cities(module, user, ciudades)
    return await _filter_by_cities(module, docs, cities)

@api.post("/modules/{module}")
async def create_record(module: str, payload: RecordIn, user: dict = Depends(get_current_user)):
    col = _validate_module(module)
    data = dict(payload.data)
    # Auto-generate ascending Nro for mantenimiento if not supplied
    if module == "mantenimiento" and not data.get("Nro"):
        docs = await db[col].find({}, {"Nro": 1, "_id": 0}).to_list(20000)
        max_nro = 0
        for d in docs:
            try:
                n = int(d.get("Nro") or 0)
                if n > max_nro: max_nro = n
            except Exception:
                pass
        data["Nro"] = max_nro + 1
    doc = {"id": str(uuid.uuid4()), **data, "_created_by": user["username"], "_created_at": datetime.now(timezone.utc).isoformat()}
    await db[col].insert_one(doc)
    doc.pop("_id", None)

    # Notify by email when a multa is created without payment date
    if module == "multas" and not data.get("Fecha de pago"):
        try:
            await _notify_multa_sin_pago(data)
        except Exception as e:
            logging.warning(f"Multa notify failed: {e}")

    return doc

@api.put("/modules/{module}/{record_id}")
async def update_record(module: str, record_id: str, payload: RecordIn, user: dict = Depends(require_admin)):
    col = _validate_module(module)
    data = {k: v for k, v in payload.data.items() if k != "id"}
    data["_updated_by"] = user["username"]
    data["_updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db[col].update_one({"id": record_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return {"ok": True}

@api.delete("/modules/{module}/{record_id}")
async def delete_record(module: str, record_id: str, user: dict = Depends(require_admin)):
    col = _validate_module(module)
    await db[col].delete_one({"id": record_id})
    return {"ok": True}

# ---- Dashboard ----
def _num(v):
    try:
        if v is None or v == "":
            return 0.0
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v).replace("$", "").replace(",", "").strip()
        return float(s)
    except Exception:
        return 0.0

def _parse_dt(s):
    if not s: return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        try:
            return datetime.strptime(str(s)[:10], "%Y-%m-%d")
        except Exception:
            return None

@api.get("/dashboard")
async def dashboard(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    ciudades: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    flota_all = await db.flota.find({}, {"_id": 0}).to_list(5000)
    seguros_all = await db.seguros.find({}, {"_id": 0}).to_list(5000)
    impuestos_all = await db.impuestos.find({}, {"_id": 0}).to_list(5000)
    multas_all = await db.multas.find({}, {"_id": 0}).to_list(5000)
    mantenimiento_all = await db.mantenimiento.find({}, {"_id": 0}).to_list(5000)

    # Resolve city set (uses user's ciudad if role=user, else the query param for admin)
    cities = await _resolve_cities("flota", user, ciudades)

    flota = await _filter_by_cities("flota", flota_all, cities)
    seguros = await _filter_by_cities("seguros", seguros_all, cities)
    impuestos = await _filter_by_cities("impuestos", impuestos_all, cities)
    multas = await _filter_by_cities("multas", multas_all, cities)
    mantenimiento = await _filter_by_cities("mantenimiento", mantenimiento_all, cities)

    # placa -> ubicacion & data
    placa_to_ciudad = {v.get("Placa Vehiculo"): v.get("Ubicacion") or "Sin ciudad" for v in flota if v.get("Placa Vehiculo")}

    # Gasto por vehiculo (placa)
    gasto_por_vehiculo: Dict[str, float] = {}
    def add(placa, val):
        if not placa: return
        gasto_por_vehiculo[placa] = gasto_por_vehiculo.get(placa, 0) + _num(val)

    for r in seguros: add(r.get("Placa Vehiculo"), r.get("Importe Pagado ()") or r.get("Importe Pagado ($)"))
    for r in impuestos: add(r.get("Placa Vehiculo"), r.get("Impuesto ($)"))
    for r in multas: add(r.get("Placa Vehículo") or r.get("Placa Vehiculo"), r.get("Importe pagado ($)") or r.get("Importe multa ($)"))
    for r in mantenimiento: add(r.get("Placa Vehiculo"), r.get("Costo Total ($)"))

    # Gasto por ciudad
    gasto_por_ciudad: Dict[str, float] = {}
    for placa, total in gasto_por_vehiculo.items():
        c = placa_to_ciudad.get(placa, "Sin ciudad")
        gasto_por_ciudad[c] = gasto_por_ciudad.get(c, 0) + total

    # Multas por conductor
    multas_por_conductor: Dict[str, Dict[str, float]] = {}
    for r in multas:
        cond = (r.get("Conductor") or "Sin conductor").strip() or "Sin conductor"
        if cond not in multas_por_conductor:
            multas_por_conductor[cond] = {"cantidad": 0, "total": 0.0, "pagado": 0.0, "debe": 0.0}
        multas_por_conductor[cond]["cantidad"] += 1
        multas_por_conductor[cond]["total"] += _num(r.get("Importe multa ($)"))
        multas_por_conductor[cond]["pagado"] += _num(r.get("Importe pagado ($)"))
        multas_por_conductor[cond]["debe"] += _num(r.get("Debe ($)"))

    # Consumo por vehículo (a partir de flota: km recorrido = actual - inicial; combustible aproximado)
    consumo_por_vehiculo = []
    total_km = 0.0
    total_gasto_mantenimiento = 0.0
    for v in flota:
        placa = v.get("Placa Vehiculo")
        if not placa: continue
        km_ini = _num(v.get("Kms Odómetro Inicial"))
        km_act = _num(v.get("Kms Odómetro Actual"))
        km = max(km_act - km_ini, 0)
        total_km += km
        consumo_por_vehiculo.append({
            "placa": placa,
            "modelo": f"{v.get('Marca','')} {v.get('Modelo','')}".strip(),
            "km_recorridos": km,
            "km_actual": km_act,
        })
    for r in mantenimiento:
        total_gasto_mantenimiento += _num(r.get("Costo Total ($)"))

    # Consumo combustible desde Rutas (con filtro de fecha)
    rutas_all = await db.rutas.find({}, {"_id": 0}).to_list(20000)
    rutas = await _filter_by_cities("rutas", rutas_all, cities)
    d_from = _parse_dt(desde) if desde else None
    d_to = _parse_dt(hasta) if hasta else None
    combustible_por_vehiculo: Dict[str, Dict[str, float]] = {}
    for r in rutas:
        fecha = _parse_dt(r.get("Fecha de Salida"))
        if d_from and fecha and fecha < d_from: continue
        if d_to and fecha and fecha > d_to: continue
        placa = r.get("Placa Vehiculo")
        if not placa: continue
        # Km from odometer diff (source of truth, ignore stored "Kms Recorridos" which may be dirty)
        km_ini = _num(r.get("Kms Inicial (Odómetro)"))
        km_fin = _num(r.get("Kms Final (Odómetro)"))
        km = km_fin - km_ini
        if km <= 0 or km > 3000:  # ignore outliers / invalid rows
            continue
        precio = _num(r.get("Precio x Galón ($/gal)"))
        total_comb = _num(r.get("Total Combustible ($)"))
        vol = _num(r.get("Volumen de Combustible (gal)"))
        # Prefer computed volume from precio+total if consistent; else use stored volume
        if precio > 0 and total_comb > 0:
            vol = total_comb / precio
        # Only count fuel figures if we actually have consumption data
        if vol <= 0 or total_comb <= 0:
            vol = 0
            total_comb = 0
        if placa not in combustible_por_vehiculo:
            combustible_por_vehiculo[placa] = {"km": 0.0, "galones": 0.0, "gasto": 0.0, "viajes": 0, "km_con_comb": 0.0}
        combustible_por_vehiculo[placa]["km"] += km
        combustible_por_vehiculo[placa]["galones"] += vol
        combustible_por_vehiculo[placa]["gasto"] += total_comb
        combustible_por_vehiculo[placa]["viajes"] += 1
        if vol > 0:
            combustible_por_vehiculo[placa]["km_con_comb"] += km

    consumo_combustible = []
    for placa, s in combustible_por_vehiculo.items():
        # Use only km_con_comb (km on trips where we had fuel data) for the ratio
        km_gal = (s["km_con_comb"] / s["galones"]) if s["galones"] > 0 else 0
        # Sanity cap: realistic vehicle range 3-30 km/gal; anything outside is dirty
        if km_gal > 60 or km_gal < 0:
            km_gal = 0
        consumo_combustible.append({
            "placa": placa,
            "km_recorridos": round(s["km"], 2),
            "galones": round(s["galones"], 2),
            "gasto": round(s["gasto"], 2),
            "km_por_galon": round(km_gal, 2),
            "viajes": s["viajes"],
        })
    # Sort by rendimiento (km/gal) for the fuel efficiency chart
    consumo_combustible.sort(key=lambda x: -x["km_por_galon"])

    total_gasto = sum(gasto_por_vehiculo.values())
    promedio_km = (total_km / len(consumo_por_vehiculo)) if consumo_por_vehiculo else 0
    total_galones = sum(x["galones"] for x in consumo_combustible)
    # Average km/gal computed only from vehicles with valid km/gal (>0)
    valid = [x for x in consumo_combustible if x["km_por_galon"] > 0]
    km_gal_prom = sum(x["km_por_galon"] for x in valid) / len(valid) if valid else 0

    return {
        "kpis": {
            "total_vehiculos": len(flota),
            "total_conductores": len((await db.conductores.find({}, {"_id": 0}).to_list(5000))),
            "gasto_total": round(total_gasto, 2),
            "km_total": round(total_km, 2),
            "km_promedio": round(promedio_km, 2),
            "gasto_mantenimiento": round(total_gasto_mantenimiento, 2),
            "total_galones": round(total_galones, 2),
            "km_por_galon_prom": round(km_gal_prom, 2),
            "ciudades_activas": sorted(list(cities)) if cities else None,
        },
        "consumo_combustible": consumo_combustible,
        "gasto_por_vehiculo": [
            {"placa": p, "gasto": round(t, 2)} for p, t in sorted(gasto_por_vehiculo.items(), key=lambda x: -x[1])
        ],
        "gasto_por_ciudad": [
            {"ciudad": c, "gasto": round(t, 2)} for c, t in sorted(gasto_por_ciudad.items(), key=lambda x: -x[1])
        ],
        "multas_por_conductor": [
            {"conductor": c, **{k: round(v, 2) for k, v in stats.items()}}
            for c, stats in sorted(multas_por_conductor.items(), key=lambda x: -x[1]["total"])
        ],
        "consumo_por_vehiculo": sorted(consumo_por_vehiculo, key=lambda x: -x["km_recorridos"])[:20],
    }

@api.get("/cities")
async def list_cities(user: dict = Depends(get_current_user)):
    docs = await db.flota.find({}, {"_id": 0, "Ubicacion": 1}).to_list(5000)
    cities = sorted({str(d.get("Ubicacion") or "").strip() for d in docs if d.get("Ubicacion")})
    return {"cities": cities}

# ---- Alerts / Export / Map ----
CITY_COORDS = {
    "AMBATO": [-1.2544, -78.6267],
    "CUENCA": [-2.9006, -78.9962],
    "GUAYAQUIL": [-2.1709, -79.9224],
    "MACHALA": [-3.2581, -79.9553],
    "LOJA": [-3.9931, -79.2042],
    "MANTA": [-0.9677, -80.7089],
    "QUEVEDO": [-1.0233, -79.4677],
    "QUITO": [-0.1807, -78.4678],
    "STO DOMINGO": [-0.2542, -79.1719],
    "SANTO DOMINGO": [-0.2542, -79.1719],
    "MILAGRO": [-2.1342, -79.5872],
    "BUENA FE": [-0.8853, -79.4967],
    "DAULE": [-1.8635, -79.9739],
    "BABAHOYO": [-1.8016, -79.5346],
    "DURAN": [-2.1717, -79.8300],
    "LIBERTAD": [-2.2333, -80.9000],
    "LA LIBERTAD": [-2.2333, -80.9000],
    "TRIUNFO": [-2.3833, -79.4667],
    "EL TRIUNFO": [-2.3833, -79.4667],
    "LA MANA": [-0.9439, -79.2264],
    "SALITRE": [-1.8500, -79.7833],
    "SAMBORONDON": [-1.9614, -79.7239],
    "RUTA DEL SOL": [-1.9500, -80.7500],
    "VIA A DAULE": [-1.9500, -79.9739],
    "VIA LA COSTA": [-2.1800, -80.2000],
    "CDLAS NORTE": [-2.1200, -79.9000],
    "GUASMO - CENTRO": [-2.2500, -79.8800],
    "GUASMO": [-2.2500, -79.8800],
    "DURAN - VIA SAMBORONDON": [-2.0500, -79.7800],
    "SAMBORONDON-SALITRE": [-1.9000, -79.7500],
}

def _norm_city(name):
    if not name: return None
    return str(name).strip().upper()

def _iso_date(v):
    if not v: return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None

@api.get("/alerts")
async def get_alerts(dias: int = 30, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    limit = now + timedelta(days=dias)
    alerts = []

    seguros = await db.seguros.find({}, {"_id": 0}).to_list(5000)
    for s in seguros:
        v = _iso_date(s.get("Fecha de Vencimiento"))
        if not v: continue
        v_naive = v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v
        dias_restantes = (v_naive - now).days
        if dias_restantes <= dias:
            alerts.append({
                "tipo": "Seguro",
                "modulo": "seguros",
                "placa": s.get("Placa Vehiculo"),
                "descripcion": f"Póliza {s.get('Aseguradora') or s.get('Poliza seguro') or ''}".strip(),
                "fecha_vencimiento": v.date().isoformat(),
                "dias_restantes": dias_restantes,
                "severity": "vencido" if dias_restantes < 0 else ("critico" if dias_restantes <= 7 else "advertencia"),
            })

    flota = await db.flota.find({}, {"_id": 0}).to_list(5000)
    for f in flota:
        estado = str(f.get("Estado Mantenimiento Preventivo") or "").lower()
        falta = _num(f.get("Falta para el próximo Mnnto Prev. (Km)"))
        if estado == "ingresar a taller" or falta < 0:
            alerts.append({
                "tipo": "Mantenimiento",
                "modulo": "flota",
                "placa": f.get("Placa Vehiculo"),
                "descripcion": f"Mnto preventivo vencido — {f.get('Marca','')} {f.get('Modelo','')}".strip(),
                "fecha_vencimiento": None,
                "dias_restantes": None,
                "severity": "critico",
                "km_atraso": abs(int(falta)) if falta < 0 else 0,
            })
        elif 0 <= falta <= 500:
            alerts.append({
                "tipo": "Mantenimiento",
                "modulo": "flota",
                "placa": f.get("Placa Vehiculo"),
                "descripcion": f"Mnto próximo — faltan {int(falta)} Km",
                "fecha_vencimiento": None,
                "dias_restantes": None,
                "severity": "advertencia",
                "km_restantes": int(falta),
            })

    impuestos = await db.impuestos.find({}, {"_id": 0}).to_list(5000)
    for i in impuestos:
        if not i.get("Fecha de pago"):
            alerts.append({
                "tipo": "Impuesto",
                "modulo": "impuestos",
                "placa": i.get("Placa Vehiculo"),
                "descripcion": f"{i.get('Tipo Impuesto','')} {i.get('Año Impuesto','')} sin pago",
                "fecha_vencimiento": None,
                "dias_restantes": None,
                "severity": "critico",
            })

    # Sort: severity (vencido > critico > advertencia), then by dias_restantes asc
    order = {"vencido": 0, "critico": 1, "advertencia": 2}
    alerts.sort(key=lambda a: (order.get(a["severity"], 3), a.get("dias_restantes") if a.get("dias_restantes") is not None else 999))

    return {
        "total": len(alerts),
        "por_tipo": {
            "seguros": sum(1 for a in alerts if a["tipo"] == "Seguro"),
            "mantenimiento": sum(1 for a in alerts if a["tipo"] == "Mantenimiento"),
            "impuestos": sum(1 for a in alerts if a["tipo"] == "Impuesto"),
        },
        "alertas": alerts,
    }

@api.get("/modules/{module}/export")
async def export_module(module: str, user: dict = Depends(get_current_user)):
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    from io import BytesIO
    col = _validate_module(module)
    docs = await db[col].find({}, {"_id": 0}).to_list(50000)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = module.capitalize()
    if not docs:
        ws.append(["Sin datos"])
    else:
        # Collect headers, put 'id' first
        headers = list(dict.fromkeys(k for d in docs for k in d.keys() if not k.startswith("_")))
        if "id" in headers:
            headers.remove("id")
            headers = ["id"] + headers
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="D92D20")
        for d in docs:
            ws.append([d.get(h) if not isinstance(d.get(h), (list, dict)) else str(d.get(h)) for h in headers])
        for i, h in enumerate(headers, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(12, min(40, len(str(h)) + 4))
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"{module}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@api.get("/rutas/map")
async def rutas_map(desde: Optional[str] = None, hasta: Optional[str] = None, user: dict = Depends(get_current_user)):
    rutas = await db.rutas.find({}, {"_id": 0}).to_list(20000)
    d_from = _parse_dt(desde) if desde else None
    d_to = _parse_dt(hasta) if hasta else None

    ciudades: Dict[str, Dict[str, Any]] = {}
    rutas_agg: Dict[tuple, int] = {}
    unknown = set()

    for r in rutas:
        fecha = _parse_dt(r.get("Fecha de Salida"))
        if d_from and fecha and fecha < d_from: continue
        if d_to and fecha and fecha > d_to: continue
        origen = _norm_city(r.get("Origen"))
        destino = _norm_city(r.get("Destino"))
        if not origen or not destino: continue
        for c in (origen, destino):
            if c in CITY_COORDS:
                if c not in ciudades:
                    ciudades[c] = {"nombre": c, "lat": CITY_COORDS[c][0], "lng": CITY_COORDS[c][1], "viajes": 0}
                ciudades[c]["viajes"] += 1
            else:
                unknown.add(c)
        if origen in CITY_COORDS and destino in CITY_COORDS and origen != destino:
            key = tuple(sorted([origen, destino]))
            rutas_agg[key] = rutas_agg.get(key, 0) + 1

    rutas_list = [
        {
            "origen": a,
            "destino": b,
            "viajes": count,
            "coords": [CITY_COORDS[a], CITY_COORDS[b]],
        }
        for (a, b), count in sorted(rutas_agg.items(), key=lambda x: -x[1])
    ]

    return {
        "ciudades": sorted(ciudades.values(), key=lambda c: -c["viajes"]),
        "rutas": rutas_list,
        "no_mapeadas": sorted(list(unknown)),
    }

# ---- Vehicle history + PDF + Email ----
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Control de Flota")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links must be https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Bad URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real: continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real host {real!r} (G3)")

async def _send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    if not EMAIL_KEY:
        raise HTTPException(status_code=503, detail="Servicio de email no configurado")
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logging.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail=f"Envío falló: {e.response.status_code}")

@api.get("/vehicles/{placa}/history")
async def vehicle_history(placa: str, user: dict = Depends(get_current_user)):
    placa = placa.upper().strip()
    vehiculo = await db.flota.find_one({"Placa Vehiculo": placa}, {"_id": 0})
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")

    seguros = await db.seguros.find({"Placa Vehiculo": placa}, {"_id": 0}).to_list(500)
    impuestos = await db.impuestos.find({"Placa Vehiculo": placa}, {"_id": 0}).to_list(500)
    mantenimiento = await db.mantenimiento.find({"Placa Vehiculo": placa}, {"_id": 0}).to_list(500)
    rutas = await db.rutas.find({"Placa Vehiculo": placa}, {"_id": 0}).to_list(2000)
    multas_a = await db.multas.find({"Placa Vehículo": placa}, {"_id": 0}).to_list(500)
    multas_b = await db.multas.find({"Placa Vehiculo": placa}, {"_id": 0}).to_list(500)
    multas = multas_a + multas_b

    total_seguros = sum(_num(s.get("Importe Pagado ()") or s.get("Importe Pagado ($)")) for s in seguros)
    total_impuestos = sum(_num(i.get("Impuesto ($)")) for i in impuestos)
    total_mnto = sum(_num(m.get("Costo Total ($)")) for m in mantenimiento)
    total_multas = sum(_num(m.get("Importe pagado ($)")) for m in multas)
    total_combustible = sum(_num(r.get("Total Combustible ($)")) for r in rutas)
    km_rutas = 0.0
    for r in rutas:
        km = _num(r.get("Kms Final (Odómetro)")) - _num(r.get("Kms Inicial (Odómetro)"))
        if 0 < km < 3000: km_rutas += km

    return {
        "vehiculo": vehiculo,
        "seguros": seguros,
        "impuestos": impuestos,
        "mantenimiento": mantenimiento,
        "rutas": rutas,
        "multas": multas,
        "totales": {
            "seguros": round(total_seguros, 2),
            "impuestos": round(total_impuestos, 2),
            "mantenimiento": round(total_mnto, 2),
            "multas": round(total_multas, 2),
            "combustible": round(total_combustible, 2),
            "gasto_total": round(total_seguros + total_impuestos + total_mnto + total_multas + total_combustible, 2),
            "km_recorridos": round(km_rutas, 2),
            "rutas_count": len(rutas),
        },
    }

def _fmt_money(v):
    try: return f"${float(v):,.2f}"
    except Exception: return "-"

def _fmt_date(v):
    if not v: return "-"
    s = str(v)
    if "T" in s: s = s.split("T")[0]
    return s

@api.get("/vehicles/{placa}/history/pdf")
async def vehicle_history_pdf(placa: str, user: dict = Depends(get_current_user)):
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from io import BytesIO

    hist = await vehicle_history(placa, user)
    v = hist["vehiculo"]
    t = hist["totales"]

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch, leftMargin=0.5*inch, rightMargin=0.5*inch)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="H1red", parent=styles["Heading1"], textColor=colors.HexColor("#D92D20"), spaceAfter=6))
    styles.add(ParagraphStyle(name="H2s", parent=styles["Heading2"], textColor=colors.HexColor("#111827"), spaceBefore=14, spaceAfter=4, fontSize=12))
    styles.add(ParagraphStyle(name="small", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#6B7280")))

    story = []
    story.append(Paragraph("Historial de Vehículo", styles["H1red"]))
    story.append(Paragraph(f"Placa: <b>{escape(placa.upper())}</b> · Generado: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles["small"]))
    story.append(Spacer(1, 12))

    ficha = [
        ["Marca", str(v.get("Marca","-") or "-"), "Modelo", str(v.get("Modelo","-") or "-")],
        ["Tipo", str(v.get("Tipo","-") or "-"), "Año", str(v.get("Año de fabricacion","-") or "-")],
        ["Color", str(v.get("Color","-") or "-"), "Empresa", str(v.get("Empresa","-") or "-")],
        ["Ciudad", str(v.get("Ubicacion","-") or "-"), "Estado", str(v.get("Estado Vehiculo","-") or "-")],
        ["Usuario Asignado", str(v.get("Usuario asignado","-") or "-"), "Status", str(v.get("Status","-") or "-")],
        ["Km Actual", f"{_num(v.get('Kms Odómetro Actual')):,.0f}", "Estado Mnto", str(v.get("Estado Mantenimiento Preventivo","-") or "-")],
    ]
    tbl = Table(ficha, colWidths=[1.4*inch, 2.1*inch, 1.4*inch, 2.1*inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F3F4F6")),
        ("BACKGROUND", (2,0), (2,-1), colors.HexColor("#F3F4F6")),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#E5E7EB")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(tbl)

    story.append(Paragraph("Resumen Económico", styles["H2s"]))
    tot = [
        ["Gasto Total", _fmt_money(t["gasto_total"])],
        ["Seguros", _fmt_money(t["seguros"])],
        ["Impuestos", _fmt_money(t["impuestos"])],
        ["Mantenimiento", _fmt_money(t["mantenimiento"])],
        ["Multas", _fmt_money(t["multas"])],
        ["Combustible", _fmt_money(t["combustible"])],
        ["Km recorridos (rutas)", f"{t['km_recorridos']:,.0f} Km"],
        ["Total viajes", str(t["rutas_count"])],
    ]
    tt = Table(tot, colWidths=[3*inch, 2*inch])
    tt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#D92D20")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#E5E7EB")),
        ("ALIGN", (1,0), (1,-1), "RIGHT"),
    ]))
    story.append(tt)

    def _section(title, rows, headers):
        story.append(Paragraph(title, styles["H2s"]))
        if not rows:
            story.append(Paragraph("<i>Sin registros.</i>", styles["Normal"]))
            return
        data = [headers] + rows
        tab = Table(data, repeatRows=1)
        tab.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#111827")),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 8),
            ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#E5E7EB")),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F9FAFB")]),
        ]))
        story.append(tab)

    _section("Seguros", [
        [_fmt_date(s.get("Fecha de inicio")), _fmt_date(s.get("Fecha de Vencimiento")),
         str(s.get("Aseguradora") or "-")[:24], str(s.get("Poliza seguro") or "-")[:18],
         _fmt_money(s.get("Importe Pagado ()") or s.get("Importe Pagado ($)")),
         str(s.get("Estado Poliza") or "-")[:12]]
        for s in hist["seguros"]
    ], ["Inicio", "Vencimiento", "Aseguradora", "Póliza", "Importe", "Estado"])

    _section("Impuestos", [
        [str(i.get("Año Impuesto") or "-"), str(i.get("Tipo Impuesto") or "-")[:18],
         _fmt_money(i.get("Impuesto ($)")), _fmt_date(i.get("Fecha de pago")),
         str(i.get("Ciudad") or "-")[:14], str(i.get("Responsable") or "-")[:18]]
        for i in hist["impuestos"]
    ], ["Año", "Tipo", "Impuesto", "F. Pago", "Ciudad", "Responsable"])

    _section("Mantenimiento", [
        [str(m.get("Nro") or "-"), _fmt_date(m.get("Fecha Entrada")), _fmt_date(m.get("Fecha Salida")),
         str(m.get("Taller") or "-")[:20], str(m.get("Tipo") or "-")[:12],
         str(m.get("Paquete de Mantenimiento") or "-")[:22],
         _fmt_money(m.get("Costo Total ($)"))]
        for m in hist["mantenimiento"]
    ], ["Nro", "Entrada", "Salida", "Taller", "Tipo", "Paquete", "Costo"])

    _section("Multas", [
        [_fmt_date(m.get("Fecha")), str(m.get("Conductor") or "-")[:20],
         str(m.get("Infracción") or "-")[:26],
         _fmt_money(m.get("Importe multa ($)")), _fmt_money(m.get("Importe pagado ($)")),
         str(m.get("Estado Pago") or "-")[:10]]
        for m in hist["multas"]
    ], ["Fecha", "Conductor", "Infracción", "Multa", "Pagado", "Estado"])

    rutas_rows = []
    for r in hist["rutas"][:60]:
        km = _num(r.get("Kms Final (Odómetro)")) - _num(r.get("Kms Inicial (Odómetro)"))
        rutas_rows.append([
            _fmt_date(r.get("Fecha de Salida")),
            _fmt_date(r.get("Fecha de Llegada")),
            str(r.get("Origen") or "-")[:14],
            str(r.get("Destino") or "-")[:14],
            f"{max(km, 0):,.0f}",
            _fmt_money(r.get("Total Combustible ($)")),
            _fmt_money(r.get("Gasto Total ($)")),
        ])
    _section(f"Rutas (mostrando {min(60, len(hist['rutas']))} de {len(hist['rutas'])})", rutas_rows,
             ["Salida", "Llegada", "Origen", "Destino", "Km", "Combustible", "Gasto Total"])

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="historial_{placa.upper()}.pdf"'},
    )

@api.post("/alerts/send-mnto-emails")
async def send_mnto_emails(user: dict = Depends(require_admin)):
    flota = await db.flota.find({}, {"_id": 0}).to_list(5000)
    users_list = await db.users.find({}, {"_id": 0}).to_list(2000)
    users_by_username = {u.get("username", "").lower(): u for u in users_list}

    sent, skipped = [], []
    for f in flota:
        estado = str(f.get("Estado Mantenimiento Preventivo") or "").lower()
        falta = _num(f.get("Falta para el próximo Mnnto Prev. (Km)"))
        if not (estado == "ingresar a taller" or falta < 0):
            continue
        placa = f.get("Placa Vehiculo") or "—"
        asignado_raw = f.get("Usuario asignado") or ""
        asignado = str(asignado_raw).strip().lower()
        u = users_by_username.get(asignado)
        email = (u.get("email") if u else None) or None
        if not email:
            skipped.append({"placa": placa, "razon": f"Sin email para usuario '{asignado_raw or '—'}'"})
            continue
        km_atraso = abs(int(falta)) if falta < 0 else 0
        marca_modelo = f"{f.get('Marca','')} {f.get('Modelo','')}".strip()
        subject = f"Mantenimiento vencido — Vehículo {placa}"
        html = (
            '<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;'
            'font-family:Arial,sans-serif;background:#ffffff">'
            '<tr><td style="padding:24px;border-bottom:3px solid #D92D20">'
            f'<h2 style="margin:0;color:#111827;font-size:20px">Aviso de Mantenimiento Vencido</h2>'
            f'<p style="margin:4px 0 0;color:#6B7280;font-size:12px">Enviado por {escape(EMAIL_FROM_NAME)}</p>'
            '</td></tr>'
            '<tr><td style="padding:20px 24px;color:#111827;font-size:14px;line-height:1.5">'
            f'<p>Hola <strong>{escape(str(u.get("name","Responsable")))}</strong>,</p>'
            f'<p>El vehículo asignado presenta mantenimiento preventivo <strong>vencido</strong>:</p>'
            '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px">'
            f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold;width:35%">Placa</td>'
            f'<td style="padding:8px;background:#FEF2F2;font-family:monospace">{escape(str(placa))}</td></tr>'
            f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold">Vehículo</td>'
            f'<td style="padding:8px">{escape(marca_modelo)}</td></tr>'
            f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold">Km de atraso</td>'
            f'<td style="padding:8px;font-family:monospace;color:#D92D20"><strong>{km_atraso:,} Km</strong></td></tr>'
            f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold">Odómetro actual</td>'
            f'<td style="padding:8px;font-family:monospace">{_num(f.get("Kms Odómetro Actual")):,.0f} Km</td></tr>'
            '</table>'
            '<p>Por favor coordina el ingreso a taller lo antes posible.</p>'
            '</td></tr>'
            '<tr><td style="padding:16px 24px;background:#F9FAFB;color:#6B7280;font-size:11px;border-top:1px solid #E5E7EB">'
            f'Este mensaje fue generado automáticamente por {escape(EMAIL_FROM_NAME)}. Nunca pedimos '
            'contraseñas ni datos de tarjeta por correo.'
            '</td></tr></table>'
        )
        try:
            eid = await _send_email(to=email, subject=subject, html=html)
            sent.append({"placa": placa, "email": email, "usuario": u.get("name"), "email_id": eid})
        except HTTPException as e:
            skipped.append({"placa": placa, "razon": f"Error: {e.detail}"})

    return {"total_enviados": len(sent), "total_omitidos": len(skipped), "enviados": sent, "omitidos": skipped}

async def _notify_multa_sin_pago(multa: dict) -> Optional[str]:
    """Send email to the vehicle's assigned user when a fine is created without payment date."""
    placa = multa.get("Placa Vehículo") or multa.get("Placa Vehiculo")
    if not placa:
        return None
    veh = await db.flota.find_one({"Placa Vehiculo": placa}, {"_id": 0})
    if not veh:
        return None
    asignado_raw = veh.get("Usuario asignado") or ""
    asignado = str(asignado_raw).strip().lower()
    u = await db.users.find_one({"username": asignado}, {"_id": 0}) if asignado else None
    email = (u.get("email") if u else None) or None
    if not email:
        logging.info(f"Multa {placa}: sin email para usuario '{asignado_raw or '—'}'")
        return None

    conductor = escape(str(multa.get("Conductor") or "—"))
    infraccion = escape(str(multa.get("Infracción") or "—"))
    fecha_multa = escape(str(multa.get("Fecha") or "—")[:10])
    importe = _num(multa.get("Importe multa ($)"))
    debe = _num(multa.get("Debe ($)"))
    marca_modelo = escape(f"{veh.get('Marca','')} {veh.get('Modelo','')}".strip())
    subject = f"Multa pendiente de pago — Vehículo {placa}"
    html = (
        '<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;'
        'font-family:Arial,sans-serif;background:#ffffff">'
        '<tr><td style="padding:24px;border-bottom:3px solid #F59E0B">'
        f'<h2 style="margin:0;color:#111827;font-size:20px">Multa registrada sin fecha de pago</h2>'
        f'<p style="margin:4px 0 0;color:#6B7280;font-size:12px">Enviado por {escape(EMAIL_FROM_NAME)}</p>'
        '</td></tr>'
        '<tr><td style="padding:20px 24px;color:#111827;font-size:14px;line-height:1.5">'
        f'<p>Hola <strong>{escape(str(u.get("name","Responsable")))}</strong>,</p>'
        f'<p>Se registró una nueva multa asociada al vehículo bajo tu cargo y aún <strong>no tiene fecha de pago</strong>:</p>'
        '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px">'
        f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold;width:35%">Placa</td>'
        f'<td style="padding:8px;background:#FEF3C7;font-family:monospace">{escape(str(placa))}</td></tr>'
        f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold">Vehículo</td>'
        f'<td style="padding:8px">{marca_modelo}</td></tr>'
        f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold">Conductor</td>'
        f'<td style="padding:8px">{conductor}</td></tr>'
        f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold">Fecha de la multa</td>'
        f'<td style="padding:8px">{fecha_multa}</td></tr>'
        f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold">Infracción</td>'
        f'<td style="padding:8px">{infraccion}</td></tr>'
        f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold">Importe</td>'
        f'<td style="padding:8px;font-family:monospace"><strong>${importe:,.2f}</strong></td></tr>'
        f'<tr><td style="padding:8px;background:#F3F4F6;font-weight:bold">Saldo por pagar</td>'
        f'<td style="padding:8px;font-family:monospace;color:#D92D20"><strong>${debe:,.2f}</strong></td></tr>'
        '</table>'
        '<p>Por favor coordina el pago y registra la fecha en el sistema.</p>'
        '</td></tr>'
        '<tr><td style="padding:16px 24px;background:#F9FAFB;color:#6B7280;font-size:11px;border-top:1px solid #E5E7EB">'
        f'Este mensaje fue generado automáticamente por {escape(EMAIL_FROM_NAME)}. Nunca pedimos '
        'contraseñas ni datos de tarjeta por correo.'
        '</td></tr></table>'
    )
    return await _send_email(to=email, subject=subject, html=html)


async def seed_admin_and_data():
    # Admin user
    admin_username = os.environ.get("ADMIN_USERNAME", "aeortega").lower()
    admin_email = os.environ.get("ADMIN_EMAIL", "aeortega@indurama.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin_name = os.environ.get("ADMIN_NAME", "Alejandro Ortega")

    existing = await db.users.find_one({"username": admin_username})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": admin_username,
            "name": admin_name,
            "email": admin_email,
            "role": "admin",
            "password_hash": hash_password(admin_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        # Ensure password matches env for reproducibility
        if not verify_password(admin_password, existing.get("password_hash", "")):
            await db.users.update_one({"id": existing["id"]}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Sample regular user
    if not await db.users.find_one({"username": "operador"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": "operador",
            "name": "Operador Demo",
            "email": None,
            "role": "user",
            "password_hash": hash_password("operador123"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Seed module data from JSON if collections empty
    seed_file = ROOT_DIR / "seed_data.json"
    if seed_file.exists():
        with open(seed_file, encoding="utf-8") as f:
            data = json.load(f)
        mapping = {
            "Flota": "flota", "Seguros": "seguros", "Impuestos": "impuestos",
            "Talleres": "talleres", "Conductores": "conductores",
            "Multas": "multas", "Mantenimiento": "mantenimiento",
            "Rutas": "rutas",
        }
        for sheet, col in mapping.items():
            existing_count = await db[col].count_documents({})
            if existing_count == 0 and sheet in data:
                docs = []
                for rec in data[sheet]:
                    docs.append({"id": str(uuid.uuid4()), **rec})
                if docs:
                    await db[col].insert_many(docs)

    # Indexes
    await db.users.create_index("username", unique=True)
    await db.users.create_index("id", unique=True)

@app.on_event("startup")
async def _startup():
    await seed_admin_and_data()
    await _seed_warehouses()
    await _seed_expenses_module()

@app.on_event("shutdown")
async def _shutdown():
    client.close()


# ---- Tools module ----
class ToolIn(BaseModel):
    marca: str
    modelo: Optional[str] = None
    serie: Optional[str] = None
    descripcion: Optional[str] = None
    fecha_compra: Optional[str] = None
    valor: Optional[float] = 0

class ToolUpdate(BaseModel):
    marca: Optional[str] = None
    modelo: Optional[str] = None
    serie: Optional[str] = None
    descripcion: Optional[str] = None
    fecha_compra: Optional[str] = None
    valor: Optional[float] = None
    estado: Optional[str] = None  # Activa | Inactiva

class TechIn(BaseModel):
    nombre: str
    apellido: str
    codigo: str
    ciudad: Optional[str] = None
    email: Optional[str] = None
    cedula: Optional[str] = None

class TechUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    codigo: Optional[str] = None
    ciudad: Optional[str] = None
    email: Optional[str] = None
    cedula: Optional[str] = None

class AssignmentIn(BaseModel):
    tool_id: str
    technician_id: str

class AssignmentBatchIn(BaseModel):
    technician_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    tool_ids: List[str]
    destination_type: str = "technician"  # "technician" | "warehouse"


class ReturnBatchIn(BaseModel):
    technician_id: str
    assignment_ids: List[str]  # ids of tool_assignments (Vigente) to return


class TransferIn(BaseModel):
    from_warehouse_id: str
    to_warehouse_id: str
    tool_ids: List[str]
    notas: Optional[str] = None


class WarehouseIn(BaseModel):
    nombre: str
    ciudad: str
    email: Optional[str] = None


class BulkDeactivateIn(BaseModel):
    tool_ids: List[str]
    action: str = "deactivate"  # "deactivate" | "reactivate"

async def _next_tool_code() -> str:
    docs = await db.tools.find({}, {"_id": 0, "tool_id": 1}).to_list(20000)
    max_n = 0
    for d in docs:
        code = str(d.get("tool_id") or "")
        if code.startswith("TL-"):
            try:
                n = int(code[3:])
                if n > max_n: max_n = n
            except Exception:
                pass
    return f"TL-{max_n + 1:04d}"

@api.get("/tools/tools")
async def list_tools(user: dict = Depends(get_current_user)):
    docs = await db.tools.find({}, {"_id": 0}).to_list(5000)
    return docs

@api.post("/tools/tools")
async def create_tool(payload: ToolIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "tool_id": await _next_tool_code(),
        "marca": payload.marca.strip(),
        "modelo": (payload.modelo or "").strip() or None,
        "serie": (payload.serie or "").strip() or None,
        "descripcion": (payload.descripcion or "").strip() or None,
        "fecha_compra": payload.fecha_compra,
        "valor": float(payload.valor or 0),
        "estado": "Activa",
        "_created_by": user["username"],
        "_created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tools.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/tools/tools/{tool_id}")
async def update_tool(tool_id: str, payload: ToolUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None or k in ("modelo","serie","descripcion","fecha_compra")}
    if "estado" in update and update["estado"] not in ("Activa", "Inactiva"):
        raise HTTPException(status_code=400, detail="Estado inválido")
    if not update:
        raise HTTPException(status_code=400, detail="Sin cambios")
    res = await db.tools.update_one({"id": tool_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    # If deactivated, auto-close any active assignments
    if update.get("estado") == "Inactiva":
        today = datetime.now(timezone.utc).date().isoformat()
        await db.tool_assignments.update_many(
            {"tool_id": tool_id, "estado": "Vigente"},
            {"$set": {"estado": "Devuelta", "fecha_devolucion": today}},
        )
    return {"ok": True}

@api.get("/tools/technicians")
async def list_techs(user: dict = Depends(get_current_user)):
    docs = await db.tool_technicians.find({}, {"_id": 0}).to_list(5000)
    return docs

@api.post("/tools/technicians")
async def create_tech(payload: TechIn, user: dict = Depends(get_current_user)):
    exists = await db.tool_technicians.find_one({"codigo": payload.codigo.strip()})
    if exists:
        raise HTTPException(status_code=400, detail="Código de técnico ya existe")
    doc = {
        "id": str(uuid.uuid4()),
        "nombre": payload.nombre.strip(),
        "apellido": payload.apellido.strip(),
        "codigo": payload.codigo.strip(),
        "ciudad": (payload.ciudad or "").strip() or None,
        "email": (payload.email or "").strip() or None,
        "cedula": (payload.cedula or "").strip() or None,
        "_created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tool_technicians.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/tools/technicians/{tech_id}")
async def update_tech(tech_id: str, payload: TechUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="Sin cambios")
    res = await db.tool_technicians.update_one({"id": tech_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    return {"ok": True}

async def _enrich_assignments(assignments: list) -> list:
    tools_map = {t["id"]: t for t in await db.tools.find({}, {"_id": 0}).to_list(5000)}
    techs_map = {t["id"]: t for t in await db.tool_technicians.find({}, {"_id": 0}).to_list(5000)}
    wh_map = {w["id"]: w for w in await db.tool_warehouses.find({}, {"_id": 0}).to_list(500)}
    out = []
    for a in assignments:
        t = tools_map.get(a.get("tool_id"), {})
        tech = techs_map.get(a.get("technician_id"), {}) if a.get("technician_id") else {}
        wh = wh_map.get(a.get("warehouse_id"), {}) if a.get("warehouse_id") else {}
        ciudad = tech.get("ciudad") or wh.get("ciudad")
        out.append({
            **a,
            "tool_code": t.get("tool_id"),
            "tool_marca": t.get("marca"),
            "tool_modelo": t.get("modelo"),
            "tool_serie": t.get("serie"),
            "tool_valor": t.get("valor"),
            "technician_codigo": tech.get("codigo"),
            "technician_nombre": tech.get("nombre"),
            "technician_apellido": tech.get("apellido"),
            "warehouse_nombre": wh.get("nombre"),
            "warehouse_ciudad": wh.get("ciudad"),
            "ciudad": ciudad,
        })
    return out

@api.post("/tools/assignments")
async def create_assignment(payload: AssignmentIn, user: dict = Depends(get_current_user)):
    tool = await db.tools.find_one({"id": payload.tool_id}, {"_id": 0})
    if not tool:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    if tool.get("estado") != "Activa":
        raise HTTPException(status_code=400, detail="La herramienta está inactiva y no puede asignarse")
    tech = await db.tool_technicians.find_one({"id": payload.technician_id}, {"_id": 0})
    if not tech:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    # Ensure the tool is not already assigned
    active = await db.tool_assignments.find_one({"tool_id": payload.tool_id, "estado": "Vigente"})
    if active:
        raise HTTPException(status_code=400, detail="La herramienta ya está asignada actualmente")
    doc = {
        "id": str(uuid.uuid4()),
        "tool_id": payload.tool_id,
        "technician_id": payload.technician_id,
        "fecha_asignacion": datetime.now(timezone.utc).date().isoformat(),
        "fecha_devolucion": None,
        "estado": "Vigente",
        "_created_by": user["username"],
    }
    await db.tool_assignments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/tools/assignments/{assignment_id}/return")
async def return_assignment(assignment_id: str, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    res = await db.tool_assignments.update_one(
        {"id": assignment_id, "estado": "Vigente"},
        {"$set": {"estado": "Devuelta", "fecha_devolucion": today, "_returned_by": user["username"]}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Asignación vigente no encontrada")
    return {"ok": True}

def _build_assignment_pdf(recipient: dict, tools_list: list, batch_id: str, creator_name: str, kind: str = "technician", title: Optional[str] = None) -> bytes:
    """kind: 'technician' | 'warehouse' | 'return' | 'transfer'"""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from io import BytesIO

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch, leftMargin=0.6*inch, rightMargin=0.6*inch)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Hred", parent=styles["Heading1"], textColor=colors.HexColor("#D92D20"), spaceAfter=4))
    styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#6B7280")))
    styles.add(ParagraphStyle(name="H2s", parent=styles["Heading2"], textColor=colors.HexColor("#111827"), spaceBefore=14, spaceAfter=4, fontSize=12))

    if not title:
        titles = {
            "technician": "Acta de Entrega de Herramientas — Técnico",
            "warehouse": "Acta de Entrega a Bodega",
            "return": "Acta de Devolución de Herramientas",
            "transfer": "Acta de Traspaso entre Bodegas",
        }
        title = titles.get(kind, "Acta de Herramientas")

    story = []
    story.append(Paragraph(title, styles["Hred"]))
    story.append(Paragraph(f"Batch: <b>{batch_id[:8]}</b> · Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M')} · Generado por: {escape(creator_name)}", styles["Small"]))
    story.append(Spacer(1, 12))

    # Recipient section varies by kind
    if kind in ("technician", "return"):
        header_label = "Técnico"
        tech_data = [
            [f"Nombre {header_label}", f"{recipient.get('nombre','')} {recipient.get('apellido','')}", "Código", recipient.get("codigo","-")],
            ["Cédula", recipient.get("cedula") or "-", "Ciudad", recipient.get("ciudad") or "-"],
            ["Correo", recipient.get("email") or "-", "", ""],
        ]
    elif kind == "warehouse":
        tech_data = [
            ["Bodega", recipient.get("nombre","-"), "Ciudad", recipient.get("ciudad") or "-"],
            ["Correo bodega", recipient.get("email") or "-", "", ""],
        ]
    else:  # transfer -> recipient is {"from": wh, "to": wh}
        f = recipient.get("from") or {}
        t = recipient.get("to") or {}
        tech_data = [
            ["Bodega ORIGEN", f.get("nombre","-"), "Ciudad", f.get("ciudad") or "-"],
            ["Bodega DESTINO", t.get("nombre","-"), "Ciudad", t.get("ciudad") or "-"],
        ]

    tbl = Table(tech_data, colWidths=[1.3*inch, 2.3*inch, 1.1*inch, 2.0*inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F3F4F6")),
        ("BACKGROUND", (2,0), (2,-1), colors.HexColor("#F3F4F6")),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#E5E7EB")),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(tbl)

    section_titles = {
        "technician": "Herramientas Entregadas",
        "warehouse": "Herramientas Entregadas a Bodega",
        "return": "Herramientas Devueltas",
        "transfer": "Herramientas Trasladadas",
    }
    story.append(Paragraph(section_titles.get(kind, "Herramientas"), styles["H2s"]))
    rows = [["ID", "Marca", "Modelo", "Serie", "F. Compra", "Valor"]]
    total = 0.0
    for tool in tools_list:
        val = float(tool.get("valor") or 0)
        total += val
        rows.append([
            tool.get("tool_id") or "-",
            str(tool.get("marca") or "-")[:22],
            str(tool.get("modelo") or "-")[:22],
            str(tool.get("serie") or "-")[:20],
            str(tool.get("fecha_compra") or "-")[:10],
            f"${val:,.2f}",
        ])
    rows.append(["", "", "", "", "TOTAL", f"${total:,.2f}"])
    tt = Table(rows, repeatRows=1, colWidths=[0.8*inch, 1.3*inch, 1.3*inch, 1.4*inch, 1.0*inch, 1.0*inch])
    tt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("BACKGROUND", (-2,-1), (-1,-1), colors.HexColor("#D92D20")),
        ("TEXTCOLOR", (-2,-1), (-1,-1), colors.white),
        ("FONTNAME", (-2,-1), (-1,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ALIGN", (-1,1), (-1,-1), "RIGHT"),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS", (0,1), (-1,-2), [colors.white, colors.HexColor("#F9FAFB")]),
    ]))
    story.append(tt)
    story.append(Spacer(1, 30))
    firma_labels = {
        "technician": ("Entrega (Responsable)", f"Recibe: {recipient.get('nombre','')} {recipient.get('apellido','')}"),
        "warehouse": ("Entrega (Responsable)", f"Recibe Bodega: {recipient.get('nombre','')}"),
        "return": (f"Devuelve: {recipient.get('nombre','')} {recipient.get('apellido','')}", "Recibe Bodega (Responsable)"),
        "transfer": (f"Origen: {(recipient.get('from') or {}).get('nombre','')}", f"Destino: {(recipient.get('to') or {}).get('nombre','')}"),
    }
    l1, l2 = firma_labels.get(kind, ("", ""))
    firma = [["", ""], ["_____________________________", "_____________________________"], [l1, l2]]
    fs = Table(firma, colWidths=[3.2*inch, 3.2*inch])
    fs.setStyle(TableStyle([("FONTSIZE", (0,0), (-1,-1), 9), ("ALIGN", (0,0), (-1,-1), "CENTER")]))
    story.append(fs)

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()

@api.post("/tools/assignments/batch")
async def create_assignments_batch(payload: AssignmentBatchIn, user: dict = Depends(get_current_user)):
    if not payload.tool_ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos una herramienta")
    dest = (payload.destination_type or "technician").lower()
    if dest not in ("technician", "warehouse"):
        raise HTTPException(status_code=400, detail="Tipo de destino inválido")

    tech = None
    wh = None
    if dest == "technician":
        if not payload.technician_id:
            raise HTTPException(status_code=400, detail="Selecciona un técnico")
        tech = await db.tool_technicians.find_one({"id": payload.technician_id}, {"_id": 0})
        if not tech:
            raise HTTPException(status_code=404, detail="Técnico no encontrado")
    else:
        if not payload.warehouse_id:
            raise HTTPException(status_code=400, detail="Selecciona una bodega")
        wh = await db.tool_warehouses.find_one({"id": payload.warehouse_id}, {"_id": 0})
        if not wh:
            raise HTTPException(status_code=404, detail="Bodega no encontrada")

    tools_docs = []
    for tid in payload.tool_ids:
        tool = await db.tools.find_one({"id": tid}, {"_id": 0})
        if not tool:
            raise HTTPException(status_code=404, detail=f"Herramienta no encontrada: {tid}")
        if tool.get("estado") != "Activa":
            raise HTTPException(status_code=400, detail=f"{tool.get('tool_id')} está inactiva y no puede asignarse")
        active = await db.tool_assignments.find_one({"tool_id": tid, "estado": "Vigente"})
        if active:
            # Auto-close a warehouse-only active assignment (moving tool out of warehouse)
            if active.get("technician_id"):
                raise HTTPException(status_code=400, detail=f"{tool.get('tool_id')} ya está asignada a un técnico")
            # else: warehouse assignment, close it silently
            await db.tool_assignments.update_one(
                {"id": active["id"]},
                {"$set": {"estado": "Devuelta", "fecha_devolucion": datetime.now(timezone.utc).date().isoformat(), "_returned_by": user["username"]}},
            )
        tools_docs.append(tool)

    batch_id = str(uuid.uuid4())
    today = datetime.now(timezone.utc).date().isoformat()
    for tool in tools_docs:
        assignment_doc = {
            "id": str(uuid.uuid4()),
            "tool_id": tool["id"],
            "technician_id": payload.technician_id if dest == "technician" else None,
            "warehouse_id": payload.warehouse_id if dest == "warehouse" else None,
            "destination_type": dest,
            "batch_id": batch_id,
            "fecha_asignacion": today,
            "fecha_devolucion": None,
            "estado": "Vigente",
            "_created_by": user["username"],
        }
        await db.tool_assignments.insert_one(assignment_doc)

    creator = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    creator_name = (creator.get("name") if creator else None) or user.get("username")

    if dest == "technician":
        pdf_bytes = _build_assignment_pdf(tech, tools_docs, batch_id, creator_name, kind="technician")
    else:
        pdf_bytes = _build_assignment_pdf(wh, tools_docs, batch_id, creator_name, kind="warehouse",
                                          title=f"Acta de Entrega a Bodega {wh.get('ciudad') or ''}".strip())

    await db.tool_assignment_batches.insert_one({
        "id": batch_id,
        "technician_id": payload.technician_id,
        "warehouse_id": payload.warehouse_id,
        "destination_type": dest,
        "tool_ids": payload.tool_ids,
        "fecha": today,
        "pdf_hex": pdf_bytes.hex(),
        "created_by": user["username"],
        "kind": dest,
    })

    # Build email
    total = sum(float(t.get("valor") or 0) for t in tools_docs)
    tool_rows_html = "".join([
        f'<tr><td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace">{escape(str(t.get("tool_id") or ""))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #E5E7EB">{escape(str(t.get("marca") or ""))} {escape(str(t.get("modelo") or ""))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace">{escape(str(t.get("serie") or "-"))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace;text-align:right">${float(t.get("valor") or 0):,.2f}</td></tr>'
        for t in tools_docs
    ])

    if dest == "technician":
        subject = f"Acta de entrega de herramientas — {tech.get('nombre')} {tech.get('apellido')}"
        recipient_line = (
            f'<p><strong>Técnico:</strong> {escape(str(tech.get("nombre") or ""))} {escape(str(tech.get("apellido") or ""))} — Código {escape(str(tech.get("codigo") or ""))}</p>'
            f'<p><strong>Cédula:</strong> {escape(str(tech.get("cedula") or "—"))} · <strong>Ciudad:</strong> {escape(str(tech.get("ciudad") or "—"))}</p>'
        )
    else:
        subject = f"Acta de entrega a Bodega {wh.get('ciudad') or ''} — {len(tools_docs)} herramientas"
        recipient_line = (
            f'<p><strong>Bodega:</strong> {escape(str(wh.get("nombre") or ""))}</p>'
            f'<p><strong>Ciudad:</strong> {escape(str(wh.get("ciudad") or "—"))}</p>'
        )

    html = (
        '<table role="presentation" width="100%" style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;background:#ffffff">'
        f'<tr><td style="padding:22px 24px;border-bottom:3px solid #D92D20">'
        f'<h2 style="margin:0;color:#111827">{"Acta de entrega a bodega" if dest == "warehouse" else "Acta de entrega de herramientas"}</h2>'
        f'<p style="margin:4px 0 0;color:#6B7280;font-size:12px">Enviado por {escape(EMAIL_FROM_NAME)}</p></td></tr>'
        '<tr><td style="padding:18px 24px;color:#111827;font-size:14px">'
        f'{recipient_line}'
        f'<p><strong>Fecha:</strong> {today} · <strong>Entregado por:</strong> {escape(creator_name)}</p>'
        '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">'
        '<thead><tr style="background:#111827;color:white">'
        '<th style="padding:6px 8px;text-align:left">ID</th><th style="padding:6px 8px;text-align:left">Herramienta</th>'
        '<th style="padding:6px 8px;text-align:left">Serie</th><th style="padding:6px 8px;text-align:right">Valor</th></tr></thead>'
        f'<tbody>{tool_rows_html}'
        f'<tr><td colspan="3" style="padding:8px;text-align:right;background:#D92D20;color:white;font-weight:bold">TOTAL</td>'
        f'<td style="padding:8px;text-align:right;background:#D92D20;color:white;font-weight:bold;font-family:monospace">${total:,.2f}</td></tr>'
        '</tbody></table>'
        f'<p style="margin-top:12px;color:#6B7280;font-size:12px">Se adjunta el acta oficial en PDF (descargable desde el sistema).</p>'
        '</td></tr>'
        '<tr><td style="padding:14px 24px;background:#F9FAFB;color:#6B7280;font-size:11px;border-top:1px solid #E5E7EB">'
        f'Este correo fue generado automáticamente por {escape(EMAIL_FROM_NAME)}. Nunca solicitamos contraseñas ni datos de tarjeta por correo.'
        '</td></tr></table>'
    )
    recipients = []
    if dest == "technician" and tech.get("email"):
        recipients.append(("Técnico", tech["email"]))
    if dest == "warehouse" and wh.get("email"):
        recipients.append(("Bodega", wh["email"]))
    if creator and creator.get("email"):
        recipients.append(("Responsable", creator["email"]))

    emails_sent, emails_skipped = [], []
    for who, addr in recipients:
        try:
            eid = await _send_email(to=addr, subject=subject, html=html)
            emails_sent.append({"tipo": who, "email": addr, "email_id": eid})
        except Exception as e:
            emails_skipped.append({"tipo": who, "email": addr, "error": str(e)})

    return {
        "batch_id": batch_id,
        "total_herramientas": len(tools_docs),
        "valor_total": round(total, 2),
        "destination_type": dest,
        "emails_enviados": emails_sent,
        "emails_omitidos": emails_skipped,
    }

@api.get("/tools/assignments/batch/{batch_id}/pdf")
async def get_batch_pdf(batch_id: str, user: dict = Depends(get_current_user)):
    b = await db.tool_assignment_batches.find_one({"id": batch_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Acta no encontrada")
    pdf_bytes = bytes.fromhex(b["pdf_hex"])
    from io import BytesIO
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="acta_{batch_id[:8]}.pdf"'},
    )

@api.get("/tools/reports/current")
async def report_current(ciudad: Optional[str] = None, technician_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"estado": "Vigente", "destination_type": {"$ne": "warehouse"}}
    if technician_id: query["technician_id"] = technician_id
    docs = await db.tool_assignments.find(query, {"_id": 0}).to_list(5000)
    enriched = await _enrich_assignments(docs)
    if ciudad:
        enriched = [e for e in enriched if _norm(e.get("ciudad")) == _norm(ciudad)]
    return enriched

@api.get("/tools/reports/history")
async def report_history(ciudad: Optional[str] = None, user: dict = Depends(get_current_user)):
    docs = await db.tool_assignments.find({"destination_type": {"$ne": "warehouse"}}, {"_id": 0}).sort("fecha_asignacion", -1).to_list(20000)
    enriched = await _enrich_assignments(docs)
    if ciudad:
        enriched = [e for e in enriched if _norm(e.get("ciudad")) == _norm(ciudad)]
    return enriched

@api.get("/tools/dashboard")
async def tools_dashboard(user: dict = Depends(get_current_user)):
    tools = await db.tools.find({}, {"_id": 0}).to_list(5000)
    techs = {t["id"]: t for t in await db.tool_technicians.find({}, {"_id": 0}).to_list(5000)}
    warehouses = {w["id"]: w for w in await db.tool_warehouses.find({}, {"_id": 0}).to_list(500)}
    assignments = await db.tool_assignments.find({}, {"_id": 0}).sort("fecha_asignacion", -1).to_list(20000)

    # For every tool, look up its most recent Vigente assignment (that determines its city).
    # If none Vigente, fall back to most recent of any state.
    tool_active: Dict[str, dict] = {}
    tool_last: Dict[str, dict] = {}
    for a in assignments:
        tid = a.get("tool_id")
        if not tid: continue
        if a.get("estado") == "Vigente" and tid not in tool_active:
            tool_active[tid] = a
        if tid not in tool_last:
            tool_last[tid] = a

    def _tool_city(t):
        a = tool_active.get(t.get("id")) or tool_last.get(t.get("id")) or {}
        if a.get("technician_id"):
            tech = techs.get(a["technician_id"])
            return (tech.get("ciudad") if tech else None) or "Sin ciudad"
        if a.get("warehouse_id"):
            wh = warehouses.get(a["warehouse_id"])
            return (wh.get("ciudad") if wh else None) or "Sin ciudad"
        return "Sin ciudad"

    per_city: Dict[str, Dict[str, float]] = {}
    total_activa = 0.0
    total_inactiva = 0.0
    for t in tools:
        val = float(t.get("valor") or 0)
        ciudad = _tool_city(t)
        estado = t.get("estado") or "Activa"
        if ciudad not in per_city:
            per_city[ciudad] = {"activa": 0.0, "inactiva": 0.0, "activa_count": 0, "inactiva_count": 0}
        if estado == "Activa":
            per_city[ciudad]["activa"] += val
            per_city[ciudad]["activa_count"] += 1
            total_activa += val
        else:
            per_city[ciudad]["inactiva"] += val
            per_city[ciudad]["inactiva_count"] += 1
            total_inactiva += val

    ciudades = [
        {
            "ciudad": c,
            "activa": round(v["activa"], 2),
            "inactiva": round(v["inactiva"], 2),
            "total": round(v["activa"] + v["inactiva"], 2),
            "activa_count": v["activa_count"],
            "inactiva_count": v["inactiva_count"],
        }
        for c, v in sorted(per_city.items(), key=lambda x: -(x[1]["activa"] + x[1]["inactiva"]))
    ]
    return {
        "kpis": {
            "total_activa": round(total_activa, 2),
            "total_inactiva": round(total_inactiva, 2),
            "total_valor": round(total_activa + total_inactiva, 2),
            "count_tools": len(tools),
            "count_activas": sum(1 for t in tools if t.get("estado") != "Inactiva"),
            "count_inactivas": sum(1 for t in tools if t.get("estado") == "Inactiva"),
        },
        "ciudades": ciudades,
    }



# ============================================================================
# Warehouses (bodegas internas por ciudad)
# ============================================================================
async def _seed_warehouses():
    """Ensure one warehouse per city present in flota + tool_technicians."""
    cities_flota = await db.flota.distinct("Ubicacion")
    cities_tech = await db.tool_technicians.distinct("ciudad")
    all_cities = set()
    for c in list(cities_flota) + list(cities_tech):
        if not c: continue
        s = str(c).strip()
        if s: all_cities.add(s)
    default_email = os.environ.get("WAREHOUSE_EMAIL") or None
    for ciudad in all_cities:
        exists = await db.tool_warehouses.find_one({"ciudad": ciudad})
        if exists: continue
        await db.tool_warehouses.insert_one({
            "id": str(uuid.uuid4()),
            "nombre": f"Bodega {ciudad.title()}",
            "ciudad": ciudad,
            "email": default_email,
            "_created_at": datetime.now(timezone.utc).isoformat(),
        })

async def _get_or_create_warehouse_for_city(ciudad: str) -> Optional[dict]:
    if not ciudad: return None
    ciudad = str(ciudad).strip()
    wh = await db.tool_warehouses.find_one({"ciudad": ciudad}, {"_id": 0})
    if wh: return wh
    default_email = os.environ.get("WAREHOUSE_EMAIL") or None
    doc = {
        "id": str(uuid.uuid4()),
        "nombre": f"Bodega {ciudad.title()}",
        "ciudad": ciudad,
        "email": default_email,
        "_created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tool_warehouses.insert_one(doc)
    return doc

@api.get("/tools/warehouses")
async def list_warehouses(user: dict = Depends(get_current_user)):
    docs = await db.tool_warehouses.find({}, {"_id": 0}).sort("ciudad", 1).to_list(500)
    return docs

@api.get("/tools/warehouses/{warehouse_id}/tools")
async def list_tools_at_warehouse(warehouse_id: str, user: dict = Depends(get_current_user)):
    """Return all tools currently sitting at the given warehouse (Vigente warehouse assignments)."""
    assignments = await db.tool_assignments.find({
        "warehouse_id": warehouse_id,
        "destination_type": "warehouse",
        "estado": "Vigente",
    }, {"_id": 0}).to_list(5000)
    if not assignments:
        return []
    tools_map = {t["id"]: t for t in await db.tools.find({}, {"_id": 0}).to_list(5000)}
    out = []
    for a in assignments:
        t = tools_map.get(a.get("tool_id"))
        if not t: continue
        out.append({
            "assignment_id": a["id"],
            "tool_id": t["id"],
            "tool_code": t.get("tool_id"),
            "marca": t.get("marca"),
            "modelo": t.get("modelo"),
            "serie": t.get("serie"),
            "valor": t.get("valor"),
            "estado": t.get("estado"),
            "fecha_ingreso": a.get("fecha_asignacion"),
        })
    return out

# ============================================================================
# Seed test data
# ============================================================================
@api.post("/tools/seed-test-data")
async def seed_test_data(user: dict = Depends(require_admin)):
    """Generate 20 random tools and 5 technicians per known city."""
    import random
    brands = ["DEWALT", "MAKITA", "STANLEY", "BOSCH", "MILWAUKEE", "BLACK & DECKER", "TRUPER", "HILTI", "RIDGID", "METABO"]
    models = ["Taladro percutor", "Esmeril angular", "Sierra circular", "Atornillador eléctrico",
              "Compresor 2HP", "Soldadora MIG", "Pulidora", "Martillo demoledor", "Sierra caladora",
              "Rotomartillo SDS", "Llave de impacto", "Multímetro digital", "Lijadora orbital",
              "Ingletadora", "Sopladora industrial", "Gata hidráulica", "Generador portátil"]
    now = datetime.now(timezone.utc)

    tools_created = []
    for _ in range(20):
        marca = random.choice(brands)
        modelo = random.choice(models)
        serie = f"{marca[:3].upper()}-{random.randint(10000, 999999)}"
        valor = round(random.uniform(45, 850), 2)
        fecha_compra = (now - timedelta(days=random.randint(30, 720))).date().isoformat()
        code = await _next_tool_code()
        doc = {
            "id": str(uuid.uuid4()),
            "tool_id": code,
            "marca": marca,
            "modelo": modelo,
            "serie": serie,
            "descripcion": f"{modelo} {marca} (seed test)",
            "fecha_compra": fecha_compra,
            "valor": valor,
            "estado": "Activa",
            "_created_by": user["username"],
            "_created_at": now.isoformat(),
            "_seed": True,
        }
        await db.tools.insert_one(doc)
        tools_created.append(code)

    # 5 techs per city
    cities = await db.flota.distinct("Ubicacion")
    cities = sorted({str(c).strip() for c in cities if c and str(c).strip()})
    nombres_m = ["Carlos", "Luis", "Jorge", "Andrés", "Pablo", "Diego", "Fernando", "Javier", "Mauricio", "Alejandro"]
    nombres_f = ["María", "Ana", "Lucía", "Carmen", "Verónica", "Patricia", "Silvia", "Laura", "Gabriela", "Andrea"]
    apellidos = ["García", "Rodríguez", "López", "Martínez", "Pérez", "Sánchez", "Vega", "Torres", "Ramírez", "Castro",
                 "Jiménez", "Morales", "Ortega", "Vargas", "Herrera", "Flores", "Rivera", "Cedeño", "Zambrano", "Espinoza"]

    techs_created = 0
    for ciudad in cities:
        for _ in range(5):
            nombre = random.choice(nombres_m + nombres_f)
            apellido = random.choice(apellidos)
            # Ensure unique code
            for _try in range(30):
                codigo = f"TC-{random.randint(1000, 99999)}"
                if not await db.tool_technicians.find_one({"codigo": codigo}):
                    break
            cedula = "".join(str(random.randint(0, 9)) for _ in range(10))
            email = f"{nombre.lower().replace(' ','')}.{apellido.lower().replace(' ','')}{random.randint(1,99)}@indurama.test"
            await db.tool_technicians.insert_one({
                "id": str(uuid.uuid4()),
                "nombre": nombre,
                "apellido": apellido,
                "codigo": codigo,
                "ciudad": ciudad,
                "email": email,
                "cedula": cedula,
                "_created_at": now.isoformat(),
                "_seed": True,
            })
            techs_created += 1

    # Ensure warehouses exist for all cities
    await _seed_warehouses()
    warehouses_total = await db.tool_warehouses.count_documents({})

    return {
        "ok": True,
        "tools_creadas": len(tools_created),
        "tecnicos_creados": techs_created,
        "ciudades_procesadas": len(cities),
        "bodegas_totales": warehouses_total,
        "tools_codes": tools_created,
    }

# ============================================================================
# Returns (devolución: técnico -> bodega de su ciudad)
# ============================================================================
def _build_return_pdf(technician: dict, warehouse: dict, tools_list: list, batch_id: str, creator_name: str) -> bytes:
    return _build_assignment_pdf(
        {**technician, "_wh_nombre": warehouse.get("nombre"), "_wh_ciudad": warehouse.get("ciudad")},
        tools_list, batch_id, creator_name, kind="return",
        title=f"Acta de Devolución a Bodega {warehouse.get('ciudad') or ''}".strip(),
    )

@api.post("/tools/returns")
async def create_return_batch(payload: ReturnBatchIn, user: dict = Depends(get_current_user)):
    if not payload.assignment_ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos una asignación a devolver")
    tech = await db.tool_technicians.find_one({"id": payload.technician_id}, {"_id": 0})
    if not tech:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    if not tech.get("ciudad"):
        raise HTTPException(status_code=400, detail="El técnico no tiene ciudad asignada; asigne una ciudad antes de devolver")

    # Validate all assignments belong to the tech and are Vigente technician-type
    assignments = []
    tools_docs = []
    for aid in payload.assignment_ids:
        a = await db.tool_assignments.find_one({"id": aid}, {"_id": 0})
        if not a or a.get("estado") != "Vigente":
            raise HTTPException(status_code=400, detail=f"Asignación {aid[:8]} no está vigente")
        if a.get("technician_id") != tech["id"]:
            raise HTTPException(status_code=400, detail="Una asignación no corresponde al técnico seleccionado")
        assignments.append(a)
        tool = await db.tools.find_one({"id": a["tool_id"]}, {"_id": 0})
        if tool:
            tools_docs.append(tool)

    # Get/create warehouse for tech city
    wh = await _get_or_create_warehouse_for_city(tech["ciudad"])
    if not wh:
        raise HTTPException(status_code=400, detail="No se pudo determinar/crear bodega para la ciudad")

    today = datetime.now(timezone.utc).date().isoformat()
    batch_id = str(uuid.uuid4())
    # Close each tech assignment and open a warehouse assignment
    for a, tool in zip(assignments, tools_docs):
        await db.tool_assignments.update_one(
            {"id": a["id"]},
            {"$set": {"estado": "Devuelta", "fecha_devolucion": today, "_returned_by": user["username"], "return_batch_id": batch_id}},
        )
        await db.tool_assignments.insert_one({
            "id": str(uuid.uuid4()),
            "tool_id": tool["id"],
            "technician_id": None,
            "warehouse_id": wh["id"],
            "destination_type": "warehouse",
            "batch_id": batch_id,
            "fecha_asignacion": today,
            "fecha_devolucion": None,
            "estado": "Vigente",
            "_created_by": user["username"],
            "source": "return",
        })

    creator = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    creator_name = (creator.get("name") if creator else None) or user.get("username")
    pdf_bytes = _build_return_pdf(tech, wh, tools_docs, batch_id, creator_name)
    await db.tool_return_batches.insert_one({
        "id": batch_id,
        "technician_id": tech["id"],
        "warehouse_id": wh["id"],
        "tool_ids": [t["id"] for t in tools_docs],
        "fecha": today,
        "pdf_hex": pdf_bytes.hex(),
        "created_by": user["username"],
    })

    # Emails
    total = sum(float(t.get("valor") or 0) for t in tools_docs)
    tool_rows_html = "".join([
        f'<tr><td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace">{escape(str(t.get("tool_id") or ""))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #E5E7EB">{escape(str(t.get("marca") or ""))} {escape(str(t.get("modelo") or ""))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace">{escape(str(t.get("serie") or "-"))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace;text-align:right">${float(t.get("valor") or 0):,.2f}</td></tr>'
        for t in tools_docs
    ])
    subject = f"Acta de devolución — {tech.get('nombre')} {tech.get('apellido')} → Bodega {wh.get('ciudad')}"
    html = (
        '<table role="presentation" width="100%" style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;background:#ffffff">'
        f'<tr><td style="padding:22px 24px;border-bottom:3px solid #16A34A">'
        f'<h2 style="margin:0;color:#111827">Acta de devolución a bodega</h2>'
        f'<p style="margin:4px 0 0;color:#6B7280;font-size:12px">Enviado por {escape(EMAIL_FROM_NAME)}</p></td></tr>'
        '<tr><td style="padding:18px 24px;color:#111827;font-size:14px">'
        f'<p><strong>Técnico:</strong> {escape(str(tech.get("nombre") or ""))} {escape(str(tech.get("apellido") or ""))} — Código {escape(str(tech.get("codigo") or ""))}</p>'
        f'<p><strong>Cédula:</strong> {escape(str(tech.get("cedula") or "—"))} · <strong>Ciudad:</strong> {escape(str(tech.get("ciudad") or "—"))}</p>'
        f'<p><strong>Bodega destino:</strong> {escape(str(wh.get("nombre") or ""))} — {escape(str(wh.get("ciudad") or ""))}</p>'
        f'<p><strong>Fecha:</strong> {today} · <strong>Recibido por:</strong> {escape(creator_name)}</p>'
        '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">'
        '<thead><tr style="background:#111827;color:white">'
        '<th style="padding:6px 8px;text-align:left">ID</th><th style="padding:6px 8px;text-align:left">Herramienta</th>'
        '<th style="padding:6px 8px;text-align:left">Serie</th><th style="padding:6px 8px;text-align:right">Valor</th></tr></thead>'
        f'<tbody>{tool_rows_html}'
        f'<tr><td colspan="3" style="padding:8px;text-align:right;background:#16A34A;color:white;font-weight:bold">TOTAL</td>'
        f'<td style="padding:8px;text-align:right;background:#16A34A;color:white;font-weight:bold;font-family:monospace">${total:,.2f}</td></tr>'
        '</tbody></table>'
        '</td></tr>'
        '<tr><td style="padding:14px 24px;background:#F9FAFB;color:#6B7280;font-size:11px;border-top:1px solid #E5E7EB">'
        f'Este correo fue generado automáticamente por {escape(EMAIL_FROM_NAME)}. Nunca solicitamos contraseñas ni datos de tarjeta por correo.'
        '</td></tr></table>'
    )
    recipients = []
    if tech.get("email"): recipients.append(("Técnico", tech["email"]))
    if wh.get("email"): recipients.append(("Bodega", wh["email"]))
    if creator and creator.get("email"): recipients.append(("Responsable", creator["email"]))
    emails_sent, emails_skipped = [], []
    for who, addr in recipients:
        try:
            eid = await _send_email(to=addr, subject=subject, html=html)
            emails_sent.append({"tipo": who, "email": addr, "email_id": eid})
        except Exception as e:
            emails_skipped.append({"tipo": who, "email": addr, "error": str(e)})

    return {
        "batch_id": batch_id,
        "total_herramientas": len(tools_docs),
        "valor_total": round(total, 2),
        "warehouse_id": wh["id"],
        "warehouse_nombre": wh["nombre"],
        "emails_enviados": emails_sent,
        "emails_omitidos": emails_skipped,
    }

@api.get("/tools/returns/{batch_id}/pdf")
async def get_return_pdf(batch_id: str, user: dict = Depends(get_current_user)):
    b = await db.tool_return_batches.find_one({"id": batch_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Acta no encontrada")
    pdf_bytes = bytes.fromhex(b["pdf_hex"])
    from io import BytesIO
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="devolucion_{batch_id[:8]}.pdf"'},
    )

# ============================================================================
# Transfers (bodega origen -> bodega destino)
# ============================================================================
@api.post("/tools/transfers")
async def create_transfer(payload: TransferIn, user: dict = Depends(get_current_user)):
    if not payload.tool_ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos una herramienta")
    if payload.from_warehouse_id == payload.to_warehouse_id:
        raise HTTPException(status_code=400, detail="La bodega origen y destino no pueden ser la misma")
    src = await db.tool_warehouses.find_one({"id": payload.from_warehouse_id}, {"_id": 0})
    dst = await db.tool_warehouses.find_one({"id": payload.to_warehouse_id}, {"_id": 0})
    if not src or not dst:
        raise HTTPException(status_code=404, detail="Bodega no encontrada")

    tools_docs = []
    active_assignments = []
    for tid in payload.tool_ids:
        tool = await db.tools.find_one({"id": tid}, {"_id": 0})
        if not tool:
            raise HTTPException(status_code=404, detail=f"Herramienta no encontrada: {tid}")
        a = await db.tool_assignments.find_one({
            "tool_id": tid, "estado": "Vigente", "warehouse_id": src["id"], "destination_type": "warehouse",
        }, {"_id": 0})
        if not a:
            raise HTTPException(status_code=400, detail=f"{tool.get('tool_id')} no está en la bodega origen")
        tools_docs.append(tool)
        active_assignments.append(a)

    today = datetime.now(timezone.utc).date().isoformat()
    batch_id = str(uuid.uuid4())
    for a, tool in zip(active_assignments, tools_docs):
        await db.tool_assignments.update_one(
            {"id": a["id"]},
            {"$set": {"estado": "Devuelta", "fecha_devolucion": today, "_returned_by": user["username"], "transfer_batch_id": batch_id}},
        )
        await db.tool_assignments.insert_one({
            "id": str(uuid.uuid4()),
            "tool_id": tool["id"],
            "technician_id": None,
            "warehouse_id": dst["id"],
            "destination_type": "warehouse",
            "batch_id": batch_id,
            "fecha_asignacion": today,
            "fecha_devolucion": None,
            "estado": "Vigente",
            "_created_by": user["username"],
            "source": "transfer",
        })

    creator = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    creator_name = (creator.get("name") if creator else None) or user.get("username")
    pdf_bytes = _build_assignment_pdf(
        {"from": src, "to": dst}, tools_docs, batch_id, creator_name, kind="transfer",
        title=f"Acta de Traspaso — {src.get('ciudad')} → {dst.get('ciudad')}",
    )
    await db.tool_transfers.insert_one({
        "id": batch_id,
        "from_warehouse_id": src["id"],
        "to_warehouse_id": dst["id"],
        "from_ciudad": src.get("ciudad"),
        "to_ciudad": dst.get("ciudad"),
        "tool_ids": [t["id"] for t in tools_docs],
        "notas": (payload.notas or None),
        "fecha": today,
        "pdf_hex": pdf_bytes.hex(),
        "created_by": user["username"],
    })

    # Emails: admin + bodega genérica (WAREHOUSE_EMAIL) and both warehouses' emails if present
    total = sum(float(t.get("valor") or 0) for t in tools_docs)
    tool_rows_html = "".join([
        f'<tr><td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace">{escape(str(t.get("tool_id") or ""))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #E5E7EB">{escape(str(t.get("marca") or ""))} {escape(str(t.get("modelo") or ""))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace">{escape(str(t.get("serie") or "-"))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace;text-align:right">${float(t.get("valor") or 0):,.2f}</td></tr>'
        for t in tools_docs
    ])
    subject = f"Acta de traspaso Bodega {src.get('ciudad')} → Bodega {dst.get('ciudad')} · {len(tools_docs)} herramientas"
    html = (
        '<table role="presentation" width="100%" style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;background:#ffffff">'
        f'<tr><td style="padding:22px 24px;border-bottom:3px solid #2563EB">'
        f'<h2 style="margin:0;color:#111827">Acta de traspaso entre bodegas</h2>'
        f'<p style="margin:4px 0 0;color:#6B7280;font-size:12px">Enviado por {escape(EMAIL_FROM_NAME)}</p></td></tr>'
        '<tr><td style="padding:18px 24px;color:#111827;font-size:14px">'
        f'<p><strong>Origen:</strong> {escape(str(src.get("nombre") or ""))} — {escape(str(src.get("ciudad") or ""))}</p>'
        f'<p><strong>Destino:</strong> {escape(str(dst.get("nombre") or ""))} — {escape(str(dst.get("ciudad") or ""))}</p>'
        f'<p><strong>Fecha:</strong> {today} · <strong>Autorizado por:</strong> {escape(creator_name)}</p>'
        + (f'<p><strong>Notas:</strong> {escape(str(payload.notas or ""))}</p>' if payload.notas else "")
        + '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">'
        '<thead><tr style="background:#111827;color:white">'
        '<th style="padding:6px 8px;text-align:left">ID</th><th style="padding:6px 8px;text-align:left">Herramienta</th>'
        '<th style="padding:6px 8px;text-align:left">Serie</th><th style="padding:6px 8px;text-align:right">Valor</th></tr></thead>'
        f'<tbody>{tool_rows_html}'
        f'<tr><td colspan="3" style="padding:8px;text-align:right;background:#2563EB;color:white;font-weight:bold">TOTAL</td>'
        f'<td style="padding:8px;text-align:right;background:#2563EB;color:white;font-weight:bold;font-family:monospace">${total:,.2f}</td></tr>'
        '</tbody></table>'
        '</td></tr>'
        '<tr><td style="padding:14px 24px;background:#F9FAFB;color:#6B7280;font-size:11px;border-top:1px solid #E5E7EB">'
        f'Este correo fue generado automáticamente por {escape(EMAIL_FROM_NAME)}. Nunca solicitamos contraseñas ni datos de tarjeta por correo.'
        '</td></tr></table>'
    )
    recipients = []
    if src.get("email"): recipients.append(("Bodega Origen", src["email"]))
    if dst.get("email"): recipients.append(("Bodega Destino", dst["email"]))
    if creator and creator.get("email"): recipients.append(("Responsable", creator["email"]))
    generic = os.environ.get("WAREHOUSE_EMAIL")
    if generic and not any(r[1].lower() == generic.lower() for r in recipients):
        recipients.append(("Bodega General", generic))

    # Dedupe by email
    seen = set()
    dedup_recipients = []
    for who, addr in recipients:
        low = (addr or "").lower()
        if not low or low in seen: continue
        seen.add(low)
        dedup_recipients.append((who, addr))

    emails_sent, emails_skipped = [], []
    for who, addr in dedup_recipients:
        try:
            eid = await _send_email(to=addr, subject=subject, html=html)
            emails_sent.append({"tipo": who, "email": addr, "email_id": eid})
        except Exception as e:
            emails_skipped.append({"tipo": who, "email": addr, "error": str(e)})

    return {
        "batch_id": batch_id,
        "total_herramientas": len(tools_docs),
        "valor_total": round(total, 2),
        "from_warehouse": {"id": src["id"], "ciudad": src.get("ciudad")},
        "to_warehouse": {"id": dst["id"], "ciudad": dst.get("ciudad")},
        "emails_enviados": emails_sent,
        "emails_omitidos": emails_skipped,
    }

@api.get("/tools/transfers")
async def list_transfers(user: dict = Depends(get_current_user)):
    docs = await db.tool_transfers.find({}, {"_id": 0, "pdf_hex": 0}).sort("fecha", -1).to_list(2000)
    return docs

@api.get("/tools/transfers/{batch_id}/pdf")
async def get_transfer_pdf(batch_id: str, user: dict = Depends(get_current_user)):
    b = await db.tool_transfers.find_one({"id": batch_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Acta no encontrada")
    pdf_bytes = bytes.fromhex(b["pdf_hex"])
    from io import BytesIO
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="traspaso_{batch_id[:8]}.pdf"'},
    )


# ============================================================================
# Bulk operations & Warehouse inventory PDF & Technician history
# ============================================================================
@api.post("/tools/tools/bulk-deactivate")
async def bulk_deactivate_tools(payload: BulkDeactivateIn, user: dict = Depends(get_current_user)):
    if not payload.tool_ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos una herramienta")
    action = (payload.action or "deactivate").lower()
    if action not in ("deactivate", "reactivate"):
        raise HTTPException(status_code=400, detail="Acción inválida")
    new_estado = "Inactiva" if action == "deactivate" else "Activa"
    res = await db.tools.update_many({"id": {"$in": payload.tool_ids}}, {"$set": {"estado": new_estado}})
    closed = 0
    if new_estado == "Inactiva":
        today = datetime.now(timezone.utc).date().isoformat()
        r2 = await db.tool_assignments.update_many(
            {"tool_id": {"$in": payload.tool_ids}, "estado": "Vigente"},
            {"$set": {"estado": "Devuelta", "fecha_devolucion": today, "_returned_by": user["username"]}},
        )
        closed = r2.modified_count
    return {
        "ok": True,
        "matched": res.matched_count,
        "modified": res.modified_count,
        "estado_final": new_estado,
        "assignments_cerradas": closed,
    }

def _build_inventory_pdf(warehouse: dict, tools_at_wh: list, generated_by: str) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from io import BytesIO

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch, leftMargin=0.6*inch, rightMargin=0.6*inch)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Hred", parent=styles["Heading1"], textColor=colors.HexColor("#D92D20"), spaceAfter=4))
    styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#6B7280")))
    styles.add(ParagraphStyle(name="H2s", parent=styles["Heading2"], textColor=colors.HexColor("#111827"), spaceBefore=14, spaceAfter=4, fontSize=12))

    story = []
    story.append(Paragraph(f"Inventario de Bodega — {warehouse.get('ciudad','')}", styles["Hred"]))
    story.append(Paragraph(
        f"Bodega: <b>{escape(str(warehouse.get('nombre','')))}</b> · Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M')} · Generado por: {escape(generated_by)}",
        styles["Small"],
    ))
    story.append(Spacer(1, 12))

    total = 0.0
    rows = [["ID", "Marca", "Modelo", "Serie", "F. Compra", "F. Ingreso Bodega", "Valor"]]
    for t in tools_at_wh:
        val = float(t.get("valor") or 0)
        total += val
        rows.append([
            t.get("tool_code") or "-",
            str(t.get("marca") or "-")[:22],
            str(t.get("modelo") or "-")[:22],
            str(t.get("serie") or "-")[:18],
            str(t.get("fecha_compra") or "-")[:10],
            str(t.get("fecha_ingreso") or "-")[:10],
            f"${val:,.2f}",
        ])
    rows.append(["", "", "", "", "", "TOTAL", f"${total:,.2f}"])
    tt = Table(rows, repeatRows=1, colWidths=[0.7*inch, 1.2*inch, 1.2*inch, 1.2*inch, 0.9*inch, 1.1*inch, 0.9*inch])
    tt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("BACKGROUND", (-2,-1), (-1,-1), colors.HexColor("#D92D20")),
        ("TEXTCOLOR", (-2,-1), (-1,-1), colors.white),
        ("FONTNAME", (-2,-1), (-1,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 8.5),
        ("ALIGN", (-1,1), (-1,-1), "RIGHT"),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS", (0,1), (-1,-2), [colors.white, colors.HexColor("#F9FAFB")]),
    ]))
    story.append(tt)
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Total de herramientas: <b>{len(tools_at_wh)}</b>", styles["Normal"]))
    doc.build(story)
    buf.seek(0)
    return buf.getvalue()

@api.get("/tools/warehouses/{warehouse_id}/inventory/pdf")
async def get_warehouse_inventory_pdf(warehouse_id: str, user: dict = Depends(get_current_user)):
    wh = await db.tool_warehouses.find_one({"id": warehouse_id}, {"_id": 0})
    if not wh:
        raise HTTPException(status_code=404, detail="Bodega no encontrada")
    tools_at_wh = await list_tools_at_warehouse(warehouse_id, user)
    creator = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    creator_name = (creator.get("name") if creator else None) or user.get("username")
    pdf_bytes = _build_inventory_pdf(wh, tools_at_wh, creator_name)
    from io import BytesIO
    city_slug = (wh.get("ciudad") or "bodega").lower().replace(" ", "_")
    date_slug = datetime.now().strftime("%Y%m%d")
    filename = f"inventario_{city_slug}_{date_slug}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

async def _get_tech_history(technician_id: str) -> Dict[str, Any]:
    tech = await db.tool_technicians.find_one({"id": technician_id}, {"_id": 0})
    if not tech:
        raise HTTPException(status_code=404, detail="Técnico no encontrado")
    assignments = await db.tool_assignments.find(
        {"technician_id": technician_id},
        {"_id": 0},
    ).sort("fecha_asignacion", -1).to_list(20000)
    enriched = await _enrich_assignments(assignments)
    # Stats
    total_valor = 0.0
    activas = 0
    devueltas = 0
    for a in enriched:
        total_valor += float(a.get("tool_valor") or 0)
        if a.get("estado") == "Vigente":
            activas += 1
        else:
            devueltas += 1
    return {
        "technician": tech,
        "assignments": enriched,
        "stats": {
            "total": len(enriched),
            "activas": activas,
            "devueltas": devueltas,
            "valor_total": round(total_valor, 2),
        },
    }

@api.get("/tools/technicians/{technician_id}/history")
async def technician_history(technician_id: str, user: dict = Depends(get_current_user)):
    return await _get_tech_history(technician_id)

@api.get("/tools/technicians/{technician_id}/history/pdf")
async def technician_history_pdf(technician_id: str, user: dict = Depends(get_current_user)):
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from io import BytesIO

    hist = await _get_tech_history(technician_id)
    tech = hist["technician"]
    stats = hist["stats"]

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch, leftMargin=0.6*inch, rightMargin=0.6*inch)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Hred", parent=styles["Heading1"], textColor=colors.HexColor("#D92D20"), spaceAfter=4))
    styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#6B7280")))
    styles.add(ParagraphStyle(name="H2s", parent=styles["Heading2"], textColor=colors.HexColor("#111827"), spaceBefore=12, spaceAfter=4, fontSize=12))

    creator = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    creator_name = (creator.get("name") if creator else None) or user.get("username")

    story = []
    story.append(Paragraph("Historial de Herramientas por Técnico", styles["Hred"]))
    story.append(Paragraph(
        f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M')} · Generado por: {escape(creator_name)}",
        styles["Small"],
    ))
    story.append(Spacer(1, 10))

    tech_data = [
        ["Nombre", f"{tech.get('nombre','')} {tech.get('apellido','')}", "Código", tech.get("codigo","-")],
        ["Cédula", tech.get("cedula") or "-", "Ciudad", tech.get("ciudad") or "-"],
        ["Correo", tech.get("email") or "-", "", ""],
    ]
    t = Table(tech_data, colWidths=[1.3*inch, 2.3*inch, 1.1*inch, 2.0*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F3F4F6")),
        ("BACKGROUND", (2,0), (2,-1), colors.HexColor("#F3F4F6")),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#E5E7EB")),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(t)

    story.append(Paragraph("Resumen", styles["H2s"]))
    kpis = [
        ["Total asignaciones", str(stats["total"])],
        ["Vigentes", str(stats["activas"])],
        ["Devueltas", str(stats["devueltas"])],
        ["Valor total ($)", f"${stats['valor_total']:,.2f}"],
    ]
    tk = Table(kpis, colWidths=[2.5*inch, 2.0*inch])
    tk.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F3F4F6")),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#E5E7EB")),
        ("ALIGN", (1,0), (1,-1), "RIGHT"),
    ]))
    story.append(tk)

    story.append(Paragraph(f"Detalle de asignaciones ({stats['total']})", styles["H2s"]))
    if not hist["assignments"]:
        story.append(Paragraph("<i>Sin asignaciones registradas.</i>", styles["Normal"]))
    else:
        rows = [["F. Asig.", "F. Dev.", "ID", "Marca / Modelo", "Serie", "Valor", "Estado"]]
        for a in hist["assignments"]:
            rows.append([
                str(a.get("fecha_asignacion") or "-")[:10],
                str(a.get("fecha_devolucion") or "—")[:10],
                a.get("tool_code") or "-",
                (str(a.get("tool_marca") or "-") + " " + str(a.get("tool_modelo") or ""))[:26],
                str(a.get("tool_serie") or "-")[:14],
                f"${float(a.get('tool_valor') or 0):,.2f}",
                str(a.get("estado") or "-")[:12],
            ])
        tab = Table(rows, repeatRows=1, colWidths=[0.85*inch, 0.85*inch, 0.7*inch, 1.9*inch, 1.1*inch, 0.9*inch, 0.9*inch])
        tab.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#111827")),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 8),
            ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#E5E7EB")),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F9FAFB")]),
            ("ALIGN", (5,1), (5,-1), "RIGHT"),
        ]))
        story.append(tab)

    doc.build(story)
    buf.seek(0)
    tech_code = tech.get("codigo") or "tecnico"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="historial_{tech_code}.pdf"'},
    )

# ============================================================================
# MÓDULO GASTOS — Aprobación de Gastos (workflow multi-etapa)
# ============================================================================
import random as _random

REGION_CITIES = {
    "R1": ["QUITO", "AMBATO", "CUENCA", "LOJA", "SANTO DOMINGO", "LA MANA"],
    "R2": ["GUAYAQUIL", "MANTA", "MACHALA", "QUEVEDO", "MILAGRO", "BABAHOYO", "DURAN", "LA LIBERTAD"],
}
ALL_EXPENSE_CITIES = REGION_CITIES["R1"] + REGION_CITIES["R2"]

EXPENSE_ACCOUNTS = [
    ("Agua", "61035001"), ("Alquiler de Vehículo", "61020004"), ("Arriendo Inmuebles", "61020000"),
    ("Combustible y lub", "61040000"), ("Correspondencia", "61085000"), ("Energía Eléctrica", "61035000"),
    ("Fletes", "61025000"), ("Formularios imp", "61045001"), ("Garantías", "61030000"),
    ("Gastos de Viaje Loc", "61015000"), ("Gastos No deducibles", "61175001"), ("Honorarios Not y Reg", "61010002"),
    ("Implem de Seguridad", "61045004"), ("Impuesto vehicular", "61115007"), ("Impuestos y Contrib", "61115002"),
    ("Int Vehic Der Uso", "61160002"), ("Inter Act Der Uso", "61160001"), ("Mat y Sum Directos", "61045007"),
    ("Mat y Sum Indirectos", "61045008"), ("Mat y Sum Repuestos", "61045006"), ("Materiales de Limp", "61045002"),
    ("Programas y Software", "61090002"), ("Rep Mercaderia", "61030001"), ("Rep y mant de Veh", "61080004"),
    ("Rep y mant Edificios", "61080000"), ("Reproceso", "61045005"), ("Seguridad y Vigil", "61085001"),
    ("Servicio de limpieza", "61085002"), ("Servicios bancarios", "61135000"), ("Sum Div y Herram Men", "61045003"),
    ("Suministros de Of", "61045000"), ("Telefonía celular", "61035002"), ("Telefonía fija", "61035005"),
]

# username, name, email, role, region
EXPENSE_SEED_USERS = [
    ("jullaguari", "ULLAGUARI VALAREZO JIMMY FABIAN", "jullaguari@servihogar.com.ec", "coordinador", "R1"),
    ("ambato", "ACOSTA PAZMIÑO MARCELA ALEXANDRA", "ambato@servihogar.com.ec", "lider", "R2"),
    ("tarias", "ARIAS BRAVO TANIA MERCEDES", "tarias@servihogar.com.ec", "coordinador", "R2"),
    ("jelaje", "ELAJE MAYEA JENNIFER DENISSE", "jelaje@indurama.com", "lider", "R1"),
    ("tgranda", "GRANDA TORRES TATIANA ANABELL", "tgranda@servihogar.com.ec", "lider", "R1"),
    ("pmarin", "MARIN TORRES PIEDAD ESTHELA", "pmarin@servihogar.com.ec", "lider", "R2"),
    ("memejia", "MEJIA DAVILA MARIUXI ESTEFANIA", "memejia@indurama.com", "tesorero", None),
    ("gerente", "GERENTE GENERAL", "gerencia@indurama.com", "gerente", None),
]
GENERIC_PASSWORD = "indurama123"

# Estados del flujo
E_PEND_COORD = "pend_coordinador"
E_PEND_PRESUP = "pend_presupuesto"
E_PEND_FACTURA = "pend_factura"
E_PEND_COORD_FINAL = "pend_aprob_coordinador"
E_PEND_GERENCIA = "pend_aprob_gerencia"
E_APROBADO = "aprobado"
E_RECHAZADO = "rechazado"

ESTADO_LABELS = {
    E_PEND_COORD: "Pendiente aprobación coordinador",
    E_PEND_PRESUP: "Pendiente asignación presupuesto",
    E_PEND_FACTURA: "Pendiente carga de factura",
    E_PEND_COORD_FINAL: "Pendiente aprobación final coordinador",
    E_PEND_GERENCIA: "Pendiente aprobación gerencia",
    E_APROBADO: "Aprobado",
    E_RECHAZADO: "Rechazado",
}

# Etiqueta de la etapa (tiempo) que corresponde a cada transición de salida
STAGE_LABELS = {
    E_PEND_COORD: "Aprobación coordinador",
    E_PEND_PRESUP: "Asignación presupuesto",
    E_PEND_FACTURA: "Carga de factura",
    E_PEND_COORD_FINAL: "Aprobación final coordinador",
    E_PEND_GERENCIA: "Aprobación gerencia",
}


async def _seed_expenses_module():
    # Cuentas contables
    if await db.expense_accounts.count_documents({}) == 0:
        await db.expense_accounts.insert_many([
            {"id": str(uuid.uuid4()), "nombre": n, "codigo": c} for n, c in EXPENSE_ACCOUNTS
        ])
    # Usuarios del flujo
    rnd = _random.Random(42)
    for username, name, email, role, region in EXPENSE_SEED_USERS:
        if await db.users.find_one({"username": username}):
            continue
        if region in REGION_CITIES:
            ciudad = rnd.choice(REGION_CITIES[region])
        else:
            ciudad = rnd.choice(ALL_EXPENSE_CITIES)
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": username,
            "name": name,
            "email": email,
            "role": role,
            "region": region,
            "ciudad": ciudad,
            "password_hash": hash_password(GENERIC_PASSWORD),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await db.expenses.create_index("id", unique=True)


def _region_of_city(ciudad: Optional[str]) -> Optional[str]:
    if not ciudad:
        return None
    c = str(ciudad).strip().upper()
    for reg, cities in REGION_CITIES.items():
        if c in cities:
            return reg
    return None


async def _expense_notify(exp: dict, username: Optional[str], subject: str, body_lines: list):
    """Intenta enviar email al usuario indicado. Inactivo si no hay EMAIL_KEY (no bloquea)."""
    try:
        if not username:
            return
        u = await db.users.find_one({"username": username}, {"email": 1})
        to = (u or {}).get("email")
        if not to:
            return
        html = "<div style='font-family:Arial,sans-serif'>" + "".join(
            f"<p>{escape(str(l))}</p>" for l in body_lines
        ) + "</div>"
        await _send_email(to=to, subject=subject, html=html)
    except Exception as e:
        logging.info(f"[expenses] email skip: {e}")


def _expense_scope_query(user: dict) -> Optional[dict]:
    """Devuelve el filtro Mongo según el rol. None = ver todo."""
    role = user.get("role")
    if role in ("admin", "gerente", "tesorero"):
        return {}
    if role == "coordinador":
        return {"region": user.get("region")}
    # lider / user -> solo propios
    return {"solicitante_id": user.get("id")}


def _public_expense(exp: dict) -> dict:
    exp = dict(exp)
    exp.pop("_id", None)
    exp["estado_label"] = ESTADO_LABELS.get(exp.get("estado"), exp.get("estado"))
    return exp


class ExpenseCreate(BaseModel):
    cuenta_codigo: str
    proveedor: str
    fecha: str  # ISO date de la solicitud/gasto estimado
    monto: float
    necesita_presupuesto: bool = False
    url_cotizacion: Optional[str] = None
    descripcion: Optional[str] = None
    ciudad: Optional[str] = None  # solo admin puede fijarla; caso contrario la del usuario


class DecisionIn(BaseModel):
    decision: str  # 'aprobar' | 'rechazar'
    comentario: Optional[str] = None


class BudgetIn(BaseModel):
    monto_presupuesto: Optional[float] = None
    comentario: Optional[str] = None


class InvoiceIn(BaseModel):
    url_factura: str
    numero_solped: str
    fecha_gasto: str
    monto_factura: float


@api.get("/expenses/meta")
async def expenses_meta(user: dict = Depends(get_current_user)):
    accounts = await db.expense_accounts.find({}, {"_id": 0}).sort("nombre", 1).to_list(500)
    return {
        "accounts": accounts,
        "regions": REGION_CITIES,
        "cities": ALL_EXPENSE_CITIES,
        "estados": ESTADO_LABELS,
    }


@api.post("/expenses")
async def create_expense(payload: ExpenseCreate, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("lider", "admin", "user"):
        raise HTTPException(status_code=403, detail="Solo el usuario líder puede crear solicitudes")
    acc = await db.expense_accounts.find_one({"codigo": payload.cuenta_codigo}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=400, detail="Cuenta contable inválida")
    # Ciudad / región
    if user.get("role") == "admin" and payload.ciudad:
        ciudad = payload.ciudad.strip().upper()
    else:
        ciudad = (user.get("ciudad") or "").strip().upper() or None
    if not ciudad:
        raise HTTPException(status_code=400, detail="El usuario no tiene ciudad asignada")
    region = user.get("region") or _region_of_city(ciudad)

    # Numero secuencial
    last = await db.expenses.find_one({}, sort=[("seq", -1)])
    seq = (last.get("seq", 0) + 1) if last else 1
    now = datetime.now(timezone.utc).isoformat()
    estado = E_PEND_COORD
    doc = {
        "id": str(uuid.uuid4()),
        "seq": seq,
        "numero": f"SG-{seq:04d}",
        "solicitante_id": user.get("id"),
        "solicitante_nombre": user.get("name"),
        "solicitante_username": user.get("username"),
        "ciudad": ciudad,
        "region": region,
        "cuenta_codigo": acc["codigo"],
        "cuenta_nombre": acc["nombre"],
        "proveedor": payload.proveedor.strip(),
        "fecha": payload.fecha,
        "monto": round(float(payload.monto), 2),
        "necesita_presupuesto": bool(payload.necesita_presupuesto),
        "url_cotizacion": (payload.url_cotizacion or "").strip() or None,
        "descripcion": (payload.descripcion or "").strip() or None,
        "estado": estado,
        # etapas
        "presupuesto_asignado": False,
        "presupuesto_monto": None,
        "presupuesto_by": None,
        "presupuesto_fecha": None,
        "presupuesto_comentario": None,
        "url_factura": None,
        "numero_solped": None,
        "fecha_gasto": None,
        "monto_factura": None,
        "coord_final_by": None,
        "coord_final_fecha": None,
        "coord_final_comentario": None,
        "gerente_by": None,
        "gerente_fecha": None,
        "gerente_comentario": None,
        "rechazo_motivo": None,
        "rechazado_por": None,
        "rechazado_etapa": None,
        "created_at": now,
        "updated_at": now,
        "history": [
            {"estado": estado, "accion": "creada", "usuario": user.get("username"), "at": now, "comentario": None},
        ],
    }
    await db.expenses.insert_one(doc)
    await _expense_notify(doc, None, "Nueva solicitud de gasto", [])
    return _public_expense(doc)


@api.get("/expenses")
async def list_expenses(
    estado: Optional[str] = None,
    ciudad: Optional[str] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = _expense_scope_query(user)
    if q is None:
        q = {}
    if estado:
        q["estado"] = estado
    if ciudad:
        q["ciudad"] = ciudad.strip().upper()
    docs = await db.expenses.find(q, {"_id": 0}).sort("seq", -1).to_list(5000)
    # Filtro por fecha de solicitud
    def _in_range(d):
        f = d.get("fecha") or d.get("created_at") or ""
        f = str(f)[:10]
        if desde and f < desde:
            return False
        if hasta and f > hasta:
            return False
        return True
    docs = [_public_expense(d) for d in docs if _in_range(d)]
    return docs


@api.get("/expenses/dashboard")
async def expenses_dashboard(
    ciudad: Optional[str] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = _expense_scope_query(user) or {}
    if ciudad:
        q["ciudad"] = ciudad.strip().upper()
    docs = await db.expenses.find(q, {"_id": 0}).to_list(10000)

    def _in_range(d):
        f = str(d.get("fecha") or d.get("created_at") or "")[:10]
        if desde and f < desde:
            return False
        if hasta and f > hasta:
            return False
        return True
    docs = [d for d in docs if _in_range(d)]

    monto_total = 0.0
    monto_aprobado = 0.0
    aprobados = rechazados = pendientes = 0
    por_categoria: Dict[str, Dict[str, Any]] = {}
    por_ciudad: Dict[str, Dict[str, Any]] = {}
    por_estado: Dict[str, int] = {}
    # tiempos por etapa
    stage_acc: Dict[str, Dict[str, float]] = {}

    for d in docs:
        m = float(d.get("monto") or 0)
        monto_total += m
        est = d.get("estado")
        por_estado[est] = por_estado.get(est, 0) + 1
        if est == E_APROBADO:
            aprobados += 1
            monto_aprobado += float(d.get("monto_factura") or d.get("monto") or 0)
        elif est == E_RECHAZADO:
            rechazados += 1
        else:
            pendientes += 1

        cat = d.get("cuenta_nombre") or "Sin categoría"
        pc = por_categoria.setdefault(cat, {"categoria": cat, "monto": 0.0, "count": 0})
        pc["monto"] += m
        pc["count"] += 1

        ci = d.get("ciudad") or "Sin ciudad"
        cc = por_ciudad.setdefault(ci, {"ciudad": ci, "monto": 0.0, "count": 0, "aprobados": 0, "rechazados": 0})
        cc["monto"] += m
        cc["count"] += 1
        if est == E_APROBADO:
            cc["aprobados"] += 1
        elif est == E_RECHAZADO:
            cc["rechazados"] += 1

        # tiempos entre transiciones de history
        hist = sorted(d.get("history") or [], key=lambda h: h.get("at") or "")
        for i in range(len(hist) - 1):
            frm = hist[i]
            to = hist[i + 1]
            label = STAGE_LABELS.get(frm.get("estado"))
            if not label:
                continue
            try:
                t0 = datetime.fromisoformat(frm.get("at"))
                t1 = datetime.fromisoformat(to.get("at"))
                hours = (t1 - t0).total_seconds() / 3600.0
            except Exception:
                continue
            if hours < 0:
                continue
            sa = stage_acc.setdefault(label, {"horas": 0.0, "count": 0})
            sa["horas"] += hours
            sa["count"] += 1

    tiempos_etapa = [
        {"etapa": lbl, "promedio_horas": round(v["horas"] / v["count"], 2) if v["count"] else 0, "count": v["count"]}
        for lbl, v in stage_acc.items()
    ]
    # ordenar por el orden lógico del flujo
    order = list(STAGE_LABELS.values())
    tiempos_etapa.sort(key=lambda x: order.index(x["etapa"]) if x["etapa"] in order else 99)

    return {
        "kpis": {
            "total": len(docs),
            "monto_total": round(monto_total, 2),
            "monto_aprobado": round(monto_aprobado, 2),
            "aprobados": aprobados,
            "rechazados": rechazados,
            "pendientes": pendientes,
        },
        "por_categoria": sorted(por_categoria.values(), key=lambda x: -x["monto"]),
        "por_ciudad": sorted(por_ciudad.values(), key=lambda x: -x["monto"]),
        "por_estado": [{"estado": k, "label": ESTADO_LABELS.get(k, k), "count": v} for k, v in por_estado.items()],
        "tiempos_etapa": tiempos_etapa,
    }


async def _get_expense_or_404(expense_id: str, user: dict) -> dict:
    exp = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    # scope check
    q = _expense_scope_query(user)
    if q:
        if "region" in q and exp.get("region") != q["region"]:
            raise HTTPException(status_code=403, detail="Fuera de tu región")
        if "solicitante_id" in q and exp.get("solicitante_id") != q["solicitante_id"]:
            raise HTTPException(status_code=403, detail="Sin acceso a esta solicitud")
    return exp


@api.get("/expenses/{expense_id}")
async def get_expense(expense_id: str, user: dict = Depends(get_current_user)):
    exp = await _get_expense_or_404(expense_id, user)
    return _public_expense(exp)


def _push_history(update_set: dict, exp: dict, estado: str, accion: str, username: str, comentario: Optional[str]):
    now = datetime.now(timezone.utc).isoformat()
    update_set["estado"] = estado
    update_set["updated_at"] = now
    hist = exp.get("history") or []
    hist.append({"estado": estado, "accion": accion, "usuario": username, "at": now, "comentario": comentario})
    update_set["history"] = hist
    return now


@api.post("/expenses/{expense_id}/coordinator-decision")
async def coordinator_decision(expense_id: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("coordinador", "admin"):
        raise HTTPException(status_code=403, detail="Requiere rol coordinador")
    exp = await _get_expense_or_404(expense_id, user)
    if exp.get("estado") != E_PEND_COORD:
        raise HTTPException(status_code=400, detail="La solicitud no está pendiente de aprobación del coordinador")
    upd: Dict[str, Any] = {}
    if payload.decision == "rechazar":
        _push_history(upd, exp, E_RECHAZADO, "rechazada_coordinador", user.get("username"), payload.comentario)
        upd.update({"rechazo_motivo": payload.comentario, "rechazado_por": user.get("username"), "rechazado_etapa": "Aprobación coordinador"})
        await db.expenses.update_one({"id": expense_id}, {"$set": upd})
        await _expense_notify(exp, exp.get("solicitante_username"), f"Solicitud {exp['numero']} rechazada", [f"Tu solicitud {exp['numero']} fue rechazada por el coordinador.", payload.comentario or ""])
        return {"ok": True, "estado": E_RECHAZADO}
    elif payload.decision == "aprobar":
        nuevo = E_PEND_PRESUP if exp.get("necesita_presupuesto") else E_PEND_FACTURA
        _push_history(upd, exp, nuevo, "aprobada_coordinador", user.get("username"), payload.comentario)
        await db.expenses.update_one({"id": expense_id}, {"$set": upd})
        return {"ok": True, "estado": nuevo}
    raise HTTPException(status_code=400, detail="Decisión inválida")


@api.post("/expenses/{expense_id}/assign-budget")
async def assign_budget(expense_id: str, payload: BudgetIn, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("tesorero", "admin"):
        raise HTTPException(status_code=403, detail="Requiere rol tesorero")
    exp = await _get_expense_or_404(expense_id, user)
    if exp.get("estado") != E_PEND_PRESUP:
        raise HTTPException(status_code=400, detail="La solicitud no está pendiente de asignación de presupuesto")
    now = datetime.now(timezone.utc).isoformat()
    upd: Dict[str, Any] = {
        "presupuesto_asignado": True,
        "presupuesto_monto": round(float(payload.monto_presupuesto), 2) if payload.monto_presupuesto is not None else exp.get("monto"),
        "presupuesto_by": user.get("username"),
        "presupuesto_fecha": now,
        "presupuesto_comentario": payload.comentario,
    }
    _push_history(upd, exp, E_PEND_FACTURA, "presupuesto_asignado", user.get("username"), payload.comentario)
    await db.expenses.update_one({"id": expense_id}, {"$set": upd})
    await _expense_notify(exp, exp.get("solicitante_username"), f"Presupuesto asignado {exp['numero']}", [f"Se asignó el presupuesto de la solicitud {exp['numero']}. Ya puedes cargar la factura."])
    return {"ok": True, "estado": E_PEND_FACTURA}


@api.post("/expenses/{expense_id}/invoice")
async def upload_invoice(expense_id: str, payload: InvoiceIn, user: dict = Depends(get_current_user)):
    exp = await _get_expense_or_404(expense_id, user)
    if user.get("role") not in ("admin",) and exp.get("solicitante_id") != user.get("id"):
        raise HTTPException(status_code=403, detail="Solo el solicitante puede cargar la factura")
    if exp.get("estado") != E_PEND_FACTURA:
        raise HTTPException(status_code=400, detail="La solicitud no está en etapa de carga de factura")
    upd: Dict[str, Any] = {
        "url_factura": payload.url_factura.strip(),
        "numero_solped": payload.numero_solped.strip(),
        "fecha_gasto": payload.fecha_gasto,
        "monto_factura": round(float(payload.monto_factura), 2),
    }
    _push_history(upd, exp, E_PEND_COORD_FINAL, "factura_cargada", user.get("username"), None)
    await db.expenses.update_one({"id": expense_id}, {"$set": upd})
    return {"ok": True, "estado": E_PEND_COORD_FINAL}


@api.post("/expenses/{expense_id}/coordinator-final")
async def coordinator_final(expense_id: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("coordinador", "admin"):
        raise HTTPException(status_code=403, detail="Requiere rol coordinador")
    exp = await _get_expense_or_404(expense_id, user)
    if exp.get("estado") != E_PEND_COORD_FINAL:
        raise HTTPException(status_code=400, detail="La solicitud no está pendiente de aprobación final del coordinador")
    now = datetime.now(timezone.utc).isoformat()
    upd: Dict[str, Any] = {"coord_final_by": user.get("username"), "coord_final_fecha": now, "coord_final_comentario": payload.comentario}
    if payload.decision == "rechazar":
        _push_history(upd, exp, E_RECHAZADO, "rechazada_coordinador_final", user.get("username"), payload.comentario)
        upd.update({"rechazo_motivo": payload.comentario, "rechazado_por": user.get("username"), "rechazado_etapa": "Aprobación final coordinador"})
        await db.expenses.update_one({"id": expense_id}, {"$set": upd})
        await _expense_notify(exp, exp.get("solicitante_username"), f"Solicitud {exp['numero']} rechazada", [f"Tu solicitud {exp['numero']} fue rechazada en la comparación cotización/factura.", payload.comentario or ""])
        return {"ok": True, "estado": E_RECHAZADO}
    elif payload.decision == "aprobar":
        _push_history(upd, exp, E_PEND_GERENCIA, "aprobada_coordinador_final", user.get("username"), payload.comentario)
        await db.expenses.update_one({"id": expense_id}, {"$set": upd})
        return {"ok": True, "estado": E_PEND_GERENCIA}
    raise HTTPException(status_code=400, detail="Decisión inválida")


@api.post("/expenses/{expense_id}/manager-decision")
async def manager_decision(expense_id: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("gerente", "admin"):
        raise HTTPException(status_code=403, detail="Requiere rol gerente")
    exp = await _get_expense_or_404(expense_id, user)
    if exp.get("estado") != E_PEND_GERENCIA:
        raise HTTPException(status_code=400, detail="La solicitud no está pendiente de aprobación de gerencia")
    now = datetime.now(timezone.utc).isoformat()
    upd: Dict[str, Any] = {"gerente_by": user.get("username"), "gerente_fecha": now, "gerente_comentario": payload.comentario}
    if payload.decision == "rechazar":
        _push_history(upd, exp, E_RECHAZADO, "rechazada_gerencia", user.get("username"), payload.comentario)
        upd.update({"rechazo_motivo": payload.comentario, "rechazado_por": user.get("username"), "rechazado_etapa": "Aprobación gerencia"})
        await db.expenses.update_one({"id": expense_id}, {"$set": upd})
        await _expense_notify(exp, exp.get("solicitante_username"), f"Solicitud {exp['numero']} rechazada", [f"Tu solicitud {exp['numero']} fue rechazada por gerencia.", payload.comentario or ""])
        return {"ok": True, "estado": E_RECHAZADO}
    elif payload.decision == "aprobar":
        _push_history(upd, exp, E_APROBADO, "aprobada_gerencia", user.get("username"), payload.comentario)
        await db.expenses.update_one({"id": expense_id}, {"$set": upd})
        await _expense_notify(exp, exp.get("solicitante_username"), f"Solicitud {exp['numero']} APROBADA", [f"Tu solicitud {exp['numero']} fue aprobada por gerencia."])
        return {"ok": True, "estado": E_APROBADO}
    raise HTTPException(status_code=400, detail="Decisión inválida")


@api.get("/expenses/{expense_id}/pdf")
async def expense_pdf(expense_id: str, user: dict = Depends(get_current_user)):
    exp = await _get_expense_or_404(expense_id, user)
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    import io

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.6 * inch, bottomMargin=0.6 * inch, leftMargin=0.6 * inch, rightMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=styles["Title"], fontSize=16, textColor=colors.HexColor("#111827"))
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#6B7280"))
    sec = ParagraphStyle("sec", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor("#D92D20"), spaceBefore=12, spaceAfter=4)
    el = []
    el.append(Paragraph(f"Solicitud de Gasto {exp.get('numero')}", h))
    el.append(Paragraph(f"Estado actual: {ESTADO_LABELS.get(exp.get('estado'), exp.get('estado'))} · Generado {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", sub))
    el.append(Spacer(1, 10))

    def _money(v):
        try:
            return f"${float(v):,.2f}"
        except Exception:
            return "—"

    def tbl(rows):
        t = Table(rows, colWidths=[2.2 * inch, 4.6 * inch])
        t.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6B7280")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ]))
        return t

    el.append(Paragraph("Datos de la solicitud", sec))
    el.append(tbl([
        ["Solicitante", str(exp.get("solicitante_nombre") or "—")],
        ["Ciudad / Región", f"{exp.get('ciudad') or '—'} / {exp.get('region') or '—'}"],
        ["Cuenta contable", f"{exp.get('cuenta_nombre')} ({exp.get('cuenta_codigo')})"],
        ["Proveedor", str(exp.get("proveedor") or "—")],
        ["Fecha solicitud", str(exp.get("fecha") or "—")],
        ["Monto cotización", _money(exp.get("monto"))],
        ["¿Requiere presupuesto?", "Sí" if exp.get("necesita_presupuesto") else "No"],
        ["URL cotización", str(exp.get("url_cotizacion") or "—")],
        ["Descripción", str(exp.get("descripcion") or "—")],
    ]))

    if exp.get("presupuesto_asignado"):
        el.append(Paragraph("Asignación de presupuesto", sec))
        el.append(tbl([
            ["Monto presupuesto", _money(exp.get("presupuesto_monto"))],
            ["Asignado por", str(exp.get("presupuesto_by") or "—")],
            ["Fecha", str(exp.get("presupuesto_fecha") or "—")[:19].replace("T", " ")],
            ["Comentario", str(exp.get("presupuesto_comentario") or "—")],
        ]))

    if exp.get("url_factura"):
        dif = None
        try:
            dif = float(exp.get("monto_factura") or 0) - float(exp.get("monto") or 0)
        except Exception:
            dif = None
        el.append(Paragraph("Factura", sec))
        el.append(tbl([
            ["URL factura", str(exp.get("url_factura") or "—")],
            ["N° SOLPED", str(exp.get("numero_solped") or "—")],
            ["Fecha del gasto", str(exp.get("fecha_gasto") or "—")],
            ["Monto factura", _money(exp.get("monto_factura"))],
            ["Diferencia (factura - cotización)", _money(dif) if dif is not None else "—"],
        ]))

    if exp.get("coord_final_by"):
        el.append(Paragraph("Aprobación final coordinador", sec))
        el.append(tbl([
            ["Coordinador", str(exp.get("coord_final_by"))],
            ["Fecha", str(exp.get("coord_final_fecha") or "—")[:19].replace("T", " ")],
            ["Comentario", str(exp.get("coord_final_comentario") or "—")],
        ]))
    if exp.get("gerente_by"):
        el.append(Paragraph("Aprobación gerencia", sec))
        el.append(tbl([
            ["Gerente", str(exp.get("gerente_by"))],
            ["Fecha", str(exp.get("gerente_fecha") or "—")[:19].replace("T", " ")],
            ["Comentario", str(exp.get("gerente_comentario") or "—")],
        ]))
    if exp.get("estado") == E_RECHAZADO:
        el.append(Paragraph("Rechazo", sec))
        el.append(tbl([
            ["Etapa", str(exp.get("rechazado_etapa") or "—")],
            ["Rechazado por", str(exp.get("rechazado_por") or "—")],
            ["Motivo", str(exp.get("rechazo_motivo") or "—")],
        ]))

    el.append(Paragraph("Historial", sec))
    hrows = [["Fecha", "Acción", "Usuario"]]
    for hh in (exp.get("history") or []):
        hrows.append([str(hh.get("at") or "")[:19].replace("T", " "), str(hh.get("accion") or ""), str(hh.get("usuario") or "")])
    ht = Table(hrows, colWidths=[1.9 * inch, 3.2 * inch, 1.7 * inch])
    ht.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    el.append(ht)

    doc.build(el)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{exp.get("numero")}.pdf"'})




app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
