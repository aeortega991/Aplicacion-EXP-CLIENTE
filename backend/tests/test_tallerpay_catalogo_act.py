"""Pruebas de catálogo ACT y matriz V2 sin MongoDB ni credenciales reales."""
import unittest

from tallerpay.catalogo_act import (
    LEVELS, DEFAULT_LINES, DEFAULT_WEIGHTS, code, slug, money_number,
    create_catalogo_act_router, read_act_sheet, ACT_TEMPLATE_HEADERS,
)


class CatalogoActTest(unittest.TestCase):
    def test_lineas_iniciales(self):
        self.assertEqual([x[0] for x in DEFAULT_LINES], ["blanca", "cafe"])
        self.assertEqual(slug("Línea Pesada"), "pesada")
        self.assertEqual(slug("Nueva Línea Comercial"), "nueva-linea-comercial")

    def test_normalizacion_act(self):
        mapping = {key: level for key, _, level in DEFAULT_WEIGHTS}
        self.assertEqual(mapping, {"SB": "SL", "SL": "SL", "SM": "SM", "SG": "SG", "SE": "SG"})
        self.assertEqual(set(LEVELS), {"SL", "SM", "SG"})

    def test_codigo_excel(self):
        self.assertEqual(code(100245.0), "100245")
        self.assertEqual(code(" aB-123 "), "AB-123")

    def test_valores_monetarios(self):
        self.assertEqual(money_number("35.126"), "35.13")
        self.assertEqual(money_number("0,01"), "0.01")
        for bad in ("", "0", "-1", "NaN", "Infinity"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                money_number(bad)

    def test_router_integrado_fastapi(self):
        from fastapi import FastAPI
        from tallerpay.router import create_tallerpay_router

        async def current_user():
            return {"role": "admin"}

        async def permissions(user):
            return {}

        app = FastAPI()
        app.include_router(create_tallerpay_router(current_user, permissions, db=object()))
        paths = app.openapi()["paths"]
        self.assertIn("/api/tallerpay/catalogo/lineas", paths)
        self.assertIn("/api/tallerpay/catalogo/pesos", paths)
        self.assertIn("/api/tallerpay/act/import", paths)
        self.assertIn("/api/tallerpay/act/template", paths)
        self.assertIn("/api/tallerpay/matriz-tarifaria", paths)
        self.assertIn("put", paths["/api/tallerpay/matriz-tarifaria"])

    def test_importacion_hoja_real_y_plantilla_reducida(self):
        import io
        from openpyxl import Workbook
        w = Workbook()
        first = w.active
        first.title = "Propuesta"
        first.append(["Código", "Peso"])
        first.append(["NO-USAR", "SG"])
        act = w.create_sheet("Codificador ACT")
        act.append(["Producto", "Categoria de objeto ", "Categoria de Causa", "Codigo Causa",
                    "Codigo resolucion  ", "CATEGORIA DE RESOLUCION ", "PESO", "EQUIVALENCIA ",
                    "Minutos x atención", "Horas x atención"])
        act.append(["GENERAL", "Z INSTALACION", "SG04AE", "Z INSTALACION NIVEL 1",
                    "SG04AEAD02", "INSTALACION NIVEL 1", "SL", 1, 55, 0.92])
        act.append(["GENERAL", "Z VENTA GARANTIA", "SG12AB", "Z VENTA GARANTIA",
                    "SG12ABAB12", "Venta Protección Extendida", 0, 0, None, None])
        buf = io.BytesIO()
        w.save(buf)
        name, rows = read_act_sheet(buf.getvalue())
        self.assertEqual(name, "Codificador ACT")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0][1], {"producto": "GENERAL", "codigo": "SG04AEAD02",
                                      "descripcion": "INSTALACION NIVEL 1", "peso": "SL"})
        self.assertEqual(rows[1][1]["peso"], 0)
        self.assertEqual(len(ACT_TEMPLATE_HEADERS), 4)
        simple = Workbook()
        sheet = simple.active
        sheet.append(ACT_TEMPLATE_HEADERS)
        sheet.append(["GENERAL", "SG04AEAD02", "INSTALACION NIVEL 1", "SL"])
        b = io.BytesIO()
        simple.save(b)
        _, simplified = read_act_sheet(b.getvalue())
        self.assertEqual(simplified[0][1]["codigo"], "SG04AEAD02")

    def test_endpoints_esperados(self):
        async def user():
            return {"role": "admin"}
        async def perms(user):
            return {}
        router, startup = create_catalogo_act_router(object(), user, perms)
        registered = {(method, route.path) for route in router.routes for method in route.methods}
        for item in (
            ("GET", "/catalogo/lineas"), ("POST", "/catalogo/lineas"),
            ("GET", "/catalogo/pesos"), ("POST", "/catalogo/pesos"),
            ("GET", "/act"), ("POST", "/act/import"),
            ("GET", "/act/resolver/{codigo}"),
            ("GET", "/matriz-tarifaria"), ("PUT", "/matriz-tarifaria"),
            ("GET", "/matriz-tarifaria/legado"), ("POST", "/matriz-tarifaria/migrar"),
        ):
            with self.subTest(item=item):
                self.assertIn(item, registered)
        self.assertTrue(callable(startup))


if __name__ == "__main__":
    unittest.main()
