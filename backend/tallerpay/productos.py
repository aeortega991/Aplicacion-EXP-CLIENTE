"""Catálogo independiente de productos SAP → líneas TallerPay.

No vincula técnicos con talleres. No modifica los tickets SAP importados:
la resolución producto→línea se realiza dinámicamente al liquidar.
"""
import re
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError
from .common import build_template, clean, now_iso, read_rows

MAX_BYTES = 8 * 1024 * 1024

def product_code(value):
    raw = clean(value).upper()
    if isinstance(value, float) and value.is_integer():
        raw = str(int(value))
    return re.sub(r"\s+", "", raw)

class ProductIn(BaseModel):
    codigo_sap: str
    descripcion: str = ""
    linea: str

def create_productos_router(db, current_user, effective_perms):
    router = APIRouter(tags=["TallerPay: Productos y líneas"])

    async def guard(user, edit=False):
        if user.get("role") not in {"admin", "coordinador", "lider"}:
            raise HTTPException(403, "Acceso denegado")
        if user.get("role") != "admin":
            permissions = await effective_perms(user)
            if not permissions.get("tallerpay", {}).get("view") or not permissions.get("tp_tarifarios", {}).get("view"):
                raise HTTPException(403, "Sin permiso para catálogo de productos")
            if edit and not permissions.get("tp_tarifarios", {}).get("edit"):
                raise HTTPException(403, "Sin permiso de edición")

    async def validate(item):
        code = product_code(item.get("codigo_sap"))
        line = clean(item.get("linea")).lower()
        if not code or len(code) > 80 or not re.fullmatch(r"[A-Z0-9_.\-/]+", code):
            raise ValueError("Código SAP de producto inválido")
        if not await db.tp_lines.find_one({"codigo": line, "activo": True}):
            raise ValueError(f"Línea inexistente o inactiva: {line}")
        return {"codigo_sap": code, "descripcion": clean(item.get("descripcion"))[:250], "linea": line}

    async def startup():
        await db.tp_product_lines.create_index("codigo_sap", unique=True)

    @router.get("/productos")
    async def list_products(q: str = "", linea: str = "", user: dict = Depends(current_user)):
        await guard(user)
        condition = {}
        if linea:
            condition["linea"] = linea
        if q.strip():
            query = re.escape(q.strip())
            condition["$or"] = [
                {"codigo_sap": {"$regex": query, "$options": "i"}},
                {"descripcion": {"$regex": query, "$options": "i"}},
            ]
        items = await db.tp_product_lines.find(condition, {"_id": 0}).sort("codigo_sap", 1).to_list(10000)
        return {"items": items, "total": len(items)}

    @router.get("/productos/pendientes")
    async def missing_products(user: dict = Depends(current_user)):
        await guard(user)
        # Detectar códigos presentes en SAP pero no catalogados sin alterarlos.
        pipeline = [
            {"$match": {"producto_codigo": {"$nin": ["", None]}}},
            {"$group": {"_id": "$producto_codigo", "descripcion": {"$first": "$producto_descripcion"}, "tickets": {"$sum": 1}}},
            {"$sort": {"_id": 1}}, {"$limit": 10000},
        ]
        candidates = await db.tp_sap_tickets.aggregate(pipeline).to_list(10000)
        codes = [product_code(x["_id"]) for x in candidates]
        known = await db.tp_product_lines.find({"codigo_sap": {"$in": codes}}, {"codigo_sap": 1}).to_list(10000)
        present = {x["codigo_sap"] for x in known}
        return {"items": [
            {"codigo_sap": product_code(x["_id"]), "descripcion": x.get("descripcion") or "",
             "tickets": x["tickets"]}
            for x in candidates if product_code(x["_id"]) not in present
        ]}

    @router.put("/productos")
    async def upsert(payload: ProductIn, user: dict = Depends(current_user)):
        await guard(user, True)
        try:
            item = await validate(payload.model_dump())
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        old = await db.tp_product_lines.find_one({"codigo_sap": item["codigo_sap"]}, {"_id": 0})
        actor = {"id": user.get("id"), "username": user.get("username")}
        await db.tp_product_lines.update_one(
            {"codigo_sap": item["codigo_sap"]},
            {"$set": {**item, "updated_at": now_iso(), "updated_by": actor},
             "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now_iso()},
             "$push": {"historial": {"fecha": now_iso(), "usuario": actor,
                                     "linea_anterior": old.get("linea") if old else None,
                                     "linea_nueva": item["linea"]}}},
            upsert=True,
        )
        return await db.tp_product_lines.find_one({"codigo_sap": item["codigo_sap"]}, {"_id": 0})

    @router.get("/productos/plantilla")
    async def template(user: dict = Depends(current_user)):
        await guard(user)
        return build_template(["codigo_sap", "descripcion", "linea"],
                              ["123456", "Aire acondicionado split", "blanca"],
                              "plantilla_productos_lineas.xlsx")

    @router.post("/productos/import")
    async def import_products(file: UploadFile = File(...), user: dict = Depends(current_user)):
        await guard(user, True)
        if not (file.filename or "").lower().endswith(".xlsx"):
            raise HTTPException(400, "Utilice un Excel .xlsx")
        raw = await file.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise HTTPException(413, "El archivo supera 8 MB")
        headers, rows = read_rows(raw)
        if not {"codigo_sap", "linea"}.issubset(set(headers)):
            raise HTTPException(400, "Se requieren codigo_sap y linea")
        items, errors, seen = [], [], set()
        for lineno, row in rows:
            try:
                item = await validate(row)
                if item["codigo_sap"] in seen:
                    raise ValueError("Código SAP repetido en el archivo")
                seen.add(item["codigo_sap"])
                items.append(item)
            except ValueError as exc:
                errors.append(f"Fila {lineno}: {exc}")
        if errors:
            return {"confirmed": False, "insertados": 0, "actualizados": 0, "errors": errors[:200]}
        actor = {"id": user.get("id"), "username": user.get("username")}
        insertados = actualizados = 0
        for item in items:
            old = await db.tp_product_lines.find_one({"codigo_sap": item["codigo_sap"]}, {"_id": 0})
            await db.tp_product_lines.update_one({"codigo_sap": item["codigo_sap"]}, {
                "$set": {**item, "updated_at": now_iso(), "updated_by": actor},
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now_iso()},
                "$push": {"historial": {"fecha": now_iso(), "usuario": actor,
                                        "linea_anterior": old.get("linea") if old else None,
                                        "linea_nueva": item["linea"]}},
            }, upsert=True)
            if old: actualizados += 1
            else: insertados += 1
        return {"confirmed": True, "insertados": insertados, "actualizados": actualizados, "errors": []}

    return router, startup
