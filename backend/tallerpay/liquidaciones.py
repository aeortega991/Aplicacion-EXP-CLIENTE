"""Motor de liquidaciones TallerPay — borradores, kilómetro manual y cierre auditable.

Técnicos y talleres NO tienen relación persistente. Se eligen por liquidación.
No se permite usar registros con precio ambiguo o sin mapeo producto→línea.
"""
import uuid
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .common import clean, now_iso
from .productos import product_code
from .promociones import classify
from .catalogo_act import LEVELS

KM_RATE = Decimal("0.20")
Q = Decimal("0.01")


def usd(value, allow_zero=True):
    try:
        result = Decimal(str(value).replace(",", "."))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Importe no numérico")
    if not result.is_finite() or result < 0 or (not allow_zero and result == 0):
        raise ValueError("Importe inválido")
    return result.quantize(Q, rounding=ROUND_HALF_UP)


def km_value(value):
    try:
        n = Decimal(str(value).replace(",", "."))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Kilometraje inválido")
    if not n.is_finite() or n < 0 or n > 100000:
        raise ValueError("Kilometraje fuera de rango")
    return n.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def summarize(items):
    totals = {}
    for group in ("CS_Exp", "CS_Com", "CS_NoPago", "PENDIENTE"):
        subset = [i for i in items if i["clasificacion"] == group]
        totals[group] = {
            "tickets": len(subset),
            "mano_obra": str(sum((usd(x.get("mano_obra", "0")) for x in subset), Decimal("0")).quantize(Q)),
            "kilometraje": str(sum((usd(x.get("valor_km", "0")) for x in subset), Decimal("0")).quantize(Q)),
            "total": str(sum((usd(x.get("total", "0")) for x in subset), Decimal("0")).quantize(Q)),
        }
    return totals


def create_line(ticket, workshop, products, act, tariffs, specials, promos, kms):
    """Construye una fotografía monetaria por ticket."""
    ticket_id = ticket["ticket_id"]
    result = {
        "ticket_id": ticket_id, "asunto": ticket.get("asunto", ""),
        "tecnico_codigo": ticket.get("tecnico_codigo", ""), "tecnico": ticket.get("tecnico", ""),
        "fecha_solucion": ticket.get("fecha_solucion"),
        "producto_codigo": ticket.get("producto_codigo", ""), "producto": ticket.get("producto_descripcion", ""),
        "codigo_act": ticket.get("codigo_act", ""), "categoria_resolucion": ticket.get("resolucion", ""),
        "cadena": ticket.get("cadena", ""),
        "ruta": ticket.get("ruta", ""), "es_foraneo": bool(ticket.get("es_foraneo")),
        "tipo_cobertura": ticket.get("tipo_cobertura", ""),
    }
    key = product_code(ticket.get("producto_codigo"))
    prod = products.get(key)
    result["linea"] = prod.get("linea") if prod else None
    act_data = act.get(clean(ticket.get("codigo_act")).upper())
    result["nivel"] = act_data.get("nivel_tarifario") if act_data else None
    promo_ticket = {
        **ticket,
        "modelo": key,
        "producto": ticket.get("producto_descripcion", ""),
        "linea": result["linea"],
        "categoria_resolucion": ticket.get("resolucion", ""),
    }
    classification = classify(promo_ticket, promos)
    result["clasificacion"] = classification["clasificacion"]
    result["motivo"] = classification.get("motivo")
    result["promocion_id"] = classification.get("promocion_id")
    result["mano_obra"] = "0.00"
    result["valor_km"] = "0.00"
    result["total"] = "0.00"
    result["km"] = None
    result["precio_origen"] = None
    result["errores"] = []
    if result["clasificacion"] == "CS_NoPago":
        return result

    if result["clasificacion"] == "PENDIENTE":
        result["errores"].append("Promociones ambiguas")
    if not prod:
        result["errores"].append("Producto SAP sin línea configurada")
    if not act_data:
        result["errores"].append("Código ACT no registrado")
    elif not result["nivel"]:
        result["errores"].append("Código ACT sin nivel tarifable")

    special_key = (result["linea"], clean(ticket.get("resolucion")).upper())
    special = specials.get(special_key)
    standard = tariffs.get((result["linea"], result["nivel"]))
    if special:
        base = special["valor"]
        base_origin = "ESPECIAL"
    elif standard:
        base = standard["valor"]
        base_origin = "MATRIZ"
    else:
        base = None
        base_origin = None
    if base is None:
        result["errores"].append("No existe tarifa aplicable del taller")
    # Una promoción comercial siempre sustituye el importe contractual normal.
    if result["clasificacion"] == "CS_Com":
        if classification.get("precio_promocional") is None:
            result["errores"].append("Promoción comercial sin precio asignado")
        else:
            price = classification["precio_promocional"]
            base_origin = "PROMOCIONAL"
    else:
        price = base

    if result["es_foraneo"]:
        if ticket_id not in kms:
            result["errores"].append("Falta ingresar kilometraje foráneo (puede ser cero)")
        else:
            try:
                result["km"] = str(km_value(kms[ticket_id]))
            except ValueError as exc:
                result["errores"].append(str(exc))
    if result["errores"]:
        return result
    result["mano_obra"] = str(usd(price))
    result["precio_origen"] = base_origin
    result["valor_km"] = str((Decimal(result["km"]) * KM_RATE).quantize(Q)) if result["es_foraneo"] else "0.00"
    result["total"] = str((Decimal(result["mano_obra"]) + Decimal(result["valor_km"])).quantize(Q))
    return result


