"""Utilidades compartidas del módulo Pago a talleres (normalización y Excel)."""
import re
import unicodedata
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

LINEAS = {"blanca": "Línea Blanca", "cafe": "Línea Café"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean(v) -> str:
    return str(v if v is not None else "").strip()


def upper(v) -> str:
    return clean(v).upper()


def num_text(v) -> str:
    """Texto de una celda que puede venir como número de Excel (1790012345001.0 -> '1790012345001')."""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return clean(v)


def norm_sap(v) -> str:
    """Código SAP: sin espacios, mayúsculas; los números de Excel (1001.0) se vuelven '1001'."""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"\s+", "", upper(v))


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def norm_linea(v) -> Optional[str]:
    s = re.sub(r"^linea\\s+", "", _strip_accents(clean(v).lower())).strip()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s if re.fullmatch(r"[a-z0-9][a-z0-9-]{1,39}", s) else None


def to_number(v, field: str, minimum: float = 0, allow_zero: bool = False) -> float:
    try:
        n = round(float(str(v).replace(",", ".")), 2)
    except (TypeError, ValueError):
        raise ValueError(f"'{field}' debe ser numérico")
    if n < minimum or (not allow_zero and n == 0):
        raise ValueError(f"'{field}' debe ser mayor a {minimum:g}")
    return n


def to_date(v) -> Optional[str]:
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if hasattr(v, "isoformat"):
        return v.isoformat()
    s = clean(v)[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError("fecha inválida (use AAAA-MM-DD)")


def build_template(headers: list, example: list, filename: str) -> StreamingResponse:
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Plantilla"
    ws.append(headers)
    ws.append(example)
    for col in range(1, len(headers) + 1):  # celdas de texto: conserva ceros iniciales (RUC, teléfono, SAP)
        for row in range(2, 502):
            if not isinstance(example[col - 1], (int, float)):
                ws.cell(row=row, column=col).number_format = "@"
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0033A0")
    for i, h in enumerate(headers, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(16, len(h) + 6)
    ws.freeze_panes = "A2"
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type=XLSX_MIME, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def read_rows(content: bytes):
    """Devuelve [(nro_fila, {encabezado: valor})] ignorando filas vacías."""
    import openpyxl
    try:
        wb = openpyxl.load_workbook(BytesIO(content), data_only=True, read_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Archivo Excel inválido (.xlsx)")
    rows = list(wb.active.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    headers = [clean(h).lower() for h in rows[0]]
    out = []
    for idx, row in enumerate(rows[1:], start=2):
        if row is None or all(c is None or clean(c) == "" for c in row):
            continue
        out.append((idx, {headers[i]: row[i] for i in range(min(len(headers), len(row))) if headers[i]}))
    return headers, out
