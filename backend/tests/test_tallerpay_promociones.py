"""Pruebas de reglas comerciales, sin tocar MongoDB real."""
import unittest

from fastapi import FastAPI
from tallerpay.promociones import (
    PromoIn, PROMO_HEADERS, classify, create_promotions_router, match_value,
    normalize_promo, promotion_match,
)


class PromotionsRulesTests(unittest.TestCase):
    def setUp(self):
        self.base = normalize_promo({
            "nombre": "Instalación comercial", "cadena": "Kywi", "modelo": "ASI-365A",
            "categoria_resolucion": "INSTALACION NIVEL 1", "linea": "blanca",
            "producto": "AIRE ACONDICIONADO", "vigente_desde": "2026-01-01",
            "vigente_hasta": "2026-12-31",
        })
        self.base["id"] = "PROMO-1"
        self.base["activo"] = True
        self.ticket = {
            "fecha_solucion": "2026-10-10",
            "causa_no_solucion": "Sin asignar",
            "asunto": "Instalación aire acondicionado",
            "cadena": "KYWI", "modelo": "asi-365a",
            "categoria_resolucion": "INSTALACION NIVEL 1", "linea": "BLANCA",
            "producto": "AIRE ACONDICIONADO",
        }

    def test_match_exact_and_case_insensitive(self):
        self.assertTrue(match_value("kywi", "KYWI"))
        self.assertTrue(match_value("*", ""))
        self.assertFalse(match_value("ASI-365A", "ASI-125A"))
        self.assertTrue(promotion_match(self.base, self.ticket))

    def test_dates_and_inactive(self):
        self.assertFalse(promotion_match(self.base, {**self.ticket, "fecha_solucion": "2027-01-01"}))
        self.assertFalse(promotion_match({**self.base, "activo": False}, self.ticket))

    def test_classifications(self):
        self.assertEqual(classify(self.ticket, [self.base])["clasificacion"], "CS_Com")
        self.assertEqual(classify({**self.ticket, "modelo": "NO-EXISTE"}, [self.base])["clasificacion"], "CS_Exp")
        for overrides in [
            {"fecha_solucion": None}, {"causa_no_solucion": "Cliente ausente"},
            {"asunto": "ENTREGA equipo"}, {"referencia_otro_ticket": True},
        ]:
            with self.subTest(overrides=overrides):
                self.assertEqual(classify({**self.ticket, **overrides}, [self.base])["clasificacion"], "CS_NoPago")

    def test_ambiguous_same_specificity(self):
        duplicate = {**self.base, "id": "PROMO-2", "nombre": "Otra promoción"}
        self.assertEqual(classify(self.ticket, [self.base, duplicate])["clasificacion"], "PENDIENTE")

    def test_specific_over_general(self):
        broad = {**self.base, "id": "PROMO-GENERAL", "modelo": "*"}
        self.assertEqual(classify(self.ticket, [broad, self.base])["promocion_id"], "PROMO-1")

    def test_validate_dates_and_scope(self):
        with self.assertRaises(ValueError):
            normalize_promo({**self.base, "vigente_hasta": "2025-01-01"})
        with self.assertRaises(ValueError):
            normalize_promo({"nombre": "X", "cadena": "*", "vigente_desde": "2026-01-01",
                             "vigente_hasta": "2026-12-31"})

    def test_template_and_api_routes(self):
        self.assertEqual(len(PROMO_HEADERS), 9)
        async def current_user():
            return {"role": "admin"}
        async def perms(user):
            return {}
        router, startup = create_promotions_router(object(), current_user, perms)
        registered = {(m, r.path) for r in router.routes for m in r.methods}
        for item in [("GET", "/promociones"), ("POST", "/promociones"),
                     ("PUT", "/promociones/{pid}"), ("POST", "/promociones/{pid}/estado"),
                     ("GET", "/promociones/template"), ("POST", "/promociones/import"),
                     ("POST", "/promociones/evaluar")]:
            self.assertIn(item, registered)
        self.assertTrue(callable(startup))
        from tallerpay.router import create_tallerpay_router
        app = FastAPI()
        app.include_router(create_tallerpay_router(current_user, perms, db=object()))
        self.assertIn("/api/tallerpay/promociones", app.openapi()["paths"])


if __name__ == "__main__":
    unittest.main()
