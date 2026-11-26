"""Promociones comerciales TallerPay.

Se registran condiciones comerciales configurables; NO alteran importes del
tarifario. La clasificación de tickets respeta primero CS_NoPago.
"""
import re
import uuid
from datetime import date
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from .common import build_template, clean, now_iso, to_date
from .payment_rules import payment_eligibility
from .catalogo_act import money_number

MAX_IMPORT_BYTES = 8 * 1024 * 1024
PROMO_HEADERS = ["nombre", "cadena", "modelo", "categoria_resolucion", "linea", "producto",
                 "vigente_desde", "vigente_hasta", "precio_promocional", "observaciones"]
ANY = "*"


def norm(v):
    """Normaliza espacios y mayúsculas, preservando guiones de modelos."""
    return " ".join(clean(v).upper().split())


def match_value(rule, value):
    rule = norm(rule)
    return rule in ("", ANY) or (bool(norm(value)) and rule == norm(value))


def normalize_promo(data):
    nombre = clean(data.get("nombre"))
    if not nombre:
        raise ValueError("Nombre de promoción obligatorio")
    cadena = norm(data.get("cadena"))
    if not cadena:
        raise ValueError("Cadena comercial obligatoria; use * para todas")
    scope = {}
    for field in ("cadena", "modelo", "categoria_resolucion", "linea", "producto"):
        scope[field] = cadena if field == "cadena" else norm(data.get(field)) or ANY
    try:
        start = to_date(data.get("vigente_desde"))
        end = to_date(data.get("vigente_hasta"))
    except ValueError as e:
        raise ValueError(str(e)) from e
    if not start or not end:
        raise ValueError("La vigencia inicial y final son obligatorias")
    if end < start:
        raise ValueError("La vigencia final no puede ser anterior a la inicial")
    # Permitir cadena general solo si hay alguna otra restricción que identifique una promoción.
    if all(scope[k] == ANY for k in scope):
        raise ValueError("La promoción debe acotar al menos cadena, modelo, resolución, línea o producto")
    try:
        price = money_number(data.get("precio_promocional"))
    except ValueError as exc:
        raise ValueError(f"Precio promocional: {exc}") from exc
    return {
        "nombre": nombre, **scope, "precio_promocional": price,
        "vigente_desde": start, "vigente_hasta": end,
        "observaciones": clean(data.get("observaciones")),
        "responsable_pago": "COMERCIAL",
    }


def promotion_match(promo, ticket):
    if not promo.get("activo", True):
        return False
    solved = ticket.get("fecha_solucion")
    if not solved:
        return False
    try:
        d = to_date(solved)
    except ValueError:
        return False
    if not (promo["vigente_desde"] <= d <= promo["vigente_hasta"]):
        return False
    return all(match_value(promo.get(key), ticket.get(key)) for key in
               ("cadena", "modelo", "categoria_resolucion", "linea", "producto"))


def classify(ticket, promotions):
    """Clasifica la responsabilidad del pago, NO calcula valores monetarios.

    NoPago tiene precedencia sobre cualquier promoción, incluso las vigentes.
    """
    eligibility = payment_eligibility(ticket)
    # La exclusión del asunto SAP prevalece sobre cualquier promoción.
    if eligibility["no_pagable"]:
        return {"clasificacion": "CS_NoPago", "promocion_id": None,
                "motivo": ", ".join(eligibility["motivos"]),
                "tickets_referenciados": eligibility["tickets_referenciados"]}
    # Compatibilidad con evaluación manual explícita de tickets referenciados.
    if ticket.get("referencia_otro_ticket") is True:
        return {"clasificacion": "CS_NoPago", "promocion_id": None,
                "motivo": "REFERENCIA_OTRO_TICKET"}
    matches = [p for p in promotions if promotion_match(p, ticket)]
    if not matches:
        return {"clasificacion": "CS_Exp", "promocion_id": None,
                "motivo": "Ninguna promoción comercial vigente coincide"}
    # La coincidencia más específica prevalece (modelo, resolución, producto, cadena, línea).
    def specificity(p):
        return sum(1 for k in ("cadena", "modelo", "categoria_resolucion", "linea", "producto")
                   if norm(p.get(k)) not in ("", ANY))
    max_score = max(map(specificity, matches))
    winners = [p for p in matches if specificity(p) == max_score]
    if len(winners) > 1:
        return {"clasificacion": "PENDIENTE", "promocion_id": None,
                "motivo": "Existen promociones coincidentes con igual especificidad"}
    p = winners[0]
    return {"clasificacion": "CS_Com", "promocion_id": p["id"],
            "precio_promocional": p.get("precio_promocional"),
            "motivo": f"Promoción vigente: {p['nombre']}"}


