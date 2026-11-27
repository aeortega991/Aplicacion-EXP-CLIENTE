"""Importación SAP Analytics SpreadsheetML 2003 (XML) para TallerPay.

Lee la estructura real: encabezado en fila 16; asunto columna B y ticket columna C.
No calcula ni aprueba pagos. Nunca reescribe tickets ya importados.
"""
import hashlib
import re
import uuid
from collections import Counter
from datetime import datetime
from xml.etree import ElementTree as ET

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from pymongo.errors import BulkWriteError

from .common import clean, now_iso
from .payment_rules import payment_eligibility

SS_NS = "urn:schemas-microsoft-com:office:spreadsheet"
SS = "{" + SS_NS + "}"
MAX_BYTES = 12 * 1024 * 1024
MAX_ROWS = 50000
# Posiciones físicas de la tabla SpreadsheetML, no posiciones de una lista comprimida.
FIELDS = {
    "asunto": 2, "ticket_id": 3, "estado": 4, "centro_servicio": 5,
    "marca": 6, "categoria_resolucion": 7, "fecha_creacion": 8,
    "fecha_solucion": 9, "fecha_finalizacion": 10,
    "cadena": 12, "tipo_cobertura": 13, "fecha_compra": 15,
    "serie": 16, "producto_codigo": 17, "producto_descripcion": 18,
    "resolucion": 19, "categoria_servicio": 20,
    "tecnico": 21, "tecnico_codigo": 22,
    "causa_no_solucion": 23, "codigo_act": 24,
    "centro_codigo": 26, "ruta": 27, "ruta_codigo": 28,
    "inicio_prometida": 29,
}
DATE_FIELDS = {"fecha_creacion", "fecha_solucion", "fecha_finalizacion", "fecha_compra", "inicio_prometida"}


def parse_date(raw):
    raw = clean(raw)
    if not raw:
        return None
    # Timestamp SAP: '19.10.2026 05:00:00 UTC-5' -> fecha local de negocio.
    value = raw[:10]
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Fecha inválida: {raw[:45]}")


def _cells(row):
    """Respeta ss:Index y ss:MergeAcross; celdas vacías no desplazan columnas."""
    cells = {}
    pos = 0
    for cell in row.findall(SS + "Cell"):
        raw_index = cell.get(SS + "Index")
        if raw_index:
            try:
                pos = int(raw_index)
            except ValueError:
                raise ValueError("Índice de columna SAP inválido")
        else:
            pos += 1
        if pos < 1 or pos > 1024:
            raise ValueError("Archivo SAP con índice de columna fuera de rango")
        value = cell.find(SS + "Data")
        cells[pos] = clean(value.text) if value is not None else ""
        span = cell.get(SS + "MergeAcross")
        if span:
            pos += int(span)
    return cells


def is_foraneo(route, code):
    from unicodedata import normalize, category
    raw = normalize("NFD", f"{route} {code}".upper())
    normalized = "".join(c for c in raw if category(c) != "Mn")
    return "FORAN" in normalized


