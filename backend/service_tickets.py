"""Módulo Ticket servicio: solicitudes de asistencia técnica con asignación automática por región."""
import os
import uuid
import asyncio
import logging
from html import escape
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from catalog import city_region

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
CERRADO = "Cerrado"
TECNICO, ANALISTA, ADMIN, LIDER = "tecnico", "analista_tecnico", "admin", "lider"
TS_ROLES = (TECNICO, ANALISTA, ADMIN, LIDER)
CREATOR_ROLES = (TECNICO, LIDER)  # roles que pueden crear tickets
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


class EstadoIn(BaseModel):
    estado: str


class RespuestaIn(BaseModel):
    respuesta: str = ""
    links: List[str] = []


class AsignarIn(BaseModel):
    analista_id: str


class MensajeIn(BaseModel):
    texto: str


def create_ticket_router(db, get_current_user, require_admin, send_email=None, app_base_url: str = "", from_name: str = ""):
    r = APIRouter(prefix="/api/ts")
    bg_tasks = set()

    def _email_html(titulo: str, mensaje: str, t: dict) -> str:
        rows = "".join(
            f'<tr><td style="padding:4px 0;color:#6B7280;font-size:13px;width:140px">{escape(k)}</td>'
            f'<td style="padding:4px 0;font-size:13px;color:#111827">{escape(str(v or "—"))}</td></tr>'
            for k, v in (("Ticket", t.get("numero")), ("Técnico", t.get("tecnico_nombre")), ("Ciudad", t.get("ciudad")),
                         ("Analista", t.get("analista_nombre") or "Sin asignar"), ("Modelo", t.get("modelo")),
                         ("Serie", t.get("serie")), ("Estado", t.get("estado"))))
        link = f"{app_base_url}/tickets/t/{t['id']}" if app_base_url.startswith("https://") else ""
        boton = (f'<p style="margin:18px 0 0"><a href="{escape(link)}" style="display:inline-block;background:#0033A0;color:#fff;'
                 f'text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:600">Ver ticket</a></p>') if link else ""
        return (
            f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif">'
            f'<tr><td style="padding:24px"><div style="background:#0033A0;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">'
            f'<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.75">Ticket servicio · {escape(from_name)}</div>'
            f'<div style="font-size:18px;font-weight:700;margin-top:4px">{escape(titulo)}</div></div>'
            f'<div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;padding:20px">'
            f'<p style="color:#374151;font-size:14px;margin:0 0 14px">{escape(mensaje)}</p>'
            f'<table role="presentation" width="100%" style="border-collapse:collapse">{rows}</table>{boton}'
            f'<p style="margin:18px 0 0;color:#9CA3AF;font-size:12px">Mensaje automático de {escape(from_name)}.</p>'
            f'</div></td></tr></table>')

    async def _safe_send(to: str, subject: str, html: str):
        try:
            await send_email(to=to, subject=subject, html=html)
        except Exception as e:
            logger.error(f"Email de ticket a {to} falló: {e}")

    async def _notify(t: dict, event: str, actor: dict):
        """Aviso en el menú de notificaciones + correo al técnico, analista y administradores (excepto quien actúa)."""
        try:
            ids = {t.get("tecnico_id"), t.get("analista_id")}
            ids |= {a["id"] for a in await db.users.find({"role": ADMIN}, {"_id": 0, "id": 1}).to_list(200)}
            ids -= {None, actor.get("id")}
            if not ids:
                return
            users = await db.users.find({"id": {"$in": list(ids)}}, {"_id": 0, "id": 1, "email": 1}).to_list(200)
            now, num = _now(), t["numero"]
            docs = []
            for u in users:
                if event == "creado":
                    titulo = f"Nuevo ticket {num}"
                    mensaje = f"{t.get('tecnico_nombre')} registró el ticket {num} ({t.get('modelo')} · {t.get('serie')}). " + (
                        f"Asignado a {t['analista_nombre']}." if t.get("analista_id") else "Pendiente de asignación de analista.")
                else:
                    titulo = f"Ticket {num} asignado"
                    mensaje = f"El ticket {num} de {t.get('tecnico_nombre')} fue asignado a {t.get('analista_nombre')}."
                if u["id"] == t.get("analista_id"):
                    titulo = f"Se te asignó el ticket {num}"
                docs.append({"id": str(uuid.uuid4()), "user_id": u["id"], "ticket_id": t["id"], "numero": num, "tipo": event,
                             "titulo": titulo, "mensaje": mensaje, "read": False, "created_at": now})
                if send_email and u.get("email"):
                    task = asyncio.create_task(_safe_send(u["email"], titulo, _email_html(titulo, mensaje, t)))
                    bg_tasks.add(task)
                    task.add_done_callback(bg_tasks.discard)
            if docs:
                await db.ts_notifications.insert_many(docs)
        except Exception:
            logger.exception("Fallo al generar notificaciones del ticket %s", t.get("id"))

    @r.get("/notifications")
    async def my_notifications(user: dict = Depends(get_current_user)):
        items = await db.ts_notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(30)
        unread = await db.ts_notifications.count_documents({"user_id": user["id"], "read": False})
        return {"items": items, "unread": unread}

    @r.post("/notifications/read-all")
    async def read_all(user: dict = Depends(get_current_user)):
        await db.ts_notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
        return {"ok": True}

    @r.post("/notifications/{nid}/read")
    async def read_one(nid: str, user: dict = Depends(get_current_user)):
        await db.ts_notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
        return {"ok": True}

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

    def _ensure_open(t: dict):
        if t.get("estado") == CERRADO:
            raise HTTPException(status_code=400, detail="El ticket está cerrado y no puede ser editado")

    async def _active_analyst(uid: Optional[str]) -> Optional[dict]:
        if not uid:
            return None
        return await db.users.find_one({"id": uid, "role": ANALISTA}, {"_id": 0, "password_hash": 0})

    @r.get("/analysts")
    async def list_analysts(user: dict = Depends(require_admin)):
        return await db.users.find({"role": ANALISTA}, {"_id": 0, "id": 1, "name": 1, "region": 1}).sort("name", 1).to_list(1000)

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
                            mediciones: str = Form(""), file: Optional[UploadFile] = File(None), user: dict = Depends(ts_user)):
        if user["role"] not in CREATOR_ROLES:
            raise HTTPException(status_code=403, detail="Solo los técnicos y líderes pueden crear tickets")
        modelo, serie, descripcion = modelo.strip(), serie.strip(), descripcion.strip()
        mediciones = mediciones.strip()
        if len(mediciones) > 4000:
            raise HTTPException(status_code=400, detail="Mediciones y valores: máximo 4000 caracteres")
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
        region = await city_region(db, ciudad)
        doc = {
            "id": tid, "modelo": modelo, "serie": serie, "descripcion": descripcion, "mediciones": mediciones,
            "tecnico_id": user["id"], "tecnico_nombre": user.get("name"), "tecnico_username": user.get("username"),
            "solicitante_rol": user["role"],
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
            if user["role"] == LIDER:
                # Tickets de líderes: se asignan al administrador (el primero registrado si hay varios)
                admins = await db.users.find({"role": ADMIN}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(1)
                analyst = admins[0] if admins else None
            else:
                analyst = await db.users.find_one({"role": ANALISTA, "region": region["nombre"]}, {"_id": 0, "password_hash": 0}) if region else None
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
        await _notify(doc, "creado", user)
        return {"ticket": doc, "warning": warning}

    @r.get("/tickets/{tid}")
    async def ticket_detail(tid: str, user: dict = Depends(ts_user)):
        t = await _get_ticket(tid, user)
        media = await db.ts_media.find({"ticket_id": tid, "is_deleted": False}, {"_id": 0, "storage_path": 0}).to_list(50)
        history = await db.ts_status_history.find({"ticket_id": tid}, {"_id": 0}).sort("created_at", 1).to_list(500)
        role, uid = user["role"], user["id"]
        abierto = t["estado"] != CERRADO
        t.update({
            "media": media, "history": history,
            "perms": {
                "locked": not abierto,
                "can_change_state": abierto and role in (ADMIN, ANALISTA),
                "can_respond": abierto and role in (ANALISTA, ADMIN) and t.get("analista_id") == uid,
                "can_chat": abierto and uid in (t.get("tecnico_id"), t.get("analista_id")),
                "can_reassign": abierto and role == ADMIN,
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
        _ensure_open(t)
        if payload.estado not in ESTADOS:
            raise HTTPException(status_code=400, detail="Estado inválido")
        if payload.estado == t["estado"]:
            return t
        if payload.estado in ("Asignado", "Info cargada") and not t.get("analista_id"):
            raise HTTPException(status_code=400, detail="Asigne un analista antes de cambiar a este estado")
        now = _now()
        upd = {"estado": payload.estado, "updated_at": now, "closed_at": now if payload.estado == CERRADO else None}
        res = await db.service_tickets.update_one({"id": tid, "estado": {"$ne": CERRADO}}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(status_code=400, detail="El ticket está cerrado y no puede ser editado")
        await _log_state(tid, t["estado"], payload.estado, user)
        t.update(upd)
        return t

    @r.put("/tickets/{tid}/respuesta")
    async def save_response(tid: str, payload: RespuestaIn, user: dict = Depends(ts_user)):
        if user["role"] not in (ANALISTA, ADMIN):
            raise HTTPException(status_code=403, detail="Solo el analista asignado puede registrar la respuesta técnica")
        t = await _get_ticket(tid, user)
        if t.get("analista_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Solo el responsable asignado puede registrar la respuesta técnica")
        _ensure_open(t)
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
        res = await db.service_tickets.update_one({"id": tid, "estado": {"$ne": CERRADO}}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(status_code=400, detail="El ticket está cerrado y no puede ser editado")
        t.update(upd)
        return t

    @r.put("/tickets/{tid}/asignar")
    async def reassign(tid: str, payload: AsignarIn, user: dict = Depends(require_admin)):
        t = await _get_ticket(tid, user)
        _ensure_open(t)
        analyst = await _active_analyst(payload.analista_id)
        if not analyst:
            raise HTTPException(status_code=400, detail="El usuario seleccionado no es un analista técnico activo")
        upd = {"analista_id": analyst["id"], "analista_nombre": analyst.get("name"), "updated_at": _now()}
        if t["estado"] == "Creado":
            upd["estado"] = "Asignado"
        res = await db.service_tickets.update_one({"id": tid, "estado": {"$ne": CERRADO}}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(status_code=400, detail="El ticket está cerrado y no puede ser editado")
        if upd.get("estado"):
            await _log_state(tid, "Creado", "Asignado", user)
        t.update(upd)
        await _notify(t, "asignado", user)
        return t

    @r.get("/tickets/{tid}/mensajes")
    async def list_messages(tid: str, user: dict = Depends(ts_user)):
        await _get_ticket(tid, user)
        return await db.ts_messages.find({"ticket_id": tid}, {"_id": 0}).sort("created_at", 1).to_list(2000)

    @r.post("/tickets/{tid}/mensajes")
    async def post_message(tid: str, payload: MensajeIn, user: dict = Depends(ts_user)):
        t = await _get_ticket(tid, user)
        if user["id"] not in (t.get("tecnico_id"), t.get("analista_id")):
            raise HTTPException(status_code=403, detail="Solo el solicitante y el responsable asignado pueden escribir")
        if t["estado"] == CERRADO:
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
        await db.ts_notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.ts_notifications.create_index([("user_id", 1), ("read", 1)])
        try:
            await asyncio.to_thread(_init_storage)
        except Exception as e:
            logger.error(f"Storage init failed: {e}")

    return r, ts_startup
