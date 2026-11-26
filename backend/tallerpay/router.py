"""Router inicial del módulo Pago a talleres; no procesa pagos todavía."""
from fastapi import APIRouter, Depends, HTTPException

ALLOWED_ROLES = frozenset({"lider", "coordinador", "admin"})
SECTIONS = {
    "dashboard": "tp_dashboard",
    "talleres": "tp_talleres",
    "tarifarios": "tp_tarifarios",
    "codificador": "tp_codificador",
    "promociones": "tp_promociones",
    "importacion": "tp_importacion",
    "liquidaciones": "tp_liquidaciones",
    "historial": "tp_historial",
}


def create_tallerpay_router(get_current_user, effective_perms):
    """Expone solo la estructura inicial y aplica permisos de consulta en el servidor."""
    router = APIRouter(prefix="/api/tallerpay", tags=["Pago a talleres"])

    async def require_access(resource: str, user: dict):
        if user.get("role") not in ALLOWED_ROLES:
            raise HTTPException(status_code=403, detail="No autorizado para Pago a talleres")
        if user.get("role") != "admin":
            perms = await effective_perms(user)
            if not perms.get("tallerpay", {}).get("view") or not perms.get(resource, {}).get("view"):
                raise HTTPException(status_code=403, detail="Sin permiso para esta sección")
        return user

    @router.get("/status")
    async def status(user: dict = Depends(get_current_user)):
        await require_access("tp_dashboard", user)
        return {"module": "Pago a talleres", "phase": 1, "business_operations_enabled": False}

    @router.get("/sections/{section}")
    async def section_status(section: str, user: dict = Depends(get_current_user)):
        resource = SECTIONS.get(section)
        if resource is None:
            raise HTTPException(status_code=404, detail="Sección no encontrada")
        await require_access(resource, user)
        return {"section": section, "ready": False, "message": "Funcionalidad pendiente de implementación"}

    return router