def parse_sap_xml(content):
    if len(content) > MAX_BYTES:
        raise ValueError("El archivo supera el máximo de 12 MB")
    # xml.etree no debe procesar DTD o entidades suministradas por usuarios.
    if re.search(rb"<!\s*(?:DOCTYPE|ENTITY)\b", content, re.I):
        raise ValueError("No se permiten declaraciones DTD ni entidades XML")
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"XML SAP inválido: {exc}") from exc
    if root.tag != SS + "Workbook":
        raise ValueError("El XML no es un libro de Excel SpreadsheetML SAP")
    sheets = root.findall(SS + "Worksheet")
    if not sheets:
        raise ValueError("El libro SAP no contiene hojas")
    tickets, errors, seen = [], [], set()
    source_sheet = None
    found_header = False
    for sheet in sheets:
        table = sheet.find(SS + "Table")
        if table is None:
            continue
        header_found_here = False
        excel_row = 0
        for row in table.findall(SS + "Row"):
            excel_row = int(row.get(SS + "Index", excel_row + 1))
            cells = _cells(row)
            if not header_found_here:
                if (cells.get(2, "").casefold() == "ticket" and
                        cells.get(4, "").casefold() == "estado" and
                        "soluci" in cells.get(9, "").casefold()):
                    header_found_here = True
                    found_header = True
                    source_sheet = sheet.get(SS + "Name", "SAP")
                continue
            # Evita filas totalizadoras, sin ID de ticket, sin datos.
            ticket_id = cells.get(3, "").strip()
            if not ticket_id:
                if any(cells.get(k, "") for k in (2, 4, 9, 22, 24)):
                    errors.append(f"Fila {excel_row}: ticket sin identificador en columna C")
                continue
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", ticket_id):
                errors.append(f"Fila {excel_row}: identificador de ticket inválido")
                continue
            if ticket_id in seen:
                errors.append(f"Fila {excel_row}: ticket duplicado en el archivo: {ticket_id}")
                continue
            seen.add(ticket_id)
            record = {key: cells.get(col, "") for key, col in FIELDS.items()}
            record["ticket_id"] = ticket_id
            original_start = record["inicio_prometida"]
            record["inicio_prometida_original"] = original_start
            try:
                for field in DATE_FIELDS - {"inicio_prometida"}:
                    record[field] = parse_date(record[field])
                try:
                    record["inicio_prometida"] = parse_date(original_start)
                except ValueError:
                    record["inicio_prometida"] = None
                    record["advertencia_inicio_prometida"] = (
                        f"Fila {excel_row} (ticket {ticket_id}): fecha de Inicio Prometida no válida: {original_start}"
                    )
            except ValueError as exc:
                errors.append(f"Fila {excel_row} (ticket {ticket_id}): {exc}")
                continue
            # El reporte original repite fecha de solución en las columnas I y N.
            alternate_date = cells.get(14, "")
            if alternate_date and record["fecha_solucion"]:
                try:
                    if parse_date(alternate_date) != record["fecha_solucion"]:
                        errors.append(f"Fila {excel_row}: fechas de solución I/N no coinciden")
                        continue
                except ValueError:
                    errors.append(f"Fila {excel_row}: segunda fecha de solución inválida")
                    continue
            record["periodo_solucion"] = record["fecha_solucion"][:7] if record["fecha_solucion"] else None
            record["es_foraneo"] = is_foraneo(record["ruta"], record["ruta_codigo"])
            record["facturado"] = record["tipo_cobertura"].strip().upper() == "FACTURADO"
            record.update(payment_eligibility(record))
            record["fila_origen"] = excel_row
            tickets.append(record)
            if len(tickets) > MAX_ROWS:
                raise ValueError("El archivo SAP supera el máximo de 50.000 tickets")
        if header_found_here:
            break
    if not found_header:
        raise ValueError("No se encontró el encabezado SAP (Ticket B, Estado D, Fecha solución I)")
    return {"hoja": source_sheet, "tickets": tickets, "errores": errors}


def parse_sap_xlsx(content):
    """Acepta un Excel convertido desde SAP, con las columnas originales y sus vacíos.

    Localiza la fila de encabezados por nombre: B=Ticket, D=Estado, I=Fecha de solución.
    Admite hojas renombradas y fechas Excel tipo datetime; no depende de que la fila sea 16.
    """
    from io import BytesIO
    import openpyxl
    if len(content) > MAX_BYTES:
        raise ValueError("El archivo supera el máximo de 12 MB")
    try:
        wb = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise ValueError("Archivo Excel .xlsx inválido") from exc
    try:
        for sheet in wb.worksheets:
            found = False
            tickets, errors, seen = [], [], set()
            for row_num, row in enumerate(sheet.iter_rows(values_only=True), start=1):
                if row_num > MAX_ROWS + 200:
                    raise ValueError("El Excel supera el máximo de 50.000 tickets")
                def at(col):
                    value = row[col - 1] if len(row) >= col else None
                    if value is None:
                        return ""
                    if isinstance(value, datetime):
                        return value.strftime("%d.%m.%Y")
                    from datetime import date
                    if isinstance(value, date):
                        return value.strftime("%d.%m.%Y")
                    if isinstance(value, (int, float)) and float(value).is_integer():
                        return str(int(value))
                    return clean(value)
                if not found:
                    if (at(2).casefold() == "ticket" and
                            at(4).casefold() == "estado" and
                            "soluci" in at(9).casefold()):
                        found = True
                    continue
                ticket_id = at(3)
                if not ticket_id:
                    if any(at(k) for k in (2, 4, 9, 22, 24)):
                        errors.append(f"Fila {row_num}: ticket sin identificador en columna C")
                    continue
                if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", ticket_id):
                    errors.append(f"Fila {row_num}: identificador de ticket inválido")
                    continue
                if ticket_id in seen:
                    errors.append(f"Fila {row_num}: ticket duplicado en el archivo: {ticket_id}")
                    continue
                seen.add(ticket_id)
                record = {key: at(col) for key, col in FIELDS.items()}
                record["ticket_id"] = ticket_id
                original_start = record["inicio_prometida"]
                record["inicio_prometida_original"] = original_start
                try:
                    for field in DATE_FIELDS - {"inicio_prometida"}:
                        record[field] = parse_date(record[field])
                    try:
                        record["inicio_prometida"] = parse_date(original_start)
                    except ValueError:
                        record["inicio_prometida"] = None
                        record["advertencia_inicio_prometida"] = (
                            f"Fila {row_num} (ticket {ticket_id}): fecha de Inicio Prometida no válida: {original_start}"
                        )
                    repeated = at(14)
                    if repeated and record["fecha_solucion"] and parse_date(repeated) != record["fecha_solucion"]:
                        raise ValueError("fechas de solución I/N no coinciden")
                except ValueError as exc:
                    errors.append(f"Fila {row_num} (ticket {ticket_id}): {exc}")
                    continue
                record["periodo_solucion"] = record["fecha_solucion"][:7] if record["fecha_solucion"] else None
                record["es_foraneo"] = is_foraneo(record["ruta"], record["ruta_codigo"])
                record["facturado"] = record["tipo_cobertura"].strip().upper() == "FACTURADO"
                record.update(payment_eligibility(record))
                record["fila_origen"] = row_num
                tickets.append(record)
                if len(tickets) > MAX_ROWS:
                    raise ValueError("El Excel supera el máximo de 50.000 tickets")
            if found:
                return {"hoja": sheet.title, "tickets": tickets, "errores": errors}
        raise ValueError("No se encontró el encabezado SAP (Ticket B, Estado D, Fecha solución I)")
    finally:
        wb.close()

