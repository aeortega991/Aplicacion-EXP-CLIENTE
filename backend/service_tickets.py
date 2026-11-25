"""Módulo Ticket servicio: solicitudes de asistencia técnica con asignación automática por región."""
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger("service_tickets")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "sgi-experiencia"
MAX_MB = int(os.environ.get("TICKET_MEDIA_MAX_MB") or 25)
ALLOWED_MEDIA = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp",
    "mp4": "video/mp4", "mov": "video/quicktime",
}
ESTADOS = ["Creado", "Asignado", "Info cargada", "Bloqueado", "Cerrado"]
TECNICO, ANALISTA, ADMIN = "tecnico", "analista_tecnico", "admin"
TS_ROLES = (TECNICO, ANALISTA, ADMIN)
LOCAL_TZ = timezone(timedelta(hours=-5))  # Ecuador
SYSTEM_USER = {"id": None, "name": "Sistema (asignación automática)"}

_storage_key = None


def _init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    for force in (False, True):
        r = requests.put(f"{STORAGE_URL}/objects/{path}", data=data, timeout=180,
                         headers={"X-Storage-Key": _init_storage(force), "Content-Type": content_type})
        if r.status_code == 404 and not force:
            continue
        r.raise_for_status()
        return r.json()


def _get_object(path: str):
    for force in (False, True):
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": _init_storage(force)}, timeout=120)
        if r.status_code == 404 and not force:
            continue
        r.raise_for_status()
        return r.content, r.headers.get("Content-Type", "application/octet-stream")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(s) -> str:
    return str(s or "").strip().upper()


def _day_bound_utc(day: str, add_days: int = 0) -> str:
    try:
        d = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=LOCAL_TZ) + timedelta(days=add_days)
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha inválida (use AAAA-MM-DD)")
    return d.astimezone(timezone.utc).isoformat()


class RegionIn(BaseModel):
    nombre: str
    ciudades: List[str] = []
    analista_id: Optional[str] = None


class EstadoIn(BaseModel):
    estado: str


class RespuestaIn(BaseModel):
    respuesta: str = ""
    links: List[str] = []


class AsignarIn(BaseModel):
    analista_id: str


class MensajeIn(BaseModel):
    texto: str