class PromoIn(BaseModel):
    nombre: str
    cadena: str
    modelo: str = ANY
    categoria_resolucion: str = ANY
    linea: str = ANY
    producto: str = ANY
    vigente_desde: str
    vigente_hasta: str
    observaciones: str = ""
    precio_promocional: str


class PromoState(BaseModel):
    activo: bool


class TicketIn(BaseModel):
    fecha_solucion: Optional[str] = None
    causa_no_solucion: Optional[str] = "Sin asignar"
    asunto: str = ""
    referencia_otro_ticket: bool = False
    estado: str = ""
    cadena: str = ""
    modelo: str = ""
    categoria_resolucion: str = ""
    linea: str = ""
    producto: str = ""


def create_promotions_router(db, get_current_user, effective_perms):
    router = APIRouter(tags=["Pago a talleres: promociones"])

    async def guard(user, edit=False):
        if user.get("role") not in {"admin", "coordinador", "lider"}:
            raise HTTPException(403, "No autorizado")
        if user.get("role") != "admin":
            perms = await effective_perms(user)
            if not perms.get("tallerpay", {}).get("view") or not perms.get("tp_promociones", {}).get("view"):
                raise HTTPException(403, "Sin permiso de lectura")
            if edit and not perms.get("tp_promociones", {}).get("edit"):
                raise HTTPException(403, "Sin permiso de edición")

    def actor(user):
        return {"id": user.get("id"), "name": user.get("name"), "username": user.get("username")}

    async def startup():
        await db.tp_promotions.create_index("id", unique=True)
        await db.tp_promotions.create_index([("activo", 1), ("vigente_desde", 1), ("vigente_hasta", 1)])
        await db.tp_promotion_imports.create_index("id", unique=True)

    @router.get("/promociones")
    async def list_promos(q: str = "", estado: str = "todos", user: dict = Depends(get_current_user)):
        await guard(user)
        query = {}
        if estado == "activos":
            query["activo"] = True
        elif estado == "inactivos":
            query["activo"] = False
        docs = await db.tp_promotions.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
        if q.strip():
            val = norm(q)
            docs = [x for x in docs if val in norm(" ".join(str(x.get(k, "")) for k in
                ("nombre", "cadena", "modelo", "categoria_resolucion", "linea", "producto")))]
        return {"items": docs, "total": len(docs)}

    @router.post("/promociones")
    async def create_promo(payload: PromoIn, user: dict = Depends(get_current_user)):
        await guard(user, edit=True)
        try:
            data = normalize_promo(payload.model_dump())
        except ValueError as e:
            raise HTTPException(400, str(e))
        doc = {"id": str(uuid.uuid4()), **data, "activo": True, "created_at": now_iso(),
               "updated_at": now_iso(), "created_by": actor(user), "updated_by": actor(user)}
        await db.tp_promotions.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/promociones/{pid}")
    async def update_promo(pid: str, payload: PromoIn, user: dict = Depends(get_current_user)):
        await guard(user, edit=True)
        old = await db.tp_promotions.find_one({"id": pid}, {"_id": 0})
        if not old:
            raise HTTPException(404, "Promoción no encontrada")
        try:
            data = normalize_promo(payload.model_dump())
        except ValueError as e:
            raise HTTPException(400, str(e))
        await db.tp_promotions.update_one({"id": pid}, {"$set": {
            **data, "updated_at": now_iso(), "updated_by": actor(user)},
            "$push": {"historial": {"fecha": now_iso(), "user": actor(user),
                                    "anterior": {k: old.get(k) for k in data}}}})
        return await db.tp_promotions.find_one({"id": pid}, {"_id": 0})

    @router.post("/promociones/{pid}/estado")
    async def set_state(pid: str, payload: PromoState, user: dict = Depends(get_current_user)):
        await guard(user, edit=True)
        old = await db.tp_promotions.find_one({"id": pid}, {"_id": 0})
        if not old:
            raise HTTPException(404, "Promoción no encontrada")
        await db.tp_promotions.update_one({"id": pid}, {"$set": {"activo": payload.activo,
             "updated_at": now_iso(), "updated_by": actor(user)},
             "$push": {"historial": {"fecha": now_iso(), "user": actor(user),
                                     "anterior_estado": old.get("activo")}}})
        return await db.tp_promotions.find_one({"id": pid}, {"_id": 0})

    @router.get("/promociones/template")
    async def template(user: dict = Depends(get_current_user)):
        await guard(user)
        return build_template(PROMO_HEADERS,
            ["Instalación asumida por Comercial", "KYWI", "*", "INSTALACION NIVEL 1",
             "*", "AIRE ACONDICIONADO", "2026-01-01", "2026-12-31", "10.00",
             "Ejemplo de estructura; ajustar según condiciones comerciales reales"],
            "plantilla_promociones_comerciales.xlsx")

    @router.post("/promociones/import")
    async def import_promos(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        await guard(user, edit=True)
        if not (file.filename or "").lower().endswith(".xlsx"):
            raise HTTPException(400, "Solo Excel .xlsx")
        content = await file.read(MAX_IMPORT_BYTES + 1)
        if len(content) > MAX_IMPORT_BYTES:
            raise HTTPException(413, "El archivo supera 8 MB")
        from .common import read_rows
        headers, rows = read_rows(content)
        needed = {"nombre", "cadena", "vigente_desde", "vigente_hasta", "precio_promocional"}
        if not needed.issubset(set(headers)):
            raise HTTPException(400, "Faltan columnas: " + ", ".join(sorted(needed - set(headers))))
        docs, errors, seen = [], [], set()
        for line, entry in rows:
            try:
                data = normalize_promo(entry)
            except ValueError as e:
                errors.append(f"Fila {line}: {e}")
                continue
            identity = tuple(data[k] for k in ("nombre", "cadena", "modelo", "categoria_resolucion",
                                              "linea", "producto", "vigente_desde", "vigente_hasta", "precio_promocional"))
            if identity in seen:
                errors.append(f"Fila {line}: condición promocional duplicada dentro del Excel")
                continue
            seen.add(identity)
            docs.append(data)
        # No usar importaciones parciales; tampoco alterar registros existentes.
        if errors:
            return {"confirmed": False, "inserted": 0, "errors": errors[:200], "valid": len(docs)}
        existing = await db.tp_promotions.find({}, {"_id": 0}).to_list(5000)
        identities = {tuple(p.get(k) for k in ("nombre", "cadena", "modelo", "categoria_resolucion",
                                              "linea", "producto", "vigente_desde", "vigente_hasta"))
                      for p in existing}
        if any(tuple(p[k] for k in ("nombre", "cadena", "modelo", "categoria_resolucion",
                                    "linea", "producto", "vigente_desde", "vigente_hasta")) in identities for p in docs):
            return {"confirmed": False, "inserted": 0,
                    "errors": ["Existen promociones idénticas en la base; revise la importación"], "valid": len(docs)}
        batch = str(uuid.uuid4())
        now = now_iso()
        if docs:
            await db.tp_promotions.insert_many([{
                "id": str(uuid.uuid4()), **p, "activo": True, "import_id": batch,
                "created_at": now, "updated_at": now,
                "created_by": actor(user), "updated_by": actor(user)} for p in docs])
        await db.tp_promotion_imports.insert_one({"id": batch, "filename": file.filename,
            "created_at": now_iso(), "created_by": actor(user), "inserted": len(docs)})
        return {"confirmed": True, "inserted": len(docs), "errors": [], "valid": len(docs)}

    @router.post("/promociones/evaluar")
    async def evaluate(payload: TicketIn, user: dict = Depends(get_current_user)):
        await guard(user)
        promos = await db.tp_promotions.find({"activo": True}, {"_id": 0}).to_list(5000)
        return classify(payload.model_dump(), promos)

    return router, startup
