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
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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

class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    email: Optional[str] = None
    role: str = "user"  # 'admin' or 'user'

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None

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
    if payload.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Rol inválido")
    doc = {
        "id": str(uuid.uuid4()),
        "username": username,
        "name": payload.name.strip(),
        "email": payload.email,
        "role": payload.role,
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
        if payload.role not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="Rol inválido")
        update["role"] = payload.role
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
}

def _validate_module(m: str) -> str:
    if m not in MODULES:
        raise HTTPException(status_code=404, detail="Módulo no existe")
    return MODULES[m]

@api.get("/modules/{module}")
async def list_records(module: str, user: dict = Depends(get_current_user)):
    col = _validate_module(module)
    docs = await db[col].find({}, {"_id": 0}).to_list(5000)
    return docs

@api.post("/modules/{module}")
async def create_record(module: str, payload: RecordIn, user: dict = Depends(get_current_user)):
    col = _validate_module(module)
    doc = {"id": str(uuid.uuid4()), **payload.data, "_created_by": user["username"], "_created_at": datetime.now(timezone.utc).isoformat()}
    await db[col].insert_one(doc)
    doc.pop("_id", None)
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

@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    flota = await db.flota.find({}, {"_id": 0}).to_list(5000)
    seguros = await db.seguros.find({}, {"_id": 0}).to_list(5000)
    impuestos = await db.impuestos.find({}, {"_id": 0}).to_list(5000)
    multas = await db.multas.find({}, {"_id": 0}).to_list(5000)
    mantenimiento = await db.mantenimiento.find({}, {"_id": 0}).to_list(5000)

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

    total_gasto = sum(gasto_por_vehiculo.values())
    promedio_km = (total_km / len(consumo_por_vehiculo)) if consumo_por_vehiculo else 0

    return {
        "kpis": {
            "total_vehiculos": len(flota),
            "total_conductores": len((await db.conductores.find({}, {"_id": 0}).to_list(5000))),
            "gasto_total": round(total_gasto, 2),
            "km_total": round(total_km, 2),
            "km_promedio": round(promedio_km, 2),
            "gasto_mantenimiento": round(total_gasto_mantenimiento, 2),
        },
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

# ---- Seed ----
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

@app.on_event("shutdown")
async def _shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
