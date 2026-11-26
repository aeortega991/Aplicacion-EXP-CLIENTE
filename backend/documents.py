"""Módulo Entregas de documentos: registro de entregas (contratos, actas, capacitaciones),
aceptación por el receptor asignado, actas PDF y dashboard general (admin)."""
import io
import uuid
import asyncio
import logging
from html import escape
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel
from pymongo import ReturnDocument

logger = logging.getLogger("documents")

TIPOS = ["Contrato", "Acta de entrega", "Capacitación"]
CAPACITACION = "Capacitación"
PENDIENTE, RECIBIDO = "Pendiente de recepción", "Recibido"
ESTADOS = [PENDIENTE, RECIBIDO]
LOCAL_TZ = timezone(timedelta(hours=-5))  # Ecuador
RESOURCE = "documentos"
MAX_PARTICIPANTES = 500


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _clean(s) -> str:
    return " ".join(str(s or "").split())


def _fmt_local(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso).astimezone(LOCAL_TZ).strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return str(iso)


def _valid_url(u: str) -> bool:
    try:
        p = urlparse(u)
    except ValueError:
        return False
    return p.scheme in ("http", "https") and bool(p.netloc) and " " not in u and len(u) <= 2000


class EntregaIn(BaseModel):
    tipo: str
    receptor_id: str
    documento_url: str
    tema: Optional[str] = None
    capacitador: Optional[str] = None
    lugar: Optional[str] = None
    participantes: Optional[List[str]] = None


