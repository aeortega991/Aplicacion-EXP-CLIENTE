"""Pruebas unitarias de seguridad para la navegación inicial de TallerPay."""
import asyncio
import unittest

from fastapi import HTTPException
from tallerpay.router import create_tallerpay_router


class TallerpayAccessTest(unittest.TestCase):
    def test_allowed_roles_are_only_expected_three(self):
        from tallerpay.router import ALLOWED_ROLES
        self.assertEqual(ALLOWED_ROLES, {"lider", "coordinador", "admin"})

    def test_router_without_db_registers_only_read_endpoints(self):
        async def current_user():
            return {"role": "admin"}
        async def permissions(user):
            return {}
        router = create_tallerpay_router(current_user, permissions)
        methods = {method for route in router.routes for method in route.methods}
        self.assertEqual(methods, {"GET"})
        self.assertIn("/api/tallerpay/status", {route.path for route in router.routes})

    def test_router_with_db_registers_phase_a_endpoints(self):
        async def current_user():
            return {"role": "admin"}
        async def permissions(user):
            return {}
        router = create_tallerpay_router(current_user, permissions, db=object())
        paths = {route.path for route in router.routes if hasattr(route, "path")}
        for p in ("/api/tallerpay/talleres", "/api/tallerpay/tarifarios", "/api/tallerpay/talleres/{wid}/archivos"):
            self.assertIn(p, paths)
        self.assertIsNotNone(router.startup)


if __name__ == "__main__":
    unittest.main()
