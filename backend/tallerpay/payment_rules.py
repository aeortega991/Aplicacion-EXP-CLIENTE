"""Reglas comunes para identificar tickets SAP sin derecho a pago.

En los reportes SAP actuales: columna C es ID de ticket (7 dígitos);
columna B es texto libre. Las referencias a otro ticket en B y la
palabra ENTREGA excluyen el pago. Se preserva el texto original.
"""
import re
import unicodedata

# En el SAP aportado los IDs de ticket tienen exactamente siete dígitos.
# Evita clasificar teléfonos de 9/10 dígitos o códigos de producto como tickets.
TICKET_REF = re.compile(r"(?<![A-Za-z0-9])\d{7}(?![A-Za-z0-9])")


def _normalized(text):
    s = unicodedata.normalize("NFD", str(text or "").upper())
    return "".join(char for char in s if unicodedata.category(char) != "Mn")


def subject_exclusions(subject, current_ticket=""):
    """Identifica motivos CS_NoPago a partir del texto SAP de columna B."""
    normalized = _normalized(subject)
    reasons = []
    # La coincidencia es por palabra, sin confundir con 'ENTREGADO' o 'ENTREGAR'.
    if re.search(r"\bENTREGA\b", normalized):
        reasons.append("ENTREGA_EN_ASUNTO")
    refs = list(dict.fromkeys(m.group() for m in TICKET_REF.finditer(normalized)))
    # Solo otros tickets. La mera mención del propio ID no implica ticket auxiliar.
    refs = [x for x in refs if x != str(current_ticket or "").strip()]
    if refs:
        reasons.append("REFERENCIA_OTRO_TICKET")
    return {"no_pagable": bool(reasons), "motivos": reasons, "tickets_referenciados": refs}


def payment_eligibility(ticket):
    """Resultado preliminar usado por importación y promociones.

    Es una exclusión de pagos; NO autoriza pagos sin tarifas/validaciones.
    """
    subject = subject_exclusions(ticket.get("asunto"), ticket.get("ticket_id"))
    reasons = list(subject["motivos"])
    if not ticket.get("fecha_solucion"):
        reasons.append("SIN_FECHA_SOLUCION")
    cause = _normalized(ticket.get("causa_no_solucion")).strip()
    if cause not in ("", "SIN ASIGNAR"):
        reasons.append("CAUSA_NO_SOLUCION")
    return {**subject, "no_pagable": bool(reasons),
            "motivos": reasons,
            "clasificacion_preliminar": "CS_NoPago" if reasons else "PENDIENTE_CLASIFICACION"}
