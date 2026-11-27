"""Pruebas del Historial de pagos: filtros, importes, rutas y permisos."""
import unittest

from fastapi import HTTPException, FastAPI
from tallerpay.historial import build_filter, totals_for, approval_state, create_historial_router


class HistoryTests(unittest.TestCase):
    def test_sum_totals_without_claiming_payment(self):
        doc = {"totales": {
            "CS_Exp": {"total": "120.25", "tickets": 3},
            "CS_Com": {"total": "10.00", "tickets": 1},
            "CS_NoPago": {"total": "0.00", "tickets": 2},
            "PENDIENTE": {"total": "0.00", "tickets": 0},
        }}
        self.assertEqual(totals_for(doc), {"importe": "130.25", "tickets": 6})
        self.assertEqual(totals_for({}), {"importe": "0", "tickets": 0})

    def test_approval_defaults_and_filters(self):
        self.assertEqual(approval_state({}), "EN_ESPERA")
        self.assertEqual(approval_state({"estado_aprobacion": "APROBADO"}), "APROBADO")
        self.assertEqual(build_filter(aprobacion="APROBADO")["$or"],
                         [{"estado_aprobacion": "APROBADO"}])
        waiting = build_filter(aprobacion="EN_ESPERA", tecnico="TEC")
        self.assertIn("$and", waiting)
        self.assertEqual(len(waiting["$and"]), 2)
        self.assertEqual(len(waiting["$and"][0]["$or"]), 3)
        with self.assertRaises(HTTPException):
            build_filter(aprobacion="PAGADO")

    def test_filters(self):
        self.assertEqual(build_filter(), {})
        self.assertEqual(build_filter(periodo="2026-10", estado="CERRADO"),
                         {"periodo": "2026-10", "estado": "CERRADO"})
        query = build_filter(tecnico="LOPEZ.*")
        self.assertEqual(query["$or"][0]["tecnico_codigo"]["$regex"], r"LOPEZ\\.\\*")
        for val in ("2026-00", "2026-13", "octubre"):
            with self.assertRaises(HTTPException):
                build_filter(periodo=val)
        with self.assertRaises(HTTPException):
            build_filter(estado="PAGADO")

    def test_read_routes_and_approval_route_exist(self):
        async def user(): return {"role": "admin"}
        async def perms(u): return {}
        router = create_historial_router(object(), user, perms)
        routes = {(method, route.path) for route in router.routes for method in route.methods}
        self.assertIn(("GET", "/historial/liquidaciones"), routes)
        self.assertIn(("GET", "/historial/liquidaciones/{sid}"), routes)
        self.assertIn(("GET", "/historial/liquidaciones/{sid}/excel"), routes)
        self.assertIn(("PUT", "/historial/liquidaciones/{sid}/aprobacion"), routes)
        self.assertEqual([method for method, _ in routes if method != "GET"], ["PUT"])
        from tallerpay.router import create_tallerpay_router
        app = FastAPI()
        app.include_router(create_tallerpay_router(user, perms, db=object()))
        self.assertIn("/api/tallerpay/historial/liquidaciones", app.openapi()["paths"])


if __name__ == "__main__":
    unittest.main()
