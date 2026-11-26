"""Motor de liquidaciones: precedencia de tarifas y ausencia de vínculo técnico–taller."""
import unittest

from tallerpay.liquidaciones import create_line, summarize, km_value, DraftIn, SpecialIn
from tallerpay.catalogo_act import MatrixIn
from tallerpay.productos import product_code


class SettlementTests(unittest.TestCase):
    def setUp(self):
        self.ticket = {
            "ticket_id": "1435400", "fecha_solucion": "2026-10-14",
            "asunto": "INSTALACION DE AIRE ACONDICIONADO", "tecnico_codigo": "TEC-01",
            "tecnico": "TECNICO UNO", "producto_codigo": "AC-80",
            "producto_descripcion": "AIRE ACONDICIONADO", "codigo_act": "SG04AEAD02",
            "resolucion": "INSTALACION NIVEL 1", "cadena": "KYWI",
            "es_foraneo": True, "ruta": "Ruta Foránea",
            "causa_no_solucion": "Sin asignar", "tipo_cobertura": "FACTURADO",
        }
        self.workshop = {"id": "TALLER-01", "nombre": "Taller ABC"}
        self.products = {"AC-80": {"linea": "blanca"}}
        self.act = {"SG04AEAD02": {"nivel_tarifario": "SL"}}
        self.tariffs = {("blanca", "SL"): {"valor": "13.00"}}
        self.special = {("blanca", "INSTALACION NIVEL 1"): {"valor": "13.00"}}
        self.promotions = [{
            "id": "PROMO-01", "nombre": "KYWI instala AC", "activo": True,
            "cadena": "KYWI", "modelo": "AC-80", "categoria_resolucion": "INSTALACION NIVEL 1",
            "linea": "BLANCA", "producto": "AIRE ACONDICIONADO",
            "vigente_desde": "2026-01-01", "vigente_hasta": "2026-12-31",
            "precio_promocional": "10.00"
        }]

    def calculate(self, promos=None, kms=None, ticket=None, tarifa_km="0.20"):
        return create_line(ticket or self.ticket, self.workshop, self.products, self.act,
                           self.tariffs, self.special,
                           self.promotions if promos is None else promos,
                           {"1435400": "20"} if kms is None else kms, tarifa_km)

    def test_commercial_promotion_replaces_standard(self):
        row = self.calculate()
        self.assertEqual(row["clasificacion"], "CS_Com")
        self.assertEqual(row["precio_origen"], "PROMOCIONAL")
        self.assertEqual(row["mano_obra"], "10.00")
        self.assertEqual(row["valor_km"], "4.00")
        self.assertEqual(row["total"], "14.00")
        self.assertEqual(row["errores"], [])

    def test_non_promo_special_normal(self):
        row = self.calculate(promos=[])
        self.assertEqual(row["clasificacion"], "CS_Exp")
        self.assertEqual(row["mano_obra"], "13.00")
        self.assertEqual(row["total"], "17.00")

    def test_zeros_km_allowed(self):
        row = self.calculate(kms={"1435400": "0"})
        self.assertEqual(row["km"], "0.00")
        self.assertEqual(row["valor_km"], "0.00")
        self.assertEqual(row["total"], "10.00")

    def test_different_technicians_can_have_different_km_rates(self):
        first = self.calculate(tarifa_km="0.35")
        second = self.calculate(tarifa_km="0.12")
        self.assertEqual(first["tarifa_km"], "0.35")
        self.assertEqual(second["tarifa_km"], "0.12")
        self.assertEqual(first["valor_km"], "7.00")
        self.assertEqual(second["valor_km"], "2.40")
        self.assertEqual(first["total"], "17.00")
        self.assertEqual(second["total"], "12.40")

    def test_missing_technician_rate_prevents_foraneo_payment(self):
        row = self.calculate(tarifa_km=None)
        self.assertEqual(row["total"], "0.00")
        self.assertTrue(any("tarifa por kilómetro" in text for text in row["errores"]))

    def test_urban_ticket_does_not_require_km_rate(self):
        urban = {**self.ticket, "es_foraneo": False}
        row = self.calculate(ticket=urban, kms={}, tarifa_km=None)
        self.assertEqual(row["total"], "10.00")
        self.assertEqual(row["valor_km"], "0.00")

    def test_missing_km_prevents_payment(self):
        row = self.calculate(kms={})
        self.assertTrue(any("kilometraje" in e for e in row["errores"]))
        self.assertEqual(row["total"], "0.00")

    def test_no_payment_overrides_commercial(self):
        row = self.calculate(ticket={**self.ticket, "asunto": "ENTREGA 1432626"})
        self.assertEqual(row["clasificacion"], "CS_NoPago")
        self.assertEqual(row["mano_obra"], "0.00")
        self.assertEqual(row["valor_km"], "0.00")

    def test_missing_line_or_act_blocks(self):
        row = create_line(self.ticket, self.workshop, {}, self.act, self.tariffs,
                          self.special, self.promotions, {"1435400":"0"}, "0.20")
        self.assertTrue(any("Producto" in e for e in row["errores"]))

    def test_totals_by_sheet(self):
        row = self.calculate()
        result = summarize([row])
        self.assertEqual(result["CS_Com"]["total"], "14.00")
        self.assertEqual(result["CS_Exp"]["tickets"], 0)

    def test_invalid_km(self):
        for bad in ["-1", "nan", "no disponible"]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                km_value(bad)

    def test_one_technician_per_liquidation(self):
        payload = DraftIn(tecnico_codigo="8000000147", periodo="2026-10", kilometros={})
        self.assertEqual(payload.tecnico_codigo, "8000000147")
        self.assertFalse(hasattr(payload, "taller_id"))
        self.assertFalse(hasattr(payload, "tecnicos"))

    def test_tariff_belongs_to_technician(self):
        tariff = MatrixIn(tecnico_codigo="8000000147", linea="blanca", nivel="SL", valor="13.00")
        special = SpecialIn(tecnico_codigo="8000000147", linea="blanca",
                            categoria_resolucion="INSTALACION NIVEL 1", valor="13.00")
        self.assertEqual(tariff.tecnico_codigo, special.tecnico_codigo)
        self.assertFalse(hasattr(tariff, "taller_id"))
        self.assertFalse(hasattr(special, "taller_id"))

    def test_product_codes(self):
        self.assertEqual(product_code(456789.0), "456789")


if __name__ == "__main__":
    unittest.main()