def create_ticket_router(db, get_current_user, require_admin, default_regions: dict):
    r = APIRouter(prefix="/api/ts")

    async def ts_user(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in TS_ROLES:
            raise HTTPException(status_code=403, detail="Sin acceso al módulo Ticket servicio")
        return user

    def _scope(user: dict) -> dict:
        if user["role"] == ADMIN:
            return {}
        if user["role"] == ANALISTA:
            return {"analista_id": user["id"]}
        return {"tecnico_id": user["id"]}

    async def _get_ticket(tid: str, user: dict) -> dict:
        t = await db.service_tickets.find_one({"id": tid, **_scope(user)}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Ticket no encontrado")
        return t

    async def _log_state(tid: str, de: Optional[str], a: str, user: dict):
        await db.ts_status_history.insert_one({
            "id": str(uuid.uuid4()), "ticket_id": tid, "de": de, "a": a,
            "user_id": user.get("id"), "user_name": user.get("name"), "created_at": _now(),
        })

    async def _active_analyst(uid: Optional[str]) -> Optional[dict]:
        if not uid:
            return None
        return await db.users.find_one({"id": uid, "role": ANALISTA}, {"_id": 0, "password_hash": 0})

    # ---------- Regiones (admin) ----------
    async def _clean_region(payload: RegionIn, rid: Optional[str] = None) -> dict:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre de la región es obligatorio")
        others = {"id": {"$ne": rid}}
        if await db.ts_regions.find_one({"nombre_norm": _norm(nombre), **others}):
            raise HTTPException(status_code=400, detail="Ya existe una región con ese nombre")
        ciudades = sorted({_norm(c) for c in payload.ciudades if _norm(c)})
        if ciudades:
            clash = await db.ts_regions.find_one({"ciudades": {"$in": ciudades}, **others}, {"_id": 0})
            if clash:
                dup = ", ".join(sorted(set(ciudades) & set(clash.get("ciudades", []))))
                raise HTTPException(status_code=400, detail=f"{dup} ya pertenece a la región {clash['nombre']}")
        aid = payload.analista_id or None
        if aid:
            if not await _active_analyst(aid):
                raise HTTPException(status_code=400, detail="El usuario seleccionado no es un analista técnico activo")
            other = await db.ts_regions.find_one({"analista_id": aid, **others}, {"_id": 0})
            if other:
                raise HTTPException(status_code=400, detail=f"El analista ya es responsable de la región {other['nombre']}")
        return {"nombre": nombre, "nombre_norm": _norm(nombre), "ciudades": ciudades, "analista_id": aid}

    @r.get("/regions")
    async def list_regions(user: dict = Depends(require_admin)):
        regions = await db.ts_regions.find({}, {"_id": 0}).sort("nombre", 1).to_list(500)
        analysts = await db.users.find({"role": ANALISTA}, {"_id": 0, "id": 1, "name": 1, "username": 1}).sort("name", 1).to_list(1000)
        amap = {a["id"]: a for a in analysts}
        for g in regions:
            g["analista"] = amap.get(g.get("analista_id"))
        mapped = {c for g in regions for c in g.get("ciudades", [])}
        tech_cities = {_norm(c) for c in await db.users.distinct("ciudad", {"role": TECNICO}) if _norm(c)}
        return {
            "regions": regions,
            "analysts": analysts,
            "unmapped_cities": sorted(tech_cities - mapped),
            "known_cities": sorted(mapped | tech_cities),
        }

    @r.post("/regions")
    async def create_region(payload: RegionIn, user: dict = Depends(require_admin)):
        doc = {"id": str(uuid.uuid4()), **(await _clean_region(payload)), "created_at": _now()}
        await db.ts_regions.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @r.put("/regions/{rid}")
    async def update_region(rid: str, payload: RegionIn, user: dict = Depends(require_admin)):
        if not await db.ts_regions.find_one({"id": rid}):
            raise HTTPException(status_code=404, detail="Región no encontrada")
        clean = await _clean_region(payload, rid)
        await db.ts_regions.update_one({"id": rid}, {"$set": {**clean, "updated_at": _now()}})
        return await db.ts_regions.find_one({"id": rid}, {"_id": 0})

    @r.delete("/regions/{rid}")
    async def delete_region(rid: str, user: dict = Depends(require_admin)):
        res = await db.ts_regions.delete_one({"id": rid})
        if not res.deleted_count:
            raise HTTPException(status_code=404, detail="Región no encontrada")
        return {"ok": True}

    # ---------- Tickets ----------
    @r.get("/tickets")
    async def list_tickets(tecnico_id: Optional[str] = None, analista_id: Optional[str] = None,
                           estado: Optional[str] = None, desde: Optional[str] = None,
                           hasta: Optional[str] = None, user: dict = Depends(ts_user)):
        scope = _scope(user)
        q: dict = {}
        if tecnico_id:
            q["tecnico_id"] = tecnico_id
        if analista_id:
            q["analista_id"] = analista_id
        if estado:
            q["estado"] = estado
        if desde or hasta:
            q["created_at"] = {}
            if desde:
                q["created_at"]["$gte"] = _day_bound_utc(desde)
            if hasta:
                q["created_at"]["$lt"] = _day_bound_utc(hasta, 1)
        q.update(scope)  # el alcance del rol prevalece sobre los filtros
        items = await db.service_tickets.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)
        counts = {e: 0 for e in ESTADOS}
        for t in items:
            counts[t["estado"]] = counts.get(t["estado"], 0) + 1
        opts = await db.service_tickets.find(scope, {"_id": 0, "tecnico_id": 1, "tecnico_nombre": 1, "analista_id": 1, "analista_nombre": 1}).to_list(5000)
        tecnicos = {o["tecnico_id"]: o.get("tecnico_nombre") for o in opts if o.get("tecnico_id")}
        analistas = {o["analista_id"]: o.get("analista_nombre") for o in opts if o.get("analista_id")}
        sin_asignar = await db.service_tickets.count_documents({"analista_id": None}) if user["role"] == ADMIN else 0
        return {
            "items": items, "counts": counts, "total": len(items), "sin_asignar": sin_asignar, "max_mb": MAX_MB,
            "options": {
                "tecnicos": sorted([{"id": k, "name": v} for k, v in tecnicos.items()], key=lambda x: x["name"] or ""),
                "analistas": sorted([{"id": k, "name": v} for k, v in analistas.items()], key=lambda x: x["name"] or ""),
            },
        }

    @r.post("/tickets")
    async def create_ticket(modelo: str = Form(""), serie: str = Form(""), descripcion: str = Form(""),
                            file: Optional[UploadFile] = File(None), user: dict = Depends(ts_user)):
        if user["role"] != TECNICO:
            raise HTTPException(status_code=403, detail="Solo los técnicos pueden crear tickets")
        modelo, serie, descripcion = modelo.strip(), serie.strip(), descripcion.strip()
        missing = [n for n, v in (("Modelo", modelo), ("Serie", serie), ("Descripción del daño", descripcion)) if not v]
        if not file or not file.filename:
            missing.append("Multimedia")
        if missing:
            raise HTTPException(status_code=400, detail=f"Campos obligatorios incompletos: {', '.join(missing)}")
        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in ALLOWED_MEDIA:
            raise HTTPException(status_code=400, detail="Formato no permitido. Use JPG, JPEG, PNG, WEBP, MP4 o MOV")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="El archivo multimedia está vacío")
        if len(data) > MAX_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"El archivo supera el límite de {MAX_MB} MB")

        tid = str(uuid.uuid4())
        try:
            stored = await asyncio.to_thread(_put_object, f"{APP_NAME}/tickets/{tid}/{uuid.uuid4()}.{ext}", data, ALLOWED_MEDIA[ext])
        except Exception:
            logger.exception("Fallo al subir multimedia de ticket")
            raise HTTPException(status_code=502, detail="No se pudo guardar el archivo multimedia. Intente nuevamente.")

        now = _now()
        ciudad = _norm(user.get("ciudad")) or None
        region = await db.ts_regions.find_one({"ciudades": ciudad}, {"_id": 0}) if ciudad else None
        doc = {
            "id": tid, "modelo": modelo, "serie": serie, "descripcion": descripcion,
            "tecnico_id": user["id"], "tecnico_nombre": user.get("name"), "tecnico_username": user.get("username"),
            "ciudad": ciudad, "region_id": region["id"] if region else None,
            "region_nombre": region["nombre"] if region else None,
            "analista_id": None, "analista_nombre": None, "estado": "Creado",
            "respuesta": "", "respuesta_links": [], "created_at": now, "updated_at": now, "closed_at": None,
        }
        for _ in range(5):
            last = await db.service_tickets.find_one({}, {"seq": 1}, sort=[("seq", -1)])
            seq = (last.get("seq", 0) + 1) if last else 1
            doc.update({"seq": seq, "numero": f"TS-{seq:04d}"})
            try:
                await db.service_tickets.insert_one(doc)
                break
            except DuplicateKeyError:
                doc.pop("_id", None)
        else:
            raise HTTPException(status_code=500, detail="No se pudo generar el número de ticket")
        doc.pop("_id", None)
        await db.ts_media.insert_one({
            "id": str(uuid.uuid4()), "ticket_id": tid, "storage_path": stored["path"],
            "original_filename": file.filename, "content_type": ALLOWED_MEDIA[ext],
            "size": stored.get("size", len(data)), "uploaded_by": user["id"], "is_deleted": False, "created_at": now,
        })
        await _log_state(tid, None, "Creado", user)

        warning = None
        try:
            analyst = await _active_analyst(region.get("analista_id")) if region else None
            if analyst:
                upd = {"analista_id": analyst["id"], "analista_nombre": analyst.get("name"), "estado": "Asignado", "updated_at": _now()}
                await db.service_tickets.update_one({"id": tid}, {"$set": upd})
                await _log_state(tid, "Creado", "Asignado", SYSTEM_USER)
                doc.update(upd)
            else:
                warning = "No hay un analista responsable para tu ciudad/región. El ticket quedó en estado Creado y será asignado por el administrador."
        except Exception:
            logger.exception("Fallo en asignación automática del ticket %s", tid)
            warning = "El ticket se registró pero no pudo asignarse automáticamente; el administrador lo asignará."
        return {"ticket": doc, "warning": warning}

    @r.get("/tickets/{tid}")
    async def ticket_detail(tid: str, user: dict = Depends(ts_user)):
        t = await _get_ticket(tid, user)
        media = await db.ts_media.find({"ticket_id": tid, "is_deleted": False}, {"_id": 0, "storage_path": 0}).to_list(50)
        history = await db.ts_status_history.find({"ticket_id": tid}, {"_id": 0}).sort("created_at", 1).to_list(500)
        role, uid = user["role"], user["id"]
        t.update({
            "media": media, "history": history,
            "perms": {
                "can_change_state": role in (ADMIN, ANALISTA),
                "can_respond": role == ANALISTA and t.get("analista_id") == uid,
                "can_chat": role != ADMIN and t["estado"] != "Cerrado" and uid in (t.get("tecnico_id"), t.get("analista_id")),
                "can_reassign": role == ADMIN,
            },
        })
        return t

    @r.get("/media/{mid}")
    async def ticket_media(mid: str, user: dict = Depends(ts_user)):
        m = await db.ts_media.find_one({"id": mid, "is_deleted": False}, {"_id": 0})
        if not m:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        await _get_ticket(m["ticket_id"], user)
        try:
            data, ct = await asyncio.to_thread(_get_object, m["storage_path"])
        except Exception:
            logger.exception("Fallo al leer multimedia %s", mid)
            raise HTTPException(status_code=502, detail="No se pudo obtener el archivo")
        return Response(content=data, media_type=m.get("content_type") or ct)

    @r.put("/tickets/{tid}/estado")
    async def change_state(tid: str, payload: EstadoIn, user: dict = Depends(ts_user)):
        if user["role"] not in (ANALISTA, ADMIN):
            raise HTTPException(status_code=403, detail="No tienes permiso para cambiar el estado")
        t = await _get_ticket(tid, user)
        if payload.estado not in ESTADOS:
            raise HTTPException(status_code=400, detail="Estado inválido")
        if payload.estado == t["estado"]:
            return t
        if payload.estado in ("Asignado", "Info cargada") and not t.get("analista_id"):
            raise HTTPException(status_code=400, detail="Asigne un analista antes de cambiar a este estado")
        now = _now()
        upd = {"estado": payload.estado, "updated_at": now, "closed_at": now if payload.estado == "Cerrado" else None}
        await db.service_tickets.update_one({"id": tid}, {"$set": upd})
        await _log_state(tid, t["estado"], payload.estado, user)
        t.update(upd)
        return t

    @r.put("/tickets/{tid}/respuesta")
    async def save_response(tid: str, payload: RespuestaIn, user: dict = Depends(ts_user)):
        if user["role"] != ANALISTA:
            raise HTTPException(status_code=403, detail="Solo el analista asignado puede registrar la respuesta técnica")
        t = await _get_ticket(tid, user)
        links = list(dict.fromkeys(l.strip() for l in payload.links if l and l.strip()))
        for link in links:
            p = urlparse(link)
            if p.scheme not in ("http", "https") or not p.netloc:
                raise HTTPException(status_code=400, detail=f"URL inválida (use http:// o https://): {link}")
        texto = payload.respuesta.strip()
        if not texto and not links:
            raise HTTPException(status_code=400, detail="Ingrese una respuesta o al menos un enlace")
        now = _now()
        prev = {l["url"]: l for l in t.get("respuesta_links", [])}
        new_links = [prev.get(u) or {"url": u, "added_at": now, "added_by": user["id"]} for u in links]
        upd = {"respuesta": texto, "respuesta_links": new_links, "respuesta_updated_at": now, "updated_at": now}
        await db.service_tickets.update_one({"id": tid}, {"$set": upd})
        t.update(upd)
        return t

    @r.put("/tickets/{tid}/asignar")
    async def reassign(tid: str, payload: AsignarIn, user: dict = Depends(require_admin)):
        t = await _get_ticket(tid, user)
        analyst = await _active_analyst(payload.analista_id)
        if not analyst:
            raise HTTPException(status_code=400, detail="El usuario seleccionado no es un analista técnico activo")
        upd = {"analista_id": analyst["id"], "analista_nombre": analyst.get("name"), "updated_at": _now()}
        if t["estado"] == "Creado":
            upd["estado"] = "Asignado"
        await db.service_tickets.update_one({"id": tid}, {"$set": upd})
        if upd.get("estado"):
            await _log_state(tid, "Creado", "Asignado", user)
        t.update(upd)
        return t

    @r.get("/tickets/{tid}/mensajes")
    async def list_messages(tid: str, user: dict = Depends(ts_user)):
        await _get_ticket(tid, user)
        return await db.ts_messages.find({"ticket_id": tid}, {"_id": 0}).sort("created_at", 1).to_list(2000)

    @r.post("/tickets/{tid}/mensajes")
    async def post_message(tid: str, payload: MensajeIn, user: dict = Depends(ts_user)):
        t = await _get_ticket(tid, user)
        if user["role"] == ADMIN or user["id"] not in (t.get("tecnico_id"), t.get("analista_id")):
            raise HTTPException(status_code=403, detail="Solo el técnico solicitante y el analista asignado pueden escribir")
        if t["estado"] == "Cerrado":
            raise HTTPException(status_code=400, detail="El ticket está cerrado; no se permiten nuevos mensajes")
        texto = payload.texto.strip()
        if not texto:
            raise HTTPException(status_code=400, detail="El mensaje está vacío")
        if len(texto) > 2000:
            raise HTTPException(status_code=400, detail="El mensaje supera 2000 caracteres")
        now = _now()
        msg = {"id": str(uuid.uuid4()), "ticket_id": tid, "user_id": user["id"], "user_name": user.get("name"),
               "role": user["role"], "texto": texto, "created_at": now}
        await db.ts_messages.insert_one(msg)
        await db.service_tickets.update_one({"id": tid}, {"$set": {"updated_at": now}})
        msg.pop("_id", None)
        return msg

    async def ts_startup():
        await db.service_tickets.create_index("id", unique=True)
        await db.service_tickets.create_index("numero", unique=True)
        for f in ("tecnico_id", "analista_id", "estado", "created_at"):
            await db.service_tickets.create_index(f)
        await db.ts_media.create_index("id", unique=True)
        await db.ts_media.create_index("ticket_id")
        await db.ts_messages.create_index([("ticket_id", 1), ("created_at", 1)])
        await db.ts_status_history.create_index("ticket_id")
        await db.ts_regions.create_index("id", unique=True)
        await db.ts_regions.create_index("ciudades")
        await db.ts_regions.create_index("analista_id")
        if await db.ts_regions.count_documents({}) == 0:
            for name, cities in default_regions.items():
                await db.ts_regions.insert_one({
                    "id": str(uuid.uuid4()), "nombre": name, "nombre_norm": _norm(name),
                    "ciudades": sorted({_norm(c) for c in cities}), "analista_id": None, "created_at": _now(),
                })
        try:
            await asyncio.to_thread(_init_storage)
        except Exception as e:
            logger.error(f"Storage init failed: {e}")

    return r, ts_startup