class DraftIn(BaseModel):
    taller_id: str
    periodo: str
    tecnicos: list[str] = Field(min_length=1)
    kilometros: dict[str, str] = Field(default_factory=dict)


class KilometerEdit(BaseModel):
    kilometros: dict[str, str]
    motivo: str = ""


class PriceAdjustment(BaseModel):
    ticket_id: str
    nuevo_importe: str
    motivo: str


class CloseIn(BaseModel):
    motivo: str = ""


class SpecialIn(BaseModel):
    taller_id: str
    linea: str
    categoria_resolucion: str
    valor: str


def create_liquidaciones_router(db, current_user, effective_perms):
    router = APIRouter(tags=["TallerPay: Liquidaciones"])

    async def guard(user, edit=False, closed=False):
        if user.get("role") not in {"admin", "coordinador", "lider"}:
            raise HTTPException(403, "Rol no autorizado")
        if closed and user.get("role") not in {"admin", "coordinador"}:
            raise HTTPException(403, "Las liquidaciones cerradas solo pueden modificarse por admin o coordinador")
        if user.get("role") != "admin":
            permissions = await effective_perms(user)
            if not permissions.get("tallerpay", {}).get("view") or not permissions.get("tp_liquidaciones", {}).get("view"):
                raise HTTPException(403, "Sin acceso a liquidaciones")
            if edit and not permissions.get("tp_liquidaciones", {}).get("edit"):
                raise HTTPException(403, "Sin permiso para modificar liquidaciones")

    def actor(u):
        return {"id": u.get("id"), "username": u.get("username"), "name": u.get("name"), "role": u.get("role")}

    async def startup():
        await db.tp_settlements.create_index("id", unique=True)
        await db.tp_settlements.create_index([("taller_id", 1), ("periodo", 1)])
        await db.tp_special_tariffs.create_index(
            [("taller_id", 1), ("linea", 1), ("categoria_resolucion", 1)], unique=True)

    async def generate(payload):
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", payload.periodo):
            raise HTTPException(400, "Período inválido")
        techs = sorted({clean(t) for t in payload.tecnicos if clean(t)})
        if not techs:
            raise HTTPException(400, "Seleccione al menos un técnico")
        workshop = await db.tp_workshops.find_one({"id": payload.taller_id}, {"_id": 0})
        if not workshop or not workshop.get("activo", False):
            raise HTTPException(400, "Taller no encontrado o inactivo")
        tickets = await db.tp_sap_tickets.find(
            {"periodo_solucion": payload.periodo, "tecnico_codigo": {"$in": techs}},
            {"_id": 0}).to_list(50000)
        if not tickets:
            raise HTTPException(400, "No existen tickets SAP para el período y técnicos seleccionados")
        # No asociar técnicos con talleres en una colección permanente.
        codes = list({product_code(t.get("producto_codigo")) for t in tickets if t.get("producto_codigo")})
        acts = list({clean(t.get("codigo_act")).upper() for t in tickets if t.get("codigo_act")})
        product_list = await db.tp_product_lines.find({"codigo_sap": {"$in": codes}}, {"_id": 0}).to_list(10000)
        act_list = await db.tp_act_codes.find({"codigo": {"$in": acts}}, {"_id": 0}).to_list(10000)
        tariffs = await db.tp_tariff_matrix.find({"taller_id": payload.taller_id}, {"_id": 0}).to_list(1000)
        specials = await db.tp_special_tariffs.find({"taller_id": payload.taller_id}, {"_id": 0}).to_list(1000)
        promotions = await db.tp_promotions.find({"activo": True}, {"_id": 0}).to_list(5000)
        products = {x["codigo_sap"]: x for x in product_list}
        act_map = {x["codigo"]: x for x in act_list}
        tariff_map = {(x["linea"], x["nivel"]): x for x in tariffs}
        special_map = {(x["linea"], x["categoria_resolucion"]): x for x in specials}
        lines = [create_line(t, workshop, products, act_map, tariff_map, special_map,
                             promotions, payload.kilometros) for t in tickets]
        return workshop, lines

    @router.get("/liquidaciones/tecnicos")
    async def technicians(periodo: str, user: dict = Depends(current_user)):
        await guard(user)
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", periodo):
            raise HTTPException(400, "Período inválido")
        pipeline = [
            {"$match": {"periodo_solucion": periodo, "tecnico_codigo": {"$nin": ["", None]}}},
            {"$group": {"_id": "$tecnico_codigo", "nombre": {"$first": "$tecnico"}, "tickets": {"$sum": 1}}},
            {"$sort": {"nombre": 1}}
        ]
        docs = await db.tp_sap_tickets.aggregate(pipeline).to_list(10000)
        return {"items": [{"codigo": x["_id"], "nombre": x["nombre"], "tickets": x["tickets"]} for x in docs]}

    @router.get("/liquidaciones/especiales")
    async def special_tariffs(taller_id: str, user: dict = Depends(current_user)):
        await guard(user)
        return {"items": await db.tp_special_tariffs.find({"taller_id": taller_id}, {"_id": 0}).to_list(1000)}

    @router.put("/liquidaciones/especiales")
    async def save_special(payload: SpecialIn, user: dict = Depends(current_user)):
        await guard(user, edit=True)
        workshop = await db.tp_workshops.find_one({"id": payload.taller_id}, {"_id": 0})
        if not workshop or payload.linea not in workshop.get("lineas", []):
            raise HTTPException(400, "Taller o línea no válidos")
        category = clean(payload.categoria_resolucion).upper()
        if not category: raise HTTPException(400, "Categoría de resolución obligatoria")
        try: value = str(usd(payload.valor, False))
        except ValueError as exc: raise HTTPException(400, str(exc))
        query = {"taller_id": payload.taller_id, "linea": payload.linea, "categoria_resolucion": category}
        await db.tp_special_tariffs.update_one(query, {
            "$set": {"valor": value, "updated_at": now_iso(), "updated_by": actor(user)},
            "$setOnInsert": {"id": str(uuid.uuid4())},
            "$push": {"historial": {"valor": value, "fecha": now_iso(), "usuario": actor(user)}}}, upsert=True)
        return await db.tp_special_tariffs.find_one(query, {"_id": 0})

    @router.post("/liquidaciones/preview")
    async def preview(payload: DraftIn, user: dict = Depends(current_user)):
        await guard(user)
        workshop, lines = await generate(payload)
        errors = [f"{t['ticket_id']}: {', '.join(t['errores'])}" for t in lines if t["errores"]]
        return {"taller": workshop, "periodo": payload.periodo, "tickets": lines,
                "errores": errors[:200], "total_errores": len(errors), "totales": summarize(lines)}

    @router.post("/liquidaciones")
    async def create(payload: DraftIn, user: dict = Depends(current_user)):
        await guard(user, edit=True)
        workshop, lines = await generate(payload)
        errors = [f"{t['ticket_id']}: {', '.join(t['errores'])}" for t in lines if t["errores"]]
        if errors:
            raise HTTPException(422, {"message": "Liquidación incompleta", "errores": errors[:200]})
        # Un ticket no puede aparecer en más de una liquidación, incluso en borrador.
        ids = [t["ticket_id"] for t in lines]
        used = await db.tp_settlements.find_one({"tickets.ticket_id": {"$in": ids}}, {"id": 1})
        if used:
            raise HTTPException(409, "Tickets ya incluidos en otra liquidación")
        now = now_iso()
        doc = {"id": str(uuid.uuid4()), "taller_id": workshop["id"],
               "taller_nombre": workshop.get("nombre", ""), "codigo_sap": workshop.get("codigo_sap", ""),
               "periodo": payload.periodo, "tecnicos": sorted(set(payload.tecnicos)),
               "tickets": lines, "totales": summarize(lines),
               "estado": "BORRADOR", "version": 1, "created_at": now, "updated_at": now,
               "created_by": actor(user),
               "historial": [{"fecha": now, "usuario": actor(user), "accion": "CREADA"}]}
        await db.tp_settlements.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/liquidaciones")
    async def list_settlements(periodo: str = "", user: dict = Depends(current_user)):
        await guard(user)
        q = {"periodo": periodo} if periodo else {}
        return {"items": await db.tp_settlements.find(q,
            {"_id": 0, "tickets": 0}).sort("updated_at", -1).to_list(1000)}

    @router.get("/liquidaciones/{sid}")
    async def get(sid: str, user: dict = Depends(current_user)):
        await guard(user)
        doc = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        if not doc: raise HTTPException(404, "Liquidación no encontrada")
        return doc

    @router.put("/liquidaciones/{sid}/kilometros")
    async def update_km(sid: str, payload: KilometerEdit, user: dict = Depends(current_user)):
        await guard(user, edit=True)
        doc = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        if not doc: raise HTTPException(404, "Liquidación no encontrada")
        await guard(user, closed=doc["estado"] == "CERRADO")
        if doc["estado"] == "CERRADO" and not clean(payload.motivo):
            raise HTTPException(400, "La modificación de un cierre exige motivo")
        lines = doc["tickets"]
        old_values = {}
        for t in lines:
            if t["ticket_id"] not in payload.kilometros:
                continue
            if not t["es_foraneo"] or t["clasificacion"] in ("CS_NoPago", "PENDIENTE"):
                raise HTTPException(400, f"Kilometraje no aplicable al ticket {t['ticket_id']}")
            try: n = km_value(payload.kilometros[t["ticket_id"]])
            except ValueError as exc: raise HTTPException(400, str(exc))
            old_values[t["ticket_id"]] = t.get("km")
            t["km"] = str(n)
            t["valor_km"] = str((n*KM_RATE).quantize(Q))
            t["total"] = str((usd(t["mano_obra"])+usd(t["valor_km"])).quantize(Q))
        now = now_iso()
        update_result = await db.tp_settlements.update_one({"id": sid, "version": doc["version"]}, {
            "$set": {"tickets": lines, "totales": summarize(lines), "updated_at": now},
            "$inc": {"version": 1},
            "$push": {"historial": {"fecha": now, "usuario": actor(user), "accion": "EDITAR_KM",
                                    "motivo": payload.motivo, "anteriores": old_values,
                                    "nuevos": payload.kilometros}}})
        if not update_result.modified_count:
            raise HTTPException(409, "La liquidación fue modificada por otro usuario; recargue")
        return await db.tp_settlements.find_one({"id": sid}, {"_id": 0})

    @router.put("/liquidaciones/{sid}/ajustar")
    async def edit_amount(sid: str, payload: PriceAdjustment, user: dict = Depends(current_user)):
        await guard(user, edit=True)
        doc = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        if not doc: raise HTTPException(404, "Liquidación no encontrada")
        await guard(user, closed=doc["estado"] == "CERRADO")
        if not clean(payload.motivo):
            raise HTTPException(400, "Todo ajuste monetario exige motivo")
        try:
            value = str(usd(payload.nuevo_importe))
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        line = next((x for x in doc["tickets"] if x["ticket_id"] == payload.ticket_id), None)
        if not line:
            raise HTTPException(404, "Ticket fuera de la liquidación")
        if line["clasificacion"] in ("CS_NoPago", "PENDIENTE"):
            raise HTTPException(400, "No es posible asignar valores a un ticket no pagable")
        previous = line["mano_obra"]
        previous_origin = line.get("precio_origen")
        line["mano_obra"] = value
        line["precio_origen"] = "AJUSTE_MANUAL"
        line["total"] = str((usd(value)+usd(line.get("valor_km", "0"))).quantize(Q))
        now = now_iso()
        result = await db.tp_settlements.update_one({"id": sid, "version": doc["version"]},
            {"$set": {"tickets": doc["tickets"], "totales": summarize(doc["tickets"]), "updated_at": now},
             "$inc": {"version": 1},
             "$push": {"historial": {"fecha": now, "usuario": actor(user), "accion": "AJUSTE_IMPORTE",
                                     "motivo": clean(payload.motivo), "ticket_id": payload.ticket_id,
                                     "anterior": previous, "anterior_origen": previous_origin,
                                     "nuevo": value}}})
        if not result.modified_count:
            raise HTTPException(409, "La liquidación fue modificada por otro usuario; recargue")
        return await db.tp_settlements.find_one({"id": sid}, {"_id": 0})

    @router.post("/liquidaciones/{sid}/cerrar")
    async def close(sid: str, payload: CloseIn, user: dict = Depends(current_user)):
        await guard(user, edit=True)
        doc = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        if not doc: raise HTTPException(404, "Liquidación no encontrada")
        if doc["estado"] == "CERRADO": raise HTTPException(409, "Ya está cerrada")
        now = now_iso()
        await db.tp_settlements.update_one({"id": sid, "estado": "BORRADOR"},
            {"$set": {"estado": "CERRADO", "updated_at": now, "closed_at": now, "closed_by": actor(user)},
             "$inc": {"version": 1},
             "$push": {"historial": {"fecha": now, "usuario": actor(user),
                                     "accion": "CERRADA", "motivo": payload.motivo}}})
        return await db.tp_settlements.find_one({"id": sid}, {"_id": 0})

    @router.get("/liquidaciones/{sid}/excel")
    async def export(sid: str, user: dict = Depends(current_user)):
        await guard(user)
        doc = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        if not doc: raise HTTPException(404, "Liquidación no encontrada")
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
        wb = Workbook()
        wb.remove(wb.active)
        cols = ["ticket_id","tecnico_codigo","tecnico","fecha_solucion","asunto","producto_codigo",
                "producto","linea","codigo_act","nivel","categoria_resolucion","ruta","km",
                "mano_obra","valor_km","total","precio_origen","motivo","tipo_cobertura"]
        for group, title in [("CS_Exp", "CS_Exp"), ("CS_Com", "CS_Com"), ("CS_NoPago", "CS_NoPago")]:
            ws = wb.create_sheet(title)
            ws.append(cols)
            for cell in ws[1]:
                cell.font = Font(bold=True, color="FFFFFF")
                cell.fill = PatternFill("solid", fgColor="17365D")
            for line in doc["tickets"]:
                if line["clasificacion"] == group:
                    ws.append([line.get(c) for c in cols])
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
        output = BytesIO()
        wb.save(output)
        output.seek(0)
        filename = f"TallerPay_{doc['codigo_sap']}_{doc['periodo']}.xlsx"
        return StreamingResponse(output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    return router, startup
