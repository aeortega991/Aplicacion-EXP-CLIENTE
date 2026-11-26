"""Reglas de no pago cuando el asunto SAP (columna B) contiene entrega u otro ticket."""
import unittest

from tallerpay.payment_rules import payment_eligibility, subject_exclusions
from tallerpay.promociones import classify


class SAPNoPaymentTests(unittest.TestCase):
    def test_entrega_sin_referencia(self):
        result = subject_exclusions("Entrega de producto al cliente", "1445231")
        self.assertTrue(result["no_pagable"])
        self.assertIn("ENTREGA_EN_ASUNTO", result["motivos"])

    def test_otro_ticket_en_asunto(self):
        result = subject_exclusions("1432626-ENTREGA.", "1445231")
        self.assertEqual(result["tickets_referenciados"], ["1432626"])
        self.assertEqual(set(result["motivos"]),
                         {"ENTREGA_EN_ASUNTO", "REFERENCIA_OTRO_TICKET"})

    def test_referencia_sin_entrega(self):
        result = subject_exclusions("ACEPTA PROFORMA DE LA ORDEN ANTERIOR 1430151", "1438988")
        self.assertTrue(result["no_pagable"])
        self.assertEqual(result["tickets_referenciados"], ["1430151"])

    def test_telefono_y_modelo_no_se_confunden(self):
        self.assertFalse(subject_exclusions("+593 986872237 prioridad esposa", "1434731")["no_pagable"])
        self.assertFalse(subject_exclusions("Modelo 10039535 ASI126A", "1429076")["no_pagable"])

    def test_mencionar_propio_ticket_no_es_referencia(self):
        self.assertFalse(subject_exclusions("Seguimiento 1445231", "1445231")["no_pagable"])

    def test_no_pago_precede_promocion(self):
        ticket = {"ticket_id": "1445231", "asunto": "1432626-ENTREGA.",
                  "fecha_solucion": "2026-10-26", "causa_no_solucion": "Sin asignar"}
        p = {"id":"promo-1", "nombre":"General", "activo":True,
             "cadena":"*", "modelo":"*", "categoria_resolucion":"*",
             "linea":"*", "producto":"*", "vigente_desde":"2026-01-01",
             "vigente_hasta":"2026-12-31"}
        self.assertEqual(payment_eligibility(ticket)["clasificacion_preliminar"], "CS_NoPago")
        self.assertEqual(classify(ticket, [p])["clasificacion"], "CS_NoPago")


if __name__ == "__main__":
    unittest.main()
