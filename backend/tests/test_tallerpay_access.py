"""Pruebas unitarias de seguridad para la navegación inicial de TallerPay."""
import asyncio
import unittest

from fastapi import HTTPException
from tallerpay.router import create_tallerpay_router


class TallerpayAccessTest(unittest.TestCase):
    def test_allowed_roles_are_only_expected_three(self):
        from tallerpay.router import ALLOWED_ROLES
        self.assertEqual(ALLOWED_ROLES, {"lider", "coordinador", "admin"})

    def test_router_registers_only_read_endpoints(self):
        async def current_user():
            return {"role": "admin"}
        async def permissions(user):
            return {}
        router = create_tallerpay_router(current_user, permissions)
        methods = {method for route in router.routes for method in route.methods}
        self.assertEqual(methods, {"GET"})
        self.assertIn("/api/tallerpay/status", {route.path for route in router.routes})


if __name__ == "__main__":
    unittest.main()
