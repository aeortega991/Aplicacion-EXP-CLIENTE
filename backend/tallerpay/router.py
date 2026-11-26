"""Módulo Pago a talleres — Fase A: talleres tercerizados, tarifarios y archivos contractuales.

Colecciones propias (prefijo tp_ para no chocar con Vehículos → Talleres):
  tp_workshops      talleres tercerizados (codigo_sap único)
  tp_tariffs        tarifas por taller + línea + peso de resolución (clave única)
  tp_tariff_files   metadatos de PDF/imágenes del tarifario contractual (binario en Object Storage)
"""
import asyncio
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from .catalogo_act import create_catalogo_act_router
from .common import (EMAIL_RE, LINEAS, build_template, clean, norm_linea, norm_sap, now_iso, num_text, read_rows,
                     to_date, to_number, upper)

logger = logging.getLogger("tallerpay")

ALLOWED_ROLES = frozenset({"lider", "coordinador", "admin"})
SECTIONS = {
    "dashboard": "tp_dashboard",
    "talleres": "tp_talleres",
    "tarifarios": "tp_tarifarios",
    "codificador": "tp_codificador",
    "promociones": "tp_promociones",
    "importacion": "tp_importacion",
    "liquidaciones": "tp_liquidaciones",
    "historial": "tp_historial",
}
APP_NAME = "sgi-experiencia"
MAX_FILE_MB = 10
ALLOWED_FILES = {"pdf": "application/pdf", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
WORKSHOP_HEADERS = ["codigo_sap", "nombre", "ruc", "ciudad", "direccion", "contacto", "telefono", "correo", "lineas"]
TARIFF_HEADERS = ["codigo_sap", "linea", "peso", "valor", "descripcion", "vigente_desde"]


class WorkshopIn(BaseModel):
    codigo_sap: str
    nombre: str
    ruc: Optional[str] = ""
    ciudad: Optional[str] = ""
    direccion: Optional[str] = ""
    contacto: Optional[str] = ""
    telefono: Optional[str] = ""
    correo: Optional[str] = ""
    lineas: list = ["blanca", "cafe"]


class EstadoIn(BaseModel):
    activo: bool
    motivo: Optional[str] = ""


class TariffIn(BaseModel):
    taller_id: str
    linea: str
    peso: float
    valor: float
    descripcion: Optional[str] = ""
    vigente_desde: Optional[str] = None


def create_tallerpay_router(get_current_user, effective_perms, db=None, put_object=None, get_object=None):
    """Router del módulo. Sin `db` solo expone los endpoints de estructura (útil en pruebas unitarias)."""
    router = APIRouter(prefix="/api/tallerpay", tags=["Pago a talleres"])

    async def require_access(resource: str, user: dict, edit: bool = False):
        if user.get("role") not in ALLOWED_ROLES:
            raise HTTPException(status_code=403, detail="No autorizado para Pago a talleres")
        if user.get("role") != "admin":
            perms = await effective_perms(user)
            if not perms.get("tallerpay", {}).get("view") or not perms.get(resource, {}).get("view"):
                raise HTTPException(status_code=403, detail="Sin permiso para esta sección")
            if edit and not perms.get(resource, {}).get("edit"):
                raise HTTPException(status_code=403, detail="No tienes permiso para crear o editar en esta sección")
        return user

    async def require_any(resources, user: dict):
        last = None
        for res in resources:
            try:
                return await require_access(res, user)
            except HTTPException as e:
                last = e
        raise last

    @router.get("/status")
    async def status(user: dict = Depends(get_current_user)):
        await require_access("tp_dashboard", user)
        return {"module": "Pago a talleres", "phase": "B", "business_operations_enabled": db is not None}

    @router.get("/sections/{section}")
    async def section_status(section: str, user: dict = Depends(get_current_user)):
        resource = SECTIONS.get(section)
        if resource is None:
            raise HTTPException(status_code=404, detail="Sección no encontrada")
        await require_access(resource, user)
        ready = section in ("talleres", "tarifarios", "codificador")
        return {"section": section, "ready": ready,
                "message": "Disponible" if ready else "Funcionalidad pendiente de implementación"}

    if db is None:
        router.startup = None
        return router

    async def startup():
        await db.tp_workshops.create_index("codigo_sap", unique=True, name="uniq_codigo_sap")
        await db.tp_workshops.create_index("id", unique=True)
        await db.tp_tariffs.create_index([("taller_id", 1), ("linea", 1), ("peso", 1)], unique=True, name="uniq_tarifa")
        await db.tp_tariffs.create_index("id", unique=True)
        await db.tp_tariff_files.create_index([("taller_id", 1), ("is_deleted", 1)])
        await _catalogo_startup()

    _catalogo_router, _catalogo_startup = create_catalogo_act_router(db, get_current_user, effective_perms)
    router.include_router(_catalogo_router)
    router.startup = startup

    # ------------------------------------------------------------------ helpers
    def audit(user: dict) -> dict:
        return {"id": user.get("id"), "username": user.get("username"), "name": user.get("name")}

    async def valid_city(ciudad: str) -> str:
        c = upper(ciudad)
        if c and not await db.cities.find_one({"nombre": c}):
            raise ValueError(f"La ciudad {c} no existe en el catálogo de Ciudades")
        return c

    async def workshop_fields(p: dict) -> dict:
        sap, nombre = norm_sap(p.get("codigo_sap")), clean(p.get("nombre"))
        if not sap:
            raise ValueError("El código SAP es obligatorio")
        if len(sap) > 30:
            raise ValueError("El código SAP admite máximo 30 caracteres")
        if not nombre:
            raise ValueError("El nombre del taller es obligatorio")
        correo = clean(p.get("correo")).lower()
        if correo and not EMAIL_RE.match(correo):
            raise ValueError(f"Correo inválido: {correo}")
        ruc = num_text(p.get("ruc"))
        if ruc.isdigit() and len(ruc) in (9, 12):  # Excel numérico pierde el 0 inicial
            ruc = "0" + ruc
        if ruc and (not ruc.isdigit() or len(ruc) not in (10, 13)):
            raise ValueError("El RUC/cédula debe tener 10 o 13 dígitos")
        raw = p.get("lineas")
        if isinstance(raw, str):
            raw = [x for x in raw.replace(";", ",").split(",")]
        lineas = sorted({norm_linea(x) for x in (raw or []) if norm_linea(x)})
        if lineas:
            known = await db.tp_lines.find({"codigo": {"$in": lineas}, "activo": True}).to_list(500)
            if len(known) != len(lineas):
                raise ValueError("Una o más líneas no están registradas en el catálogo")
        if not lineas:
            raise ValueError("Indique al menos una línea (blanca, cafe)")
        telefono = num_text(p.get("telefono"))
        if isinstance(p.get("telefono"), (int, float)) and telefono.isdigit() and len(telefono) in (8, 9):
            telefono = "0" + telefono
        return {"codigo_sap": sap, "nombre": nombre, "ruc": ruc, "ciudad": await valid_city(p.get("ciudad")),
                "direccion": clean(p.get("direccion")), "contacto": clean(p.get("contacto")),
                "telefono": telefono, "correo": correo, "lineas": lineas}

    async def get_workshop(wid: str) -> dict:
        w = await db.tp_workshops.find_one({"id": wid}, {"_id": 0})
        if not w:
            raise HTTPException(status_code=404, detail="Taller no encontrado")
        return w

    def ensure_active(w: dict):
        if not w.get("activo"):
            raise HTTPException(status_code=400, detail="El taller está inactivo; reactívelo para modificar su tarifario")

    def tariff_fields(p: dict, w: dict) -> dict:
        linea = norm_linea(p.get("linea"))
        if not linea:
            raise ValueError("Línea inválida (use blanca o cafe)")
        if linea not in w.get("lineas", []):
            raise ValueError(f"El taller {w['codigo_sap']} no atiende {LINEAS.get(linea, linea)}")
        peso = to_number(p.get("peso"), "peso", 0)
        valor = to_number(p.get("valor"), "valor", 0)
        if peso > 1000:
            raise ValueError("'peso' fuera de rango (máximo 1000)")
        return {"taller_id": w["id"], "codigo_sap": w["codigo_sap"], "linea": linea, "peso": peso, "valor": valor,
                "descripcion": clean(p.get("descripcion")), "vigente_desde": to_date(p.get("vigente_desde"))}

    async def tariff_counts() -> dict:
        rows_old = await db.tp_tariffs.aggregate([{"$group": {"_id": "$taller_id", "n": {"$sum": 1}}}]).to_list(10000)
        rows_new = await db.tp_tariff_matrix.aggregate([{"$group": {"_id": "$taller_id", "n": {"$sum": 1}}}]).to_list(10000)
        counts = {r["_id"]: r["n"] for r in rows_old}
        for r in rows_new:
            counts[r["_id"]] = counts.get(r["_id"], 0) + r["n"]
        return counts

    # ------------------------------------------------------------------ talleres
    @router.get("/talleres")
    async def list_workshops(q: str = "", estado: str = "todos", user: dict = Depends(get_current_user)):
        await require_any(("tp_talleres", "tp_tarifarios"), user)
        flt = {}
        if estado == "activos":
            flt["activo"] = True
        elif estado == "inactivos":
            flt["activo"] = False
        items = await db.tp_workshops.find(flt, {"_id": 0}).sort("codigo_sap", 1).to_list(5000)
        if q.strip():
            s = q.strip().lower()
            items = [w for w in items if any(s in str(w.get(k) or "").lower() for k in ("codigo_sap", "nombre", "ruc", "ciudad", "contacto"))]
        counts = await tariff_counts()
        for w in items:
            w["tarifas"] = counts.get(w["id"], 0)
        total = await db.tp_workshops.count_documents({})
        activos = await db.tp_workshops.count_documents({"activo": True})
        return {"items": items, "resumen": {"total": total, "activos": activos, "inactivos": total - activos}}

    @router.post("/talleres")
    async def create_workshop(payload: WorkshopIn, user: dict = Depends(get_current_user)):
        await require_access("tp_talleres", user, edit=True)
        try:
            fields = await workshop_fields(payload.model_dump())
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        now = now_iso()
        doc = {"id": str(uuid.uuid4()), **fields, "activo": True, "created_at": now, "updated_at": now,
               "created_by": audit(user), "updated_by": audit(user), "estado_historial": []}
        try:
            await db.tp_workshops.insert_one(doc)
        except DuplicateKeyError:
            raise HTTPException(status_code=400, detail=f"Ya existe un taller con el código SAP {fields['codigo_sap']}")
        doc.pop("_id", None)
        return doc

    @router.get("/talleres/template")
    async def workshops_template(user: dict = Depends(get_current_user)):
        await require_access("tp_talleres", user, edit=True)
        return build_template(WORKSHOP_HEADERS, ["100245", "Servitec Norte", "1790012345001", "QUITO", "Av. Amazonas N12-34",
                                                 "Juan Pérez", "0991234567", "taller@correo.com", "blanca,cafe"],
                              "plantilla_talleres_tercerizados.xlsx")

    @router.post("/talleres/import")
    async def import_workshops(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        """Crea talleres nuevos y actualiza los existentes usando el código SAP como clave."""
        await require_access("tp_talleres", user, edit=True)
        headers, rows = read_rows(await file.read())
        missing = [h for h in ("codigo_sap", "nombre") if h not in headers]
        if missing:
            raise HTTPException(status_code=400, detail=f"Faltan columnas obligatorias: {', '.join(missing)}")
        inserted = updated = duplicates = 0
        errors, seen = [], set()
        existing = {w["codigo_sap"]: w for w in await db.tp_workshops.find({}, {"_id": 0}).to_list(5000)}
        for idx, rec in rows:
            prev = existing.get(norm_sap(rec.get("codigo_sap")))
            if prev:  # actualización: las celdas vacías conservan el valor actual
                rec = {**{k: prev.get(k) for k in WORKSHOP_HEADERS},
                       **{k: v for k, v in rec.items() if clean(v) != ""}}
            elif not clean(rec.get("lineas")):
                rec["lineas"] = "blanca,cafe"
            try:
                fields = await workshop_fields(rec)
                removed = set(prev.get("lineas", [])) - set(fields["lineas"]) if prev else set()
                if removed and await db.tp_tariffs.count_documents({"taller_id": prev["id"], "linea": {"$in": list(removed)}}):
                    raise ValueError(f"no se puede quitar {', '.join(LINEAS.get(x, x) for x in sorted(removed))}: tiene tarifas registradas")
            except ValueError as e:
                errors.append(f"Fila {idx}: {e}")
                continue
            if fields["codigo_sap"] in seen:
                duplicates += 1
                errors.append(f"Fila {idx}: código SAP {fields['codigo_sap']} repetido en el archivo")
                continue
            seen.add(fields["codigo_sap"])
            now = now_iso()
            res = await db.tp_workshops.update_one(
                {"codigo_sap": fields["codigo_sap"]},
                {"$set": {**fields, "updated_at": now, "updated_by": audit(user)},
                 "$setOnInsert": {"id": str(uuid.uuid4()), "activo": True, "created_at": now,
                                  "created_by": audit(user), "estado_historial": []}},
                upsert=True,
            )
            if res.upserted_id is not None:
                inserted += 1
            else:
                updated += 1
        return {"inserted": inserted, "updated": updated, "duplicates": duplicates, "errors": errors, "total_filas": len(rows)}

    @router.get("/talleres/{wid}")
    async def workshop_detail(wid: str, user: dict = Depends(get_current_user)):
        await require_any(("tp_talleres", "tp_tarifarios"), user)
        w = await get_workshop(wid)
        w["tarifas"] = await db.tp_tariffs.count_documents({"taller_id": wid}) + await db.tp_tariff_matrix.count_documents({"taller_id": wid})
        return w

    @router.put("/talleres/{wid}")
    async def update_workshop(wid: str, payload: WorkshopIn, user: dict = Depends(get_current_user)):
        await require_access("tp_talleres", user, edit=True)
        w = await get_workshop(wid)
        try:
            fields = await workshop_fields(payload.model_dump())
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        removed = set(w.get("lineas", [])) - set(fields["lineas"])
        if removed and await db.tp_tariffs.count_documents({"taller_id": wid, "linea": {"$in": list(removed)}}):
            names = ", ".join(LINEAS[x] for x in sorted(removed))
            raise HTTPException(status_code=400, detail=f"No se puede quitar {names}: el taller tiene tarifas registradas en esa línea")
        try:
            await db.tp_workshops.update_one({"id": wid}, {"$set": {**fields, "updated_at": now_iso(), "updated_by": audit(user)}})
        except DuplicateKeyError:
            raise HTTPException(status_code=400, detail=f"Ya existe un taller con el código SAP {fields['codigo_sap']}")
        if fields["codigo_sap"] != w["codigo_sap"]:
            await db.tp_tariffs.update_many({"taller_id": wid}, {"$set": {"codigo_sap": fields["codigo_sap"]}})
        return await get_workshop(wid)

    @router.post("/talleres/{wid}/estado")
    async def set_workshop_state(wid: str, payload: EstadoIn, user: dict = Depends(get_current_user)):
        """Desactiva o reactiva el taller (no se elimina para conservar el historial de pagos)."""
        await require_access("tp_talleres", user, edit=True)
        w = await get_workshop(wid)
        if bool(w.get("activo")) == payload.activo:
            return w
        entry = {"activo": payload.activo, "motivo": clean(payload.motivo), "fecha": now_iso(), "por": audit(user)}
        await db.tp_workshops.update_one({"id": wid}, {"$set": {"activo": payload.activo, "updated_at": entry["fecha"],
                                                               "updated_by": audit(user)},
                                                      "$push": {"estado_historial": entry}})
        return await get_workshop(wid)

    # ------------------------------------------------------------------ tarifarios
    @router.get("/tarifarios")
    async def list_tariffs(taller_id: str = "", linea: str = "", user: dict = Depends(get_current_user)):
        await require_access("tp_tarifarios", user)
        flt = {}
        if taller_id:
            flt["taller_id"] = taller_id
        if linea:
            ln = norm_linea(linea)
            if not ln:
                raise HTTPException(status_code=400, detail="Línea inválida")
            flt["linea"] = ln
        items = await db.tp_tariffs.find(flt, {"_id": 0}).sort([("codigo_sap", 1), ("linea", 1), ("peso", 1)]).to_list(20000)
        return {"items": items, "lineas": [{"value": k, "label": v} for k, v in LINEAS.items()]}

    @router.post("/tarifarios")
    async def create_tariff(payload: TariffIn, user: dict = Depends(get_current_user)):
        await require_access("tp_tarifarios", user, edit=True)
        w = await get_workshop(payload.taller_id)
        ensure_active(w)
        try:
            fields = tariff_fields(payload.model_dump(), w)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        now = now_iso()
        doc = {"id": str(uuid.uuid4()), **fields, "created_at": now, "updated_at": now,
               "created_by": audit(user), "updated_by": audit(user)}
        try:
            await db.tp_tariffs.insert_one(doc)
        except DuplicateKeyError:
            raise HTTPException(status_code=400, detail=f"Ya existe una tarifa para {LINEAS.get(fields['linea'], fields['linea'])} con peso {fields['peso']:g}")
        doc.pop("_id", None)
        return doc

    @router.get("/tarifarios/template")
    async def tariffs_template(user: dict = Depends(get_current_user)):
        await require_access("tp_tarifarios", user, edit=True)
        return build_template(TARIFF_HEADERS, ["100245", "blanca", 1, 18.5, "Reparación simple", "2026-01-01"],
                              "plantilla_tarifarios.xlsx")

    @router.post("/tarifarios/import")
    async def import_tariffs(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        """Crea o actualiza tarifas por (código SAP, línea, peso)."""
        await require_access("tp_tarifarios", user, edit=True)
        headers, rows = read_rows(await file.read())
        missing = [h for h in ("codigo_sap", "linea", "peso", "valor") if h not in headers]
        if missing:
            raise HTTPException(status_code=400, detail=f"Faltan columnas obligatorias: {', '.join(missing)}")
        workshops = {w["codigo_sap"]: w for w in await db.tp_workshops.find({}, {"_id": 0}).to_list(5000)}
        inserted = updated = duplicates = 0
        errors, seen = [], set()
        for idx, rec in rows:
            sap = norm_sap(rec.get("codigo_sap"))
            w = workshops.get(sap)
            if not w:
                errors.append(f"Fila {idx}: el taller con código SAP '{sap}' no existe")
                continue
            if not w.get("activo"):
                errors.append(f"Fila {idx}: el taller {sap} está inactivo")
                continue
            try:
                fields = tariff_fields(rec, w)
            except ValueError as e:
                errors.append(f"Fila {idx}: {e}")
                continue
            key = (w["id"], fields["linea"], fields["peso"])
            if key in seen:
                duplicates += 1
                errors.append(f"Fila {idx}: tarifa repetida en el archivo ({sap} · {fields['linea']} · peso {fields['peso']:g})")
                continue
            seen.add(key)
            now = now_iso()
            res = await db.tp_tariffs.update_one(
                {"taller_id": w["id"], "linea": fields["linea"], "peso": fields["peso"]},
                {"$set": {**fields, "updated_at": now, "updated_by": audit(user)},
                 "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now, "created_by": audit(user)}},
                upsert=True,
            )
            if res.upserted_id is not None:
                inserted += 1
            else:
                updated += 1
        return {"inserted": inserted, "updated": updated, "duplicates": duplicates, "errors": errors, "total_filas": len(rows)}

    @router.put("/tarifarios/{tid}")
    async def update_tariff(tid: str, payload: TariffIn, user: dict = Depends(get_current_user)):
        await require_access("tp_tarifarios", user, edit=True)
        t = await db.tp_tariffs.find_one({"id": tid}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Tarifa no encontrada")
        if payload.taller_id != t["taller_id"]:
            raise HTTPException(status_code=400, detail="No se puede cambiar el taller de una tarifa")
        w = await get_workshop(t["taller_id"])
        ensure_active(w)
        try:
            fields = tariff_fields(payload.model_dump(), w)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        try:
            await db.tp_tariffs.update_one({"id": tid}, {"$set": {**fields, "updated_at": now_iso(), "updated_by": audit(user)}})
        except DuplicateKeyError:
            raise HTTPException(status_code=400, detail=f"Ya existe una tarifa para {LINEAS[fields['linea']]} con peso {fields['peso']:g}")
        return await db.tp_tariffs.find_one({"id": tid}, {"_id": 0})

    @router.delete("/tarifarios/{tid}")
    async def delete_tariff(tid: str, user: dict = Depends(get_current_user)):
        await require_access("tp_tarifarios", user, edit=True)
        t = await db.tp_tariffs.find_one({"id": tid}, {"_id": 0, "taller_id": 1})
        if not t:
            raise HTTPException(status_code=404, detail="Tarifa no encontrada")
        ensure_active(await get_workshop(t["taller_id"]))
        await db.tp_tariffs.delete_one({"id": tid})
        return {"ok": True}

    # ------------------------------------------------------------------ archivos del tarifario contractual
    @router.get("/talleres/{wid}/archivos")
    async def list_files(wid: str, user: dict = Depends(get_current_user)):
        await require_access("tp_tarifarios", user)
        await get_workshop(wid)
        items = await db.tp_tariff_files.find({"taller_id": wid, "is_deleted": False}, {"_id": 0, "storage_path": 0}) \
            .sort("created_at", -1).to_list(200)
        return {"items": items}

    @router.post("/talleres/{wid}/archivos")
    async def upload_file(wid: str, file: UploadFile = File(...), linea: str = Form("general"),
                          descripcion: str = Form(""), user: dict = Depends(get_current_user)):
        await require_access("tp_tarifarios", user, edit=True)
        w = await get_workshop(wid)
        ensure_active(w)
        ln = "general" if clean(linea).lower() in ("", "general") else norm_linea(linea)
        if not ln:
            raise HTTPException(status_code=400, detail="Línea inválida (general, blanca o cafe)")
        ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
        if ext not in ALLOWED_FILES:
            raise HTTPException(status_code=400, detail="Formato no permitido. Use PDF, JPG, PNG o WEBP")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
        if len(data) > MAX_FILE_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"El archivo supera el máximo de {MAX_FILE_MB} MB")
        fid = str(uuid.uuid4())
        try:
            stored = await asyncio.to_thread(put_object, f"{APP_NAME}/tallerpay/{wid}/{fid}.{ext}", data, ALLOWED_FILES[ext])
        except Exception:
            logger.exception("Fallo al subir archivo de tarifario")
            raise HTTPException(status_code=502, detail="No se pudo guardar el archivo. Intente nuevamente.")
        doc = {"id": fid, "taller_id": wid, "codigo_sap": w["codigo_sap"], "linea": ln, "descripcion": clean(descripcion),
               "original_filename": file.filename, "content_type": ALLOWED_FILES[ext], "size": stored.get("size", len(data)),
               "storage_path": stored["path"], "is_deleted": False, "created_at": now_iso(), "uploaded_by": audit(user)}
        await db.tp_tariff_files.insert_one(doc)
        doc.pop("_id", None)
        doc.pop("storage_path", None)
        return doc

    @router.get("/archivos/{fid}")
    async def download_file(fid: str, user: dict = Depends(get_current_user)):
        await require_access("tp_tarifarios", user)
        f = await db.tp_tariff_files.find_one({"id": fid, "is_deleted": False}, {"_id": 0})
        if not f:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        try:
            data, ct = await asyncio.to_thread(get_object, f["storage_path"])
        except Exception:
            logger.exception("Fallo al leer archivo de tarifario %s", fid)
            raise HTTPException(status_code=502, detail="No se pudo obtener el archivo")
        name = (f.get("original_filename") or f"tarifario.{f['content_type'].split('/')[-1]}").replace('"', "")
        return Response(content=data, media_type=f.get("content_type") or ct,
                        headers={"Content-Disposition": f'inline; filename="{name}"'})

    @router.delete("/archivos/{fid}")
    async def delete_file(fid: str, user: dict = Depends(get_current_user)):
        await require_access("tp_tarifarios", user, edit=True)
        f = await db.tp_tariff_files.find_one({"id": fid, "is_deleted": False}, {"_id": 0, "taller_id": 1})
        if not f:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        ensure_active(await get_workshop(f["taller_id"]))
        res = await db.tp_tariff_files.update_one({"id": fid, "is_deleted": False},
                                                  {"$set": {"is_deleted": True, "deleted_at": now_iso(), "deleted_by": audit(user)}})
        if not res.matched_count:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        return {"ok": True}

    return router
