"""Catálogos configurables, Codificador ACT y matriz tarifaria V2.

La colección tp_tariffs histórica se conserva sin cambios. Los importes nuevos se
guardan en tp_tariff_matrix; la migración de datos ambiguos nunca es automática.
"""
import re
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from .common import clean, now_iso, read_rows

LEVELS = {"SL": "Leve", "SM": "Moderado", "SG": "Grave"}
DEFAULT_LINES = [("blanca", "Línea Blanca"), ("cafe", "Línea Café")]
DEFAULT_WEIGHTS = [("SB", "Básico", "SL"), ("SL", "Leve", "SL"),
                   ("SM", "Moderado", "SM"), ("SG", "Grave", "SG"),
                   ("SE", "Especial", "SG")]
MAX_IMPORT_BYTES = 8 * 1024 * 1024


def slug(value):
    from .common import _strip_accents
    value = _strip_accents(clean(value).lower())
    value = re.sub(r"^linea\s+", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value


def code(value):
    v = clean(value).upper()
    if isinstance(value, (float, int)) and float(value).is_integer():
        v = str(int(value))
    return v


def money_number(value):
    try:
        d = Decimal(str(value).replace(",", ".")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError):
        raise ValueError("Valor USD inválido")
    if not d.is_finite() or d <= 0:
        raise ValueError("El valor debe ser mayor a cero")
    return str(d)


class LineIn(BaseModel):
    nombre: str


class WeightIn(BaseModel):
    codigo: str
    nombre: str
    nivel_tarifario: str


class MatrixIn(BaseModel):
    taller_id: str
    linea: str
    nivel: str
    valor: str
    vigente_desde: str | None = None


class LegacyMapIn(BaseModel):
    mapa: dict[str, str]  # peso numérico histórico -> SL/SM/SG, decisión explícita


def create_catalogo_act_router(db, get_current_user, effective_perms):
    router = APIRouter(tags=["Pago a talleres: catálogos y ACT"])

    async def guard(user, resource="tp_tarifarios", edit=False):
        if user.get("role") not in {"admin", "lider", "coordinador"}:
            raise HTTPException(403, "Acceso no permitido")
        if user.get("role") != "admin":
            perms = await effective_perms(user)
            if not perms.get("tallerpay", {}).get("view") or not perms.get(resource, {}).get("view"):
                raise HTTPException(403, "Sin permiso de consulta")
            if edit and not perms.get(resource, {}).get("edit"):
                raise HTTPException(403, "Sin permiso de edición")

    def actor(user):
        return {"id": user.get("id"), "username": user.get("username"), "name": user.get("name")}

    async def startup():
        await db.tp_lines.create_index("codigo", unique=True)
        await db.tp_act_weights.create_index("codigo", unique=True)
        await db.tp_act_codes.create_index("codigo", unique=True)
        await db.tp_act_imports.create_index("id", unique=True)
        await db.tp_tariff_matrix.create_index([("taller_id", 1), ("linea", 1), ("nivel", 1)], unique=True)
        for key, name in DEFAULT_LINES:
            await db.tp_lines.update_one({"codigo": key},
                {"$setOnInsert": {"codigo": key, "nombre": name, "activo": True, "sistema": True}}, upsert=True)
        for key, name, level in DEFAULT_WEIGHTS:
            await db.tp_act_weights.update_one({"codigo": key},
                {"$setOnInsert": {"codigo": key, "nombre": name, "nivel_tarifario": level,
                                   "activo": True, "sistema": True}}, upsert=True)

    @router.get("/catalogo/lineas")
    async def lines(user: dict = Depends(get_current_user)):
        await guard(user, "tp_talleres")
        return {"items": await db.tp_lines.find({}, {"_id": 0}).sort("nombre", 1).to_list(500)}

    @router.post("/catalogo/lineas")
    async def create_line(payload: LineIn, user: dict = Depends(get_current_user)):
        await guard(user, "tp_talleres", True)
        nombre = clean(payload.nombre)
        key = slug(nombre)
        if not 2 <= len(key) <= 40 or not 2 <= len(nombre) <= 80:
            raise HTTPException(400, "Nombre de línea inválido")
        doc = {"codigo": key, "nombre": nombre, "activo": True, "sistema": False,
               "created_at": now_iso(), "created_by": actor(user)}
        try:
            await db.tp_lines.insert_one(doc)
        except DuplicateKeyError:
            raise HTTPException(409, "La línea ya existe")
        doc.pop("_id", None)
        return doc

    @router.get("/catalogo/pesos")
    async def weights(user: dict = Depends(get_current_user)):
        await guard(user, "tp_codificador")
        return {"items": await db.tp_act_weights.find({}, {"_id": 0}).sort("codigo", 1).to_list(500),
                "niveles": LEVELS}

    @router.post("/catalogo/pesos")
    async def create_weight(payload: WeightIn, user: dict = Depends(get_current_user)):
        await guard(user, "tp_codificador", True)
        key = code(payload.codigo)
        level = code(payload.nivel_tarifario)
        if not re.fullmatch(r"[A-Z0-9_-]{1,16}", key) or level not in LEVELS or not clean(payload.nombre):
            raise HTTPException(400, "Código, descripción o nivel tarifario inválido")
        doc = {"codigo": key, "nombre": clean(payload.nombre), "nivel_tarifario": level,
               "activo": True, "sistema": False, "created_at": now_iso(), "created_by": actor(user)}
        try:
            await db.tp_act_weights.insert_one(doc)
        except DuplicateKeyError:
            raise HTTPException(409, "El peso ya existe")
        doc.pop("_id", None)
        return doc

    @router.get("/act")
    async def list_act(q: str = "", nivel: str = "", user: dict = Depends(get_current_user)):
        await guard(user, "tp_codificador")
        query = {}
        if nivel:
            if nivel not in LEVELS: raise HTTPException(400, "Nivel inválido")
            query["nivel_tarifario"] = nivel
        if q.strip():
            query["$or"] = [{"codigo": {"$regex": re.escape(q.strip()), "$options": "i"}},
                            {"descripcion": {"$regex": re.escape(q.strip()), "$options": "i"}}]
        items = await db.tp_act_codes.find(query, {"_id": 0}).sort("codigo", 1).to_list(10000)
        return {"items": items, "total": len(items)}

    @router.get("/act/importaciones")
    async def act_imports(user: dict = Depends(get_current_user)):
        await guard(user, "tp_codificador")
        return {"items": await db.tp_act_imports.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)}

    @router.post("/act/import")
    async def import_act(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        await guard(user, "tp_codificador", True)
        if not (file.filename or "").lower().endswith(".xlsx"):
            raise HTTPException(400, "Solo se admiten Excel .xlsx")
        content = await file.read(MAX_IMPORT_BYTES + 1)
        if len(content) > MAX_IMPORT_BYTES:
            raise HTTPException(413, "El Excel supera 8 MB")
        headers, rows = read_rows(content)
        aliases = {
            "codigo": ("codigo", "codigo_act", "codificacion", "resolucion", "codigo_resolucion", "cod"),
            "descripcion": ("descripcion", "detalle", "descripcion_resolucion", "nombre"),
            "peso": ("peso", "peso_act", "nivel", "complejidad"),
            "equivalencia": ("equivalencia", "equivalencia_informativa"),
        }
        from .common import _strip_accents
        def normalize_header(s):
            return re.sub(r"[^a-z0-9]+", "_", _strip_accents(s.lower())).strip("_")
        columns = {normalize_header(h): h for h in headers}
        mapped = {k: next((columns[a] for a in opts if a in columns), None) for k, opts in aliases.items()}
        if not mapped["codigo"] or not mapped["peso"]:
            raise HTTPException(400, "Se requieren columnas de código ACT y peso; encabezados: " + ", ".join(headers))
        weights_by_code = {w["codigo"]: w for w in await db.tp_act_weights.find({}, {"_id": 0}).to_list(500)}
        valid, errors, duplicates, seen = [], [], 0, set()
        for idx, row in rows:
            key = code(row.get(mapped["codigo"]))
            weight = code(row.get(mapped["peso"]))
            if not key or len(key) > 100:
                errors.append(f"Fila {idx}: código ACT vacío o demasiado largo")
                continue
            if key in seen:
                duplicates += 1
                errors.append(f"Fila {idx}: código ACT repetido: {key}")
                continue
            seen.add(key)
            w = weights_by_code.get(weight)
            if not w or not w.get("activo", True):
                errors.append(f"Fila {idx}: peso ACT '{weight}' no configurado; regístrelo primero")
                continue
            valid.append({"codigo": key, "descripcion": clean(row.get(mapped["descripcion"])) if mapped["descripcion"] else "",
                          "peso_original": weight, "nivel_tarifario": w["nivel_tarifario"],
                          "equivalencia": clean(row.get(mapped["equivalencia"])) if mapped["equivalencia"] else "",
                          "original": {k: str(v) if v is not None else "" for k, v in row.items()}})
        # Evitar importaciones parciales inesperadas: filas incorrectas no se guardan.
        if errors:
            return {"confirmed": False, "inserted": 0, "updated": 0, "duplicates": duplicates,
                    "valid": len(valid), "errors": errors[:200], "mensaje": "Corrija los errores y vuelva a importar"}
        batch = str(uuid.uuid4())
        inserted = updated = 0
        for item in valid:
            res = await db.tp_act_codes.update_one({"codigo": item["codigo"]},
                {"$set": {**item, "updated_at": now_iso(), "updated_by": actor(user), "import_id": batch},
                 "$setOnInsert": {"created_at": now_iso()}}, upsert=True)
            inserted += int(res.upserted_id is not None)
            updated += int(res.upserted_id is None)
        await db.tp_act_imports.insert_one({"id": batch, "filename": file.filename,
            "created_at": now_iso(), "user": actor(user), "inserted": inserted,
            "updated": updated, "total": len(rows)})
        return {"confirmed": True, "inserted": inserted, "updated": updated, "duplicates": 0, "errors": []}

    @router.get("/act/resolver/{codigo}")
    async def resolve_act(codigo: str, user: dict = Depends(get_current_user)):
        await guard(user, "tp_codificador")
        result = await db.tp_act_codes.find_one({"codigo": code(codigo)}, {"_id": 0})
        if not result: raise HTTPException(404, "Código ACT desconocido")
        return result

    @router.get("/tarifarios/matriz")
    async def matrix(taller_id: str, user: dict = Depends(get_current_user)):
        await guard(user, "tp_tarifarios")
        rows = await db.tp_tariff_matrix.find({"taller_id": taller_id}, {"_id": 0}).to_list(2000)
        return {"items": rows, "levels": LEVELS}

    @router.put("/tarifarios/matriz")
    async def save_matrix(payload: MatrixIn, user: dict = Depends(get_current_user)):
        await guard(user, "tp_tarifarios", True)
        w = await db.tp_workshops.find_one({"id": payload.taller_id}, {"_id": 0})
        if not w: raise HTTPException(404, "Taller no encontrado")
        if not w.get("activo"): raise HTTPException(400, "Taller inactivo")
        if payload.linea not in w.get("lineas", []): raise HTTPException(400, "Línea no asignada al taller")
        if not await db.tp_lines.find_one({"codigo": payload.linea, "activo": True}):
            raise HTTPException(400, "Línea no registrada o inactiva")
        if payload.nivel not in LEVELS: raise HTTPException(400, "Nivel no válido")
        try: valor = money_number(payload.valor)
        except ValueError as e: raise HTTPException(400, str(e))
        date = payload.vigente_desde
        if date:
            from .common import to_date
            try: date = to_date(date)
            except ValueError as e: raise HTTPException(400, str(e))
        old = await db.tp_tariff_matrix.find_one({"taller_id": w["id"], "linea": payload.linea, "nivel": payload.nivel}, {"_id": 0})
        event = {"fecha": now_iso(), "usuario": actor(user), "valor_anterior": old.get("valor") if old else None,
                 "valor_nuevo": valor}
        query = {"taller_id": w["id"], "linea": payload.linea, "nivel": payload.nivel}
        await db.tp_tariff_matrix.update_one(query,
            {"$set": {"valor": valor, "vigente_desde": date, "updated_at": now_iso(), "updated_by": actor(user)},
             "$setOnInsert": {"id": str(uuid.uuid4()), "codigo_sap": w["codigo_sap"]},
             "$push": {"historial": event}}, upsert=True)
        return await db.tp_tariff_matrix.find_one(query, {"_id": 0})

    @router.get("/tarifarios/legado")
    async def legacy(taller_id: str, user: dict = Depends(get_current_user)):
        await guard(user, "tp_tarifarios")
        rows = await db.tp_tariffs.find({"taller_id": taller_id}, {"_id": 0}).to_list(1000)
        return {"items": rows, "message": "Los registros antiguos permanecen intactos; deben mapearse explícitamente"}

    @router.post("/tarifarios/migrar")
    async def migrate(payload: LegacyMapIn, taller_id: str, user: dict = Depends(get_current_user)):
        """Copia tarifas antiguas explícitamente mapeadas, sin eliminar registros históricos."""
        await guard(user, "tp_tarifarios", True)
        if not payload.mapa:
            raise HTTPException(400, "Proporcione un mapa explícito peso numérico -> SL/SM/SG")
        if any(k not in LEVELS for k in payload.mapa.values()):
            raise HTTPException(400, "Nivel destino inválido")
        original = await db.tp_tariffs.find({"taller_id": taller_id}, {"_id": 0}).to_list(1000)
        candidates, conflicts = {}, []
        for t in original:
            raw = str(t.get("peso"))
            level = payload.mapa.get(raw)
            if not level:
                conflicts.append(f"Sin mapeo: {t['linea']} / peso {raw}")
                continue
            key = (t["linea"], level)
            if key in candidates:
                conflicts.append(f"Colisión: {key[0]} / {key[1]}")
                continue
            candidates[key] = t
        if conflicts:
            return {"applied": False, "errors": conflicts, "migrated": 0}
        for (linea, level), t in candidates.items():
            existing = await db.tp_tariff_matrix.find_one({"taller_id": taller_id, "linea": linea, "nivel": level})
            if existing:
                return {"applied": False, "errors": ["La matriz ya contiene destinos; no se sobrescriben"], "migrated": 0}
        for (linea, level), t in candidates.items():
            await db.tp_tariff_matrix.insert_one({"id": str(uuid.uuid4()), "taller_id": taller_id,
                "codigo_sap": t.get("codigo_sap"), "linea": linea, "nivel": level,
                "valor": money_number(t["valor"]), "vigente_desde": t.get("vigente_desde"),
                "created_at": now_iso(), "updated_at": now_iso(), "migrated_from": t.get("id"),
                "historial": [{"fecha": now_iso(), "usuario": actor(user),
                               "valor_anterior": None, "valor_nuevo": money_number(t["valor"])}]})
        return {"applied": True, "errors": [], "migrated": len(candidates)}

    return router, startup
