"""Motor de liquidaciones TallerPay — borradores, kilómetro manual y cierre auditable.

Cada liquidación pertenece a un técnico existente; sus tarifas son propias.
No se permite usar registros con precio ambiguo o sin mapeo producto→línea.
"""
import uuid
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from .common import clean, now_iso
from .productos import product_code
from .promociones import classify, normalizar_instalacion
from .catalogo_act import LEVELS

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


def create_line(ticket, technician, products, act, tariffs, specials, promos, kms, km_rate=None):
    """Construye una fotografía monetaria por ticket."""
    ticket_id = ticket["ticket_id"]
    # Priorizar la categoría específica de instalación, que puede estar en
    # la resolución SAP o en la categoría de resolución del mismo registro.
    original_resolution = clean(ticket.get("resolucion"))
    sap_category = clean(ticket.get("categoria_resolucion"))
    installation_source = next((v for v in (original_resolution, sap_category)
        if normalizar_instalacion(v) == "INSTALACION NIVEL 1"), None)
    effective_resolution = (normalizar_instalacion(installation_source)
                            if installation_source else original_resolution)
    result = {
        "ticket_id": ticket_id, "asunto": ticket.get("asunto", ""),
        "tecnico_codigo": ticket.get("tecnico_codigo", ""), "tecnico": ticket.get("tecnico", ""),
        "fecha_solucion": ticket.get("fecha_solucion"),
        "producto_codigo": ticket.get("producto_codigo", ""), "producto": ticket.get("producto_descripcion", ""),
        "serie": clean(ticket.get("serie")),
        "codigo_act": ticket.get("codigo_act", ""), "categoria_resolucion": effective_resolution,
        "categoria_resolucion_original": installation_source or original_resolution,
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
        "categoria_resolucion": effective_resolution,
    }
    classification = classify(promo_ticket, promos)
    result["clasificacion"] = classification["clasificacion"]
    result["motivo"] = classification.get("motivo")
    result["promocion_id"] = classification.get("promocion_id")
    result["mano_obra"] = "0.00"
    result["valor_km"] = "0.00"
    result["tarifa_km"] = str(km_rate) if km_rate is not None else None
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
    special_key = (result["linea"], normalizar_instalacion(effective_resolution))
    special = specials.get(special_key)
    # Las instalaciones con tarifa específica no necesitan un nivel ACT
    # para determinar su importe; las demás reparaciones sí.
    if not special:
        if not act_data:
            result["errores"].append("Código ACT no registrado")
        elif not result["nivel"]:
            result["errores"].append("Código ACT sin nivel tarifable")
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
        result["errores"].append("No existe tarifa asociada al técnico")
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
        if km_rate is None:
            result["errores"].append("Falta configurar tarifa por kilómetro del técnico en Tarifarios")
        else:
            try:
                km_rate = usd(km_rate)
                result["tarifa_km"] = str(km_rate)
            except ValueError as exc:
                result["errores"].append(f"Tarifa por kilómetro inválida: {exc}")
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
    result["valor_km"] = str((Decimal(result["km"]) * usd(result["tarifa_km"])).quantize(Q)) if result["es_foraneo"] else "0.00"
    result["total"] = str((Decimal(result["mano_obra"]) + Decimal(result["valor_km"])).quantize(Q))
    return result


class DraftIn(BaseModel):
    tecnico_codigo: str
    periodo: str
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
    tecnico_codigo: str
    linea: str
    categoria_resolucion: str
    valor: str