def parse_sap_file(content, filename):
    ext = (filename or "").lower().rsplit(".", 1)[-1]
    if ext == "xml":
        return parse_sap_xml(content)
    if ext == "xlsx":
        return parse_sap_xlsx(content)
    raise ValueError("Solo archivos .xml de SAP o Excel .xlsx convertidos")


def preview_summary(parsed):
    rows = parsed["tickets"]
    warnings = [r["advertencia_inicio_prometida"] for r in rows if r.get("advertencia_inicio_prometida")]
    return {
        "hoja": parsed["hoja"], "total_validos": len(rows),
        "total_advertencias": len(warnings), "advertencias": warnings[:100],
        "errores": parsed["errores"][:100], "total_errores": len(parsed["errores"]),
        "periodos": dict(Counter(x["periodo_solucion"] or "SIN_FECHA" for x in rows)),
        "tecnicos": [{"codigo": k, "nombre": name, "tickets": count}
                     for (k, name), count in sorted(Counter(
                         (r["tecnico_codigo"], r["tecnico"]) for r in rows
                     ).items())],
        "facturados": sum(1 for r in rows if r["facturado"]),
        "no_pagables": sum(1 for r in rows if r.get("no_pagable")),
        "por_entrega": sum(1 for r in rows if "ENTREGA_EN_ASUNTO" in r.get("motivos", [])),
        "por_referencia_ticket": sum(1 for r in rows if "REFERENCIA_OTRO_TICKET" in r.get("motivos", [])),
        "foraneos": sum(1 for r in rows if r["es_foraneo"]),
        "muestra": rows[:20],
    }


def file_digest(content):
    return hashlib.sha256(content).hexdigest()


class ImportConfirm(BaseModel):
    # Evitar payload XML dentro de JSON: upload de fichero con multipart.
    pass


