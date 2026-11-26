"""Pruebas de catálogo ACT y matriz V2 sin MongoDB ni credenciales reales."""
import unittest

from tallerpay.catalogo_act import (
    LEVELS, DEFAULT_LINES, DEFAULT_WEIGHTS, code, slug, money_number,
    create_catalogo_act_router,
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