def create_documents_router(db, get_current_user, effective_perms, send_email=None,
                            app_base_url: str = "", from_name: str = "", pdf_header=None):
    r = APIRouter(prefix="/api/docs")
    bg_tasks = set()

    async def _require_access(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") == "admin":
            return user
        perms = await effective_perms(user)
        if not perms.get(RESOURCE, {}).get("view"):
            raise HTTPException(status_code=403, detail="No tienes acceso al módulo de entregas de documentos")
        return user

    async def _require_sub(user: dict, key: str, msg: str):
        if user.get("role") == "admin":
            return
        perms = await effective_perms(user)
        if not perms.get(key, {}).get("view"):
            raise HTTPException(status_code=403, detail=msg)

    def _is_admin(user: dict) -> bool:
        return user.get("role") == "admin"

    def _can_see(d: dict, user: dict) -> bool:
        return _is_admin(user) or user["id"] in (d.get("emisor_id"), d.get("receptor_id"))

    async def _get_or_404(entrega_id: str, user: dict) -> dict:
        d = await db.doc_deliveries.find_one({"id": entrega_id}, {"_id": 0})
        if not d or not _can_see(d, user):
            raise HTTPException(status_code=404, detail="Entrega no encontrada")
        return d

    async def _next_code() -> str:
        year = _now_utc().astimezone(LOCAL_TZ).year
        c = await db.counters.find_one_and_update(
            {"_id": f"doc_deliveries_{year}"}, {"$inc": {"seq": 1}},
            upsert=True, return_document=ReturnDocument.AFTER)
        return f"CD-{year}-{c['seq']:06d}"

    def _active_users_query(exclude_id: str) -> dict:
        return {"id": {"$ne": exclude_id}, "activo": {"$ne": False}}

    # ---------- Email ----------
    def _email_html(d: dict) -> str:
        rows = [("Código", d["codigo"]), ("Tipo de documento", d["tipo"]), ("Entregado por", d["emisor_nombre"]),
                ("Ciudad", d["ciudad"]), ("Fecha y hora", _fmt_local(d["created_at"])), ("Estado", d["estado"])]
        if d.get("capacitacion"):
            c = d["capacitacion"]
            rows += [("Tema", c["tema"]), ("Capacitador", c["capacitador"]), ("Lugar", c["lugar"]),
                     ("Participantes", len(c["participantes"]))]
        trs = "".join(
            f'<tr><td style="padding:4px 0;color:#6B7280;font-size:13px;width:150px">{escape(k)}</td>'
            f'<td style="padding:4px 0;font-size:13px;color:#111827">{escape(str(v))}</td></tr>' for k, v in rows)
        link = f"{app_base_url}/documentos/recibidas" if app_base_url.startswith("https://") else ""
        boton = (f'<p style="margin:18px 0 0"><a href="{escape(link)}" style="display:inline-block;background:#0033A0;color:#fff;'
                 f'text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:600">Revisar y aceptar</a></p>') if link else ""
        return (
            f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif">'
            f'<tr><td style="padding:24px"><div style="background:#0033A0;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">'
            f'<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.75">Entregas de documentos · {escape(from_name)}</div>'
            f'<div style="font-size:18px;font-weight:700;margin-top:4px">Tienes una entrega pendiente de recepción</div></div>'
            f'<div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;padding:20px">'
            f'<p style="color:#374151;font-size:14px;margin:0 0 14px">Hola {escape(d["receptor_nombre"])}, '
            f'{escape(d["emisor_nombre"])} registró una entrega de documento dirigida a ti. Ingresa a la aplicación para revisarla y confirmar la recepción.</p>'
            f'<table role="presentation" width="100%" style="border-collapse:collapse">{trs}</table>{boton}'
            f'<p style="margin:18px 0 0;color:#9CA3AF;font-size:12px">Mensaje automático de {escape(from_name)}.</p>'
            f'</div></td></tr></table>')

    async def _notify_receptor(d: dict):
        try:
            if not send_email:
                return
            rec = await db.users.find_one({"id": d["receptor_id"]}, {"_id": 0, "email": 1})
            to = (rec or {}).get("email")
            if not to:
                await db.doc_deliveries.update_one({"id": d["id"]}, {"$set": {"email_estado": "sin_correo"}})
                return
            await send_email(to=to, subject=f"Entrega {d['codigo']} pendiente de recepción", html=_email_html(d))
            await db.doc_deliveries.update_one({"id": d["id"]}, {"$set": {"email_estado": "enviado"}})
        except Exception as e:  # nunca romper el registro por el correo
            logger.error(f"Email de entrega {d.get('codigo')} falló: {e}")
            await db.doc_deliveries.update_one({"id": d["id"]}, {"$set": {"email_estado": "fallido"}})

    # ---------- Endpoints ----------
    @r.get("/meta")
    async def meta(user: dict = Depends(_require_access)):
        users = await db.users.find(_active_users_query(user["id"]),
                                    {"_id": 0, "id": 1, "name": 1, "username": 1, "ciudad": 1, "role": 1}).to_list(5000)
        users.sort(key=lambda u: (u.get("name") or "").upper())
        ciudad = _clean(user.get("ciudad"))
        return {
            "tipos": TIPOS, "estados": ESTADOS,
            "emisor": {"id": user["id"], "name": user.get("name"), "ciudad": ciudad or None},
            "puede_registrar": bool(ciudad),
            "usuarios": users,
        }

    @r.post("/entregas")
    async def create_entrega(payload: EntregaIn, user: dict = Depends(_require_access)):
        await _require_sub(user, "doc_nueva", "No tienes permiso para registrar entregas")
        ciudad = _clean(user.get("ciudad"))
        if not ciudad:
            raise HTTPException(status_code=400, detail="Tu usuario no tiene una ciudad asignada. Pide al administrador que te asigne una ciudad para poder registrar entregas.")
        if payload.tipo not in TIPOS:
            raise HTTPException(status_code=400, detail="Tipo de documento inválido")
        if payload.receptor_id == user["id"]:
            raise HTTPException(status_code=400, detail="No puedes seleccionarte a ti mismo como receptor")
        rec = await db.users.find_one({"id": payload.receptor_id, "activo": {"$ne": False}}, {"_id": 0, "password_hash": 0})
        if not rec:
            raise HTTPException(status_code=400, detail="El usuario receptor no existe o no está activo")
        url = (payload.documento_url or "").strip()
        if not _valid_url(url):
            raise HTTPException(status_code=400, detail="La URL del documento debe ser un enlace válido que empiece con http:// o https://")
        capacitacion = None
        if payload.tipo == CAPACITACION:
            tema, capacitador, lugar = _clean(payload.tema), _clean(payload.capacitador), _clean(payload.lugar)
            participantes = [_clean(p) for p in (payload.participantes or []) if _clean(p)]
            faltan = [n for n, v in (("tema de capacitación", tema), ("nombre del capacitador", capacitador), ("lugar de capacitación", lugar)) if not v]
            if faltan:
                raise HTTPException(status_code=400, detail=f"Completa: {', '.join(faltan)}")
            if not participantes:
                raise HTTPException(status_code=400, detail="Agrega al menos un participante")
            if len(participantes) > MAX_PARTICIPANTES:
                raise HTTPException(status_code=400, detail=f"Máximo {MAX_PARTICIPANTES} participantes")
            if any(len(p) > 150 for p in participantes) or max(len(tema), len(capacitador), len(lugar)) > 300:
                raise HTTPException(status_code=400, detail="Texto demasiado largo")
            capacitacion = {"tema": tema, "capacitador": capacitador, "lugar": lugar, "participantes": participantes}
        now = _now_utc().isoformat()
        d = {
            "id": str(uuid.uuid4()), "codigo": await _next_code(), "tipo": payload.tipo,
            "emisor_id": user["id"], "emisor_nombre": user.get("name") or user.get("username"),
            "emisor_username": user.get("username"), "ciudad": ciudad,
            "receptor_id": rec["id"], "receptor_nombre": rec.get("name") or rec.get("username"),
            "receptor_username": rec.get("username"),
            "documento_url": url, "capacitacion": capacitacion,
            "estado": PENDIENTE, "created_at": now, "aceptado_at": None,
            "email_estado": "pendiente",
        }
        await db.doc_deliveries.insert_one(dict(d))
        task = asyncio.create_task(_notify_receptor(d))
        bg_tasks.add(task)
        task.add_done_callback(bg_tasks.discard)
        return d

    @r.get("/entregas")
    async def list_entregas(scope: str = "recibidas", estado: Optional[str] = None, tipo: Optional[str] = None,
                            ciudad: Optional[str] = None, q: Optional[str] = None, user: dict = Depends(_require_access)):
        if scope == "enviadas":
            await _require_sub(user, "doc_enviadas", "No tienes permiso para ver las entregas enviadas")
            query = {"emisor_id": user["id"]}
        elif scope == "recibidas":
            await _require_sub(user, "doc_recibidas", "No tienes permiso para ver las entregas recibidas")
            query = {"receptor_id": user["id"]}
        elif scope == "todas":
            if not _is_admin(user):
                raise HTTPException(status_code=403, detail="Solo el administrador puede consultar todas las entregas")
            query = {}
        else:
            raise HTTPException(status_code=400, detail="Vista inválida")
        if estado:
            query["estado"] = estado
        if tipo:
            query["tipo"] = tipo
        if ciudad:
            query["ciudad"] = ciudad
        items = await db.doc_deliveries.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
        if q:
            ql = q.strip().lower()
            items = [d for d in items if ql in " ".join(str(d.get(k) or "") for k in
                     ("codigo", "tipo", "emisor_nombre", "receptor_nombre", "ciudad")).lower()]
        return {"items": items, "total": len(items)}

    @r.get("/pendientes")
    async def pending_count(user: dict = Depends(_require_access)):
        n = await db.doc_deliveries.count_documents({"receptor_id": user["id"], "estado": PENDIENTE})
        return {"count": n}

    @r.get("/dashboard")
    async def dashboard(user: dict = Depends(_require_access)):
        if not _is_admin(user):
            raise HTTPException(status_code=403, detail="Solo el administrador puede ver el dashboard general")

        async def group(field: str):
            rows = await db.doc_deliveries.aggregate([
                {"$group": {"_id": f"${field}", "total": {"$sum": 1},
                            "pendientes": {"$sum": {"$cond": [{"$eq": ["$estado", PENDIENTE]}, 1, 0]}}}},
                {"$sort": {"total": -1}}]).to_list(500)
            return [{"name": x["_id"] or "—", "total": x["total"], "pendientes": x["pendientes"],
                     "recibidas": x["total"] - x["pendientes"]} for x in rows]

        por_tipo = await group("tipo")
        seen = {x["name"] for x in por_tipo}
        por_tipo += [{"name": t, "total": 0, "pendientes": 0, "recibidas": 0} for t in TIPOS if t not in seen]
        total = await db.doc_deliveries.count_documents({})
        pend = await db.doc_deliveries.count_documents({"estado": PENDIENTE})
        return {"kpis": {"total": total, "pendientes": pend, "recibidas": total - pend},
                "por_ciudad": await group("ciudad"), "por_tipo": por_tipo}

    @r.get("/entregas/{entrega_id}")
    async def get_entrega(entrega_id: str, user: dict = Depends(_require_access)):
        return await _get_or_404(entrega_id, user)

    @r.post("/entregas/{entrega_id}/aceptar")
    async def accept_entrega(entrega_id: str, user: dict = Depends(_require_access)):
        await _require_sub(user, "doc_recibidas", "No tienes permiso para aceptar entregas")
        d = await _get_or_404(entrega_id, user)
        if d["receptor_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Solo el receptor asignado puede aceptar esta entrega")
        if d["estado"] != PENDIENTE:
            raise HTTPException(status_code=400, detail="Esta entrega ya fue aceptada")
        upd = await db.doc_deliveries.find_one_and_update(
            {"id": entrega_id, "receptor_id": user["id"], "estado": PENDIENTE},
            {"$set": {"estado": RECIBIDO, "aceptado_at": _now_utc().isoformat()}},
            projection={"_id": 0}, return_document=ReturnDocument.AFTER)
        if not upd:
            raise HTTPException(status_code=400, detail="Esta entrega ya fue aceptada")
        return upd

    @r.get("/entregas/{entrega_id}/acta")
    async def acta_pdf(entrega_id: str, user: dict = Depends(_require_access)):
        d = await _get_or_404(entrega_id, user)
        pdf = _build_acta_pdf(d)
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="acta_{d["codigo"]}.pdf"'})

    def _build_acta_pdf(d: dict) -> bytes:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import inch
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.65 * inch, rightMargin=0.65 * inch,
                                topMargin=0.5 * inch, bottomMargin=0.6 * inch, title=f"Acta {d['codigo']}")
        ss = getSampleStyleSheet()
        cell = ParagraphStyle("c", parent=ss["Normal"], fontSize=9.5, leading=12)
        lab = ParagraphStyle("l", parent=cell, textColor=colors.HexColor("#4B5563"), fontName="Helvetica-Bold")
        h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontSize=11.5, textColor=colors.HexColor("#0033A0"), spaceBefore=6, spaceAfter=6)
        P = lambda t, s=cell: Paragraph(escape("—" if t is None else str(t)), s)  # noqa: E731

        story = list(pdf_header(f"Acta de entrega de documento · {d['codigo']}", f"{d['tipo']} · {d['ciudad']}")) if pdf_header else []
        rows = [
            ("Código", d["codigo"]), ("Tipo de documento", d["tipo"]), ("Estado", d["estado"]),
            ("Usuario que entrega", d["emisor_nombre"]), ("Usuario que recibe", d["receptor_nombre"]),
            ("Ciudad", d["ciudad"]), ("Fecha y hora de registro", _fmt_local(d["created_at"])),
            ("Fecha y hora de recepción", _fmt_local(d.get("aceptado_at")) if d.get("aceptado_at") else "Pendiente"),
            ("URL del documento", d["documento_url"]),
        ]
        t = Table([[P(k, lab), P(v)] for k, v in rows], colWidths=[1.9 * inch, 5.3 * inch])
        t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F4F6")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story += [Paragraph("Datos de la entrega", h2), t]

        c = d.get("capacitacion")
        if c:
            ct = Table([[P(k, lab), P(v)] for k, v in (("Tema", c["tema"]), ("Capacitador", c["capacitador"]),
                                                       ("Lugar", c["lugar"]), ("Total participantes", len(c["participantes"])))],
                       colWidths=[1.9 * inch, 5.3 * inch])
            ct.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F4F6")),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story += [Spacer(1, 6), Paragraph("Capacitación", h2), ct, Spacer(1, 8)]
            prow = [[P("N°", lab), P("Participante", lab), P("Firma", lab)]]
            prow += [[P(i + 1), P(n), P("")] for i, n in enumerate(c["participantes"])]
            pt = Table(prow, colWidths=[0.5 * inch, 4.2 * inch, 2.5 * inch], repeatRows=1)
            pt.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EEF9")),
                ("TOPPADDING", (0, 1), (-1, -1), 9), ("BOTTOMPADDING", (0, 1), (-1, -1), 9),
            ]))
            story += [pt]

        sig = ParagraphStyle("s", parent=cell, alignment=1)
        sig_b = ParagraphStyle("sb", parent=sig, fontName="Helvetica-Bold")
        st = Table([
            [P("", sig), "", P("", sig)],
            [P("Entregado por", sig_b), "", P("Recibido por", sig_b)],
            [P(d["emisor_nombre"], sig), "", P(d["receptor_nombre"], sig)],
            [P("Firma: ______________________", sig), "", P("Firma: ______________________", sig)],
        ], colWidths=[3.2 * inch, 0.8 * inch, 3.2 * inch], rowHeights=[0.6 * inch, None, None, 0.35 * inch])
        st.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (0, 0), 0.8, colors.black),
            ("LINEBELOW", (2, 0), (2, 0), 0.8, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ]))
        foot = ParagraphStyle("f", parent=cell, fontSize=8, textColor=colors.HexColor("#9CA3AF"))
        story += [Spacer(1, 14), KeepTogether([Paragraph("Firmas", h2), st, Spacer(1, 10),
                  Paragraph(escape(f"Documento generado el {datetime.now(LOCAL_TZ).strftime('%d/%m/%Y %H:%M')} · {from_name}. "
                                   "El documento original se encuentra en la URL indicada."), foot)])]
        doc.build(story)
        return buf.getvalue()

    async def startup():
        await db.doc_deliveries.create_index("id", unique=True)
        await db.doc_deliveries.create_index("codigo", unique=True)
        await db.doc_deliveries.create_index([("receptor_id", 1), ("estado", 1)])
        await db.doc_deliveries.create_index("emisor_id")

    return r, startup