def create_sap_router(db, get_current_user, effective_perms):
    router = APIRouter(tags=["TallerPay: Importación SAP"])

    async def guard(user, edit=False):
        if user.get("role") not in {"admin", "coordinador", "lider"}:
            raise HTTPException(403, "Sin acceso a Importación SAP")
        if user.get("role") == "admin":
            return
        perms = await effective_perms(user)
        if not perms.get("tallerpay", {}).get("view") or not perms.get("tp_importacion", {}).get("view"):
            raise HTTPException(403, "Sin permiso para Importación SAP")
        if edit and not perms.get("tp_importacion", {}).get("edit"):
            raise HTTPException(403, "Sin permiso de edición")

    def actor(user):
        return {"id": user.get("id"), "username": user.get("username"), "name": user.get("name")}

    async def startup():
        await db.tp_sap_tickets.create_index("ticket_id", unique=True)
        await db.tp_sap_tickets.create_index([("periodo_solucion", 1), ("tecnico_codigo", 1)])
        await db.tp_sap_imports.create_index("id", unique=True)
        await db.tp_sap_imports.create_index("hash", unique=True)

    async def read_upload(file):
        if not (file.filename or "").lower().endswith((".xml", ".xlsx")):
            raise HTTPException(400, "Seleccione un archivo SAP .xml o Excel .xlsx")
        payload = await file.read(MAX_BYTES + 1)
        if len(payload) > MAX_BYTES:
            raise HTTPException(413, "Archivo superior a 12 MB")
        try:
            return payload, parse_sap_file(payload, file.filename)
        except ValueError as exc:
            raise HTTPException(400, str(exc))

    @router.post("/sap/preview")
    async def preview(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        await guard(user)
        data, parsed = await read_upload(file)
        summary = preview_summary(parsed)
        summary["hash"] = file_digest(data)
        summary["ya_importado"] = bool(await db.tp_sap_imports.find_one({"hash": summary["hash"]}))
        return summary

    @router.post("/sap/import")
    async def commit_import(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        await guard(user, edit=True)
        data, parsed = await read_upload(file)
        if parsed["errores"]:
            raise HTTPException(422, {
                "message": "La carga contiene filas inválidas. No se guardó ningún ticket",
                "errores": parsed["errores"][:100],
                "total_errores": len(parsed["errores"]),
            })
        if not parsed["tickets"]:
            raise HTTPException(400, "El archivo no contiene tickets")
        hash_value = file_digest(data)
        previous = await db.tp_sap_imports.find_one({"hash": hash_value}, {"_id": 0})
        if previous:
            return {"insertados": 0, "omitidos": len(parsed["tickets"]), "repetido": True,
                    "importacion_id": previous["id"]}
        batch = str(uuid.uuid4())
        existing_ids = set()
        ticket_ids = [t["ticket_id"] for t in parsed["tickets"]]
        # Solo leer los identificadores, sin manipular registros importados en el pasado.
        async for record in db.tp_sap_tickets.find({"ticket_id": {"$in": ticket_ids}}, {"ticket_id": 1}):
            existing_ids.add(record["ticket_id"])
        new_rows = [dict(t, importacion_id=batch, imported_at=now_iso(), imported_by=actor(user),
                         taller_id=None, estado_asociacion="PENDIENTE")
                    for t in parsed["tickets"] if t["ticket_id"] not in existing_ids]
        inserted = 0
        if new_rows:
            try:
                result = await db.tp_sap_tickets.insert_many(new_rows, ordered=False)
                inserted = len(result.inserted_ids)
            except BulkWriteError as exc:
                errors = exc.details.get("writeErrors", [])
                if any(e.get("code") != 11000 for e in errors):
                    raise HTTPException(500, "Error al guardar tickets; revise registros antes de repetir")
                inserted = exc.details.get("nInserted", 0)
        omitted = len(parsed["tickets"]) - inserted
        import_record = {
            "id": batch, "hash": hash_value, "filename": file.filename,
            "created_at": now_iso(), "created_by": actor(user), "hoja": parsed["hoja"],
            "total": len(parsed["tickets"]), "insertados": inserted,
            "omitidos": omitted, "periodos": preview_summary(parsed)["periodos"],
        }
        # En ejecución simultánea del mismo archivo, el índice único impide duplicar el registro.
        try:
            await db.tp_sap_imports.insert_one(import_record)
        except Exception:
            existing_import = await db.tp_sap_imports.find_one({"hash": hash_value}, {"_id": 0})
            if not existing_import:
                raise
        return {"importacion_id": batch, "insertados": inserted, "omitidos": omitted,
                "repetido": False, "total": len(parsed["tickets"])}

    @router.get("/sap/importaciones")
    async def imports(user: dict = Depends(get_current_user)):
        await guard(user)
        items = await db.tp_sap_imports.find({}, {"_id": 0, "hash": 0}).sort("created_at", -1).to_list(100)
        return {"items": items}

    @router.get("/sap/tickets")
    async def tickets(periodo: str = "", tecnico_codigo: str = "", q: str = "",
                      skip: int = 0, limit: int = 50, user: dict = Depends(get_current_user)):
        await guard(user)
        if periodo and not re.fullmatch(r"\d{4}-\d{2}", periodo):
            raise HTTPException(400, "Período inválido. Use AAAA-MM")
        if skip < 0 or not 1 <= limit <= 200:
            raise HTTPException(400, "Paginación inválida")
        query = {}
        if periodo:
            query["periodo_solucion"] = periodo
        if tecnico_codigo:
            query["tecnico_codigo"] = tecnico_codigo
        if q.strip():
            query["ticket_id"] = {"$regex": re.escape(q.strip()), "$options": "i"}
        count = await db.tp_sap_tickets.count_documents(query)
        items = await db.tp_sap_tickets.find(query, {"_id": 0}).sort("ticket_id", 1).skip(skip).limit(limit).to_list(limit)
        return {"total": count, "items": items}

    return router, startup