def build_settlement_workbook(tickets):
    """Excel real de tres hojas; marca series repetidas entre grupos."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    wb = Workbook()
    wb.remove(wb.active)
    cols = ["ticket_id","tecnico_codigo","tecnico","fecha_solucion","asunto","producto_codigo",
            "producto","serie","linea","codigo_act","nivel","categoria_resolucion","ruta","km","tarifa_km",
            "mano_obra","valor_km","total","precio_origen","motivo","tipo_cobertura","categoria_resolucion_original"]
    from collections import Counter
    # Repeticiones entre las TRES hojas, excluyendo series vacías.
    normalize_serie = lambda v: str(v or "").strip().upper()
    counts = Counter(normalize_serie(t.get("serie")) for t in tickets
                     if normalize_serie(t.get("serie")))
    repeated = {value for value, count in counts.items() if count > 1}
    serial_col = cols.index("serie") + 1
    red_fill = PatternFill(fill_type="solid", fgColor="FF9C9C")
    for group, title in [("CS_Exp", "CS_Exp"), ("CS_Com", "CS_Com"), ("CS_NoPago", "CS_NoPago")]:
        ws = wb.create_sheet(title)
        ws.append(cols)
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="17365D")
        for line in tickets:
            if line["clasificacion"] == group:
                ws.append([line.get(c) for c in cols])
                if normalize_serie(line.get("serie")) in repeated:
                    ws.cell(ws.max_row, serial_col).fill = red_fill
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
    return wb


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
        # Garantía a nivel de MongoDB ante dos solicitudes de liquidación simultáneas.
        await db.tp_settlements.create_index("tickets.ticket_id", unique=True, name="uniq_ticket_liquidado")
        await db.tp_settlements.create_index([("tecnico_codigo", 1), ("periodo", 1)])
        await db.tp_technician_tariffs.create_index([("tecnico_codigo", 1), ("linea", 1), ("nivel", 1)], unique=True)
        await db.tp_special_tariffs.create_index(
            [("tecnico_codigo", 1), ("linea", 1), ("categoria_resolucion", 1)], unique=True)

    async def generate(payload):
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", payload.periodo):
            raise HTTPException(400, "Período inválido")
        code = clean(payload.tecnico_codigo)
        if not code:
            raise HTTPException(400, "Debe seleccionar un técnico")
        technician = await db.tool_technicians.find_one({"codigo": code}, {"_id": 0})
        if not technician:
            raise HTTPException(400, "El técnico seleccionado no existe en el catálogo")
        tickets = await db.tp_sap_tickets.find(
            {"periodo_solucion": payload.periodo, "tecnico_codigo": code},
            {"_id": 0}).to_list(50000)
        if not tickets:
            raise HTTPException(400, "Sin tickets SAP para el técnico y período")
        # No asociar técnicos con talleres en una colección permanente.
        codes = list({product_code(t.get("producto_codigo")) for t in tickets if t.get("producto_codigo")})
        acts = list({clean(t.get("codigo_act")).upper() for t in tickets if t.get("codigo_act")})
        product_list = await db.tp_product_lines.find({"codigo_sap": {"$in": codes}}, {"_id": 0}).to_list(10000)
        act_list = await db.tp_act_codes.find({"codigo": {"$in": acts}}, {"_id": 0}).to_list(10000)
        tariffs = await db.tp_technician_tariffs.find({"tecnico_codigo": code}, {"_id": 0}).to_list(1000)
        specials = await db.tp_special_tariffs.find({"tecnico_codigo": code}, {"_id": 0}).to_list(1000)
        promotions = await db.tp_promotions.find({"activo": True}, {"_id": 0}).to_list(5000)
        km_rate_doc = await db.tp_technician_km_rates.find_one({"tecnico_codigo": code}, {"_id": 0})
        km_rate = km_rate_doc.get("valor_km") if km_rate_doc else None
        products = {x["codigo_sap"]: x for x in product_list}
        act_map = {x["codigo"]: x for x in act_list}
        tariff_map = {(x["linea"], x["nivel"]): x for x in tariffs}
        special_map = {(x["linea"], normalizar_instalacion(x["categoria_resolucion"])): x for x in specials}
        lines = [create_line(t, technician, products, act_map, tariff_map, special_map,
                             promotions, payload.kilometros, km_rate) for t in tickets]
        return technician, lines

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
        sap_counts = {clean(x["_id"]): x for x in docs}
        # El selector muestra técnicos creados en el sistema que tienen tickets SAP en el mes.
        catalog = await db.tool_technicians.find(
            {"codigo": {"$in": list(sap_counts)}}, {"_id": 0}).to_list(5000)
        items = []
        for tech in catalog:
            key = clean(tech.get("codigo"))
            source = sap_counts.get(key)
            if source:
                items.append({"codigo": key,
                              "nombre": " ".join(x for x in [clean(tech.get("nombre")), clean(tech.get("apellido"))] if x) or source["nombre"],
                              "tickets": source["tickets"]})
        return {"items": sorted(items, key=lambda x: x["nombre"])}

    @router.get("/liquidaciones/especiales")
    async def special_tariffs(tecnico_codigo: str, user: dict = Depends(current_user)):
        await guard(user)
        return {"items": await db.tp_special_tariffs.find({"tecnico_codigo": clean(tecnico_codigo)}, {"_id": 0}).to_list(1000)}

    @router.put("/liquidaciones/especiales")
    async def save_special(payload: SpecialIn, user: dict = Depends(current_user)):
        await guard(user, edit=True)
        technician = await db.tool_technicians.find_one({"codigo": clean(payload.tecnico_codigo)}, {"_id": 0})
        if not technician or not await db.tp_lines.find_one({"codigo": payload.linea, "activo": True}):
            raise HTTPException(400, "Técnico o línea no válidos")
        category = clean(payload.categoria_resolucion).upper()
        if not category: raise HTTPException(400, "Categoría de resolución obligatoria")
        try: value = str(usd(payload.valor, False))
        except ValueError as exc: raise HTTPException(400, str(exc))
        query = {"tecnico_codigo": clean(payload.tecnico_codigo), "linea": payload.linea, "categoria_resolucion": category}
        await db.tp_special_tariffs.update_one(query, {
            "$set": {"valor": value, "updated_at": now_iso(), "updated_by": actor(user)},
            "$setOnInsert": {"id": str(uuid.uuid4())},
            "$push": {"historial": {"valor": value, "fecha": now_iso(), "usuario": actor(user)}}}, upsert=True)
        return await db.tp_special_tariffs.find_one(query, {"_id": 0})

    @router.post("/liquidaciones/preview")
    async def preview(payload: DraftIn, user: dict = Depends(current_user)):
        await guard(user)
        technician, lines = await generate(payload)
        errors = [f"{t['ticket_id']}: {', '.join(t['errores'])}" for t in lines if t["errores"]]
        return {"tecnico": technician, "periodo": payload.periodo, "tickets": lines,
                "errores": errors[:200], "total_errores": len(errors), "totales": summarize(lines)}

    @router.post("/liquidaciones")
    async def create(payload: DraftIn, user: dict = Depends(current_user)):
        await guard(user, edit=True)
        technician, lines = await generate(payload)
        errors = [f"{t['ticket_id']}: {', '.join(t['errores'])}" for t in lines if t["errores"]]
        if errors:
            raise HTTPException(422, {"message": "Liquidación incompleta", "errores": errors[:200]})
        # Un ticket no puede aparecer en más de una liquidación, incluso en borrador.
        ids = [t["ticket_id"] for t in lines]
        used = await db.tp_settlements.find_one({"tickets.ticket_id": {"$in": ids}}, {"id": 1})
        if used:
            raise HTTPException(409, "Tickets ya incluidos en otra liquidación")
        now = now_iso()
        doc = {"id": str(uuid.uuid4()), "tecnico_codigo": clean(technician["codigo"]),
               "tecnico_nombre": " ".join(filter(None, [technician.get("nombre"), technician.get("apellido")])),
               "periodo": payload.periodo,
               "tickets": lines, "totales": summarize(lines),
               "estado": "BORRADOR", "estado_aprobacion": "EN_ESPERA", "version": 1, "created_at": now, "updated_at": now,
               "created_by": actor(user),
               "historial": [{"fecha": now, "usuario": actor(user), "accion": "CREADA"}]}
        try:
            await db.tp_settlements.insert_one(doc)
        except DuplicateKeyError:
            raise HTTPException(409, "Ya existe una liquidación que incluye uno o más tickets del técnico")
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
            rate = t.get("tarifa_km")
            if rate is None:
                raise HTTPException(400, f"Ticket {t['ticket_id']}: falta tarifa de kilometraje del técnico")
            t["valor_km"] = str((n * usd(rate)).quantize(Q))
            t["total"] = str((usd(t["mano_obra"])+usd(t["valor_km"])).quantize(Q))
        now = now_iso()
        update_result = await db.tp_settlements.update_one({"id": sid, "version": doc["version"]}, {
            "$set": {"tickets": lines, "totales": summarize(lines), "updated_at": now,
                     "estado_aprobacion": "EN_ESPERA"},
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
            {"$set": {"tickets": doc["tickets"], "totales": summarize(doc["tickets"]), "updated_at": now,
                      "estado_aprobacion": "EN_ESPERA"},
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
        updated = await db.tp_settlements.update_one({"id": sid, "estado": "BORRADOR", "version": doc["version"]},
            {"$set": {"estado": "CERRADO", "updated_at": now, "closed_at": now, "closed_by": actor(user)},
             "$inc": {"version": 1},
             "$push": {"historial": {"fecha": now, "usuario": actor(user),
                                     "accion": "CERRADA", "motivo": payload.motivo}}})
        if not updated.modified_count:
            raise HTTPException(409, "La liquidación cambió; recargue antes de cerrar")
        return await db.tp_settlements.find_one({"id": sid}, {"_id": 0})

    @router.get("/liquidaciones/{sid}/excel")
    async def export(sid: str, user: dict = Depends(current_user)):
        await guard(user)
        doc = await db.tp_settlements.find_one({"id": sid}, {"_id": 0})
        if not doc: raise HTTPException(404, "Liquidación no encontrada")
        wb = build_settlement_workbook(doc["tickets"])
        output = BytesIO()
        wb.save(output)
        output.seek(0)
        filename = f"TallerPay_{doc['tecnico_codigo']}_{doc['periodo']}.xlsx"
        return StreamingResponse(output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    return router, startup
