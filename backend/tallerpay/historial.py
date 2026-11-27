"""Historial consultivo de liquidaciones, sin confundir cierre con pago efectivo."""
import re
from decimal import Decimal
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from .common import now_iso
from fastapi.responses import StreamingResponse

from .liquidaciones import build_settlement_workbook

GROUPS = ("CS_Exp", "CS_Com", "CS_NoPago", "PENDIENTE")

class ApprovalIn(BaseModel):
    estado_aprobacion: str

def approval_state(doc):
    return doc.get("estado_aprobacion") or "EN_ESPERA"


def totals_for(doc):
    totals = doc.get("totales") or {}
    return {
        "importe": str(sum((Decimal(str((totals.get(k) or {}).get("total") or 0))
                            for k in GROUPS), Decimal("0"))),
        "tickets": sum(int((totals.get(k) or {}).get("tickets") or 0) for k in GROUPS),
    }


def build_filter(periodo="", estado="", tecnico="", aprobacion=""):
    query = {}
    if periodo:
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", periodo):
            raise HTTPException(400, "Período inválido")
        query["periodo"] = periodo
    if estado:
        if estado not in ("BORRADOR", "CERRADO"):
            raise HTTPException(400, "Estado inválido")
        query["estado"] = estado
    if aprobacion:
        if aprobacion not in ("EN_ESPERA", "APROBADO"):
            raise HTTPException(400, "Estado de aprobación inválido")
        query["$or"] = ([{"estado_aprobacion": "EN_ESPERA"},
                         {"estado_aprobacion": {"$exists": False}},
                         {"estado_aprobacion": None}]
                        if aprobacion == "EN_ESPERA" else [{"estado_aprobacion": "APROBADO"}])
    if tecnico:
        if len(tecnico) > 100:
            raise HTTPException(400, "Búsqueda demasiado larga")
        value = re.escape(tecnico.strip())
        name_query = {"$or": [
            {"tecnico_codigo": {"$regex": value, "$options": "i"}},
            {"tecnico_nombre": {"$regex": value, "$options": "i"}},
        ]}
        if "$or" in query:
            query["$and"] = [{"$or": query.pop("$or")}, name_query]
        else:
            query.update(name_query)
    return query


def create_historial_router(db, get_current_user, effective_perms):
    router = APIRouter(tags=["TallerPay: Historial"])

    async def guard(user):
        if user.get("role") not in {"admin", "coordinador", "lider"}:
            raise HTTPException(403, "Rol no autorizado")
        if user.get("role") == "admin":
            return
        perms = await effective_perms(user)
        if not perms.get("tallerpay", {}).get("view") or not perms.get("tp_historial", {}).get("view"):
            raise HTTPException(403, "Sin acceso al historial")

    async def guard_approval(user):
        await guard(user)
        if user.get("role") not in {"admin", "coordinador"}:
            raise HTTPException(403, "Solo admin y coordinador pueden aprobar liquidaciones")
        if user.get("role") != "admin":
            perms = await effective_perms(user)
            if not perms.get("tp_historial", {}).get("edit"):
                raise HTTPException(403, "Sin permiso para actualizar aprobación")

    @router.get("/historial/liquidaciones")
    async def list_history(periodo: str = "", estado: str = "", tecnico: str = "", aprobacion: str = "",
                           pagina: int = 1, limite: int = 25,
                           user: dict = Depends(get_current_user)):
        await guard(user)
        if pagina < 1 or not 1 <= limite <= 100:
            raise HTTPException(400, "Paginación inválida")
        query = build_filter(periodo, estado, tecnico, aprobacion)
        projection = {"_id": 0, "tickets": 0, "historial": 0}
        cursor = db.tp_settlements.find(query, projection).sort("created_at", -1)
        count = await db.tp_settlements.count_documents(query)
        items = await cursor.skip((pagina - 1) * limite).limit(limite).to_list(limite)
        return {"items": [{**doc, **totals_for(doc), "estado_aprobacion": approval_state(doc)} for doc in items],
                "total": count, "pagina": pagina, "limite": limite,
                "nota": "CERRADO indica liquidación finalizada; no confirma pago efectivo."}

    @router.get("/historial/liquidaciones/{sid}")
    async def detail(sid: str, user: dict = Depends(get_current_user)):
        await guard(user)
        doc = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Liquidación no encontrada")
        return {**doc, **totals_for(doc), "estado_aprobacion": approval_state(doc)}

    @router.put("/historial/liquidaciones/{sid}/aprobacion")
    async def update_approval(sid: str, payload: ApprovalIn,
                              user: dict = Depends(get_current_user)):
        await guard_approval(user)
        status = payload.estado_aprobacion
        if status not in {"EN_ESPERA", "APROBADO"}:
            raise HTTPException(400, "Estado de aprobación inválido")
        doc = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Liquidación no encontrada")
        if status == "APROBADO" and doc.get("estado") != "CERRADO":
            raise HTTPException(409, "Solo se pueden aprobar liquidaciones cerradas")
        old = approval_state(doc)
        if old == status:
            return {**doc, **totals_for(doc), "estado_aprobacion": old}
        now = now_iso()
        actor = {"id": user.get("id"), "username": user.get("username"),
                 "name": user.get("name"), "role": user.get("role")}
        updated = await db.tp_settlements.update_one(
            {"id": sid, "version": doc["version"]},
            {"$set": {"estado_aprobacion": status, "updated_at": now},
             "$inc": {"version": 1},
             "$push": {"historial": {"accion": "CAMBIO_APROBACION", "fecha": now,
                                     "usuario": actor, "anterior": old, "nuevo": status}}})
        if not updated.modified_count:
            raise HTTPException(409, "La liquidación cambió; actualice e intente nuevamente")
        fresh = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        return {**fresh, **totals_for(fresh), "estado_aprobacion": approval_state(fresh)}

    @router.get("/historial/liquidaciones/{sid}/excel")
    async def excel(sid: str, user: dict = Depends(get_current_user)):
        await guard(user)
        doc = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Liquidación no encontrada")
        output = BytesIO()
        build_settlement_workbook(doc["tickets"]).save(output)
        output.seek(0)
        filename = f"TallerPay_{doc['tecnico_codigo']}_{doc['periodo']}.xlsx"
        return StreamingResponse(output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    return router
