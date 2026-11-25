"""Catálogo único de regiones y ciudades usado por toda la aplicación."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

ANALISTA = "analista_tecnico"


def _norm(s) -> str:
    v = str(s or "").strip().upper()
    return "" if v == "NONE" else v


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def city_region(db, ciudad) -> Optional[dict]:
    c = _norm(ciudad)
    if not c:
        return None
    city = await db.cities.find_one({"nombre": c}, {"_id": 0})
    if not city or not city.get("region_id"):
        return None
    return await db.regions.find_one({"id": city["region_id"]}, {"_id": 0})


async def region_of_city(db, ciudad) -> Optional[str]:
    reg = await city_region(db, ciudad)
    return reg["nombre"] if reg else None


async def catalog_lists(db):
    regions = await db.regions.find({}, {"_id": 0}).sort("nombre", 1).to_list(500)
    cities = await db.cities.find({}, {"_id": 0}).sort("nombre", 1).to_list(5000)
    rmap = {g["id"]: g["nombre"] for g in regions}
    for c in cities:
        c["region"] = rmap.get(c.get("region_id"))
    return regions, cities


async def validate_location(db, ciudad, region, role=None, user_id=None):
    """Valida ciudad/región contra el catálogo y deriva la región desde la ciudad."""
    c, r = _norm(ciudad) or None, _norm(region) or None
    if c and not await db.cities.find_one({"nombre": c}):
        raise HTTPException(status_code=400, detail=f"La ciudad {c} no existe. Créala en el menú Ciudades")
    if r and not await db.regions.find_one({"nombre": r}):
        raise HTTPException(status_code=400, detail=f"La región {r} no existe. Créala en el menú Ciudades")
    if not r and c:
        r = await region_of_city(db, c)
    if role == ANALISTA:
        if not r:
            raise HTTPException(status_code=400, detail="El analista técnico debe tener una región asignada")
        q = {"role": ANALISTA, "region": r}
        if user_id:
            q["id"] = {"$ne": user_id}
        other = await db.users.find_one(q, {"_id": 0, "name": 1})
        if other:
            raise HTTPException(status_code=400, detail=f"La región {r} ya tiene como analista a {other['name']}")
    return c, r


class RegionIn(BaseModel):
    nombre: str


class CityIn(BaseModel):
    nombre: str
    region_id: Optional[str] = None


class MergeIn(BaseModel):
    target_id: str


MERGE_TARGETS = (("users", "ciudad"), ("flota", "Ubicacion"), ("impuestos", "Ciudad"),
                 ("tool_warehouses", "ciudad"), ("tool_technicians", "ciudad"), ("service_routes", "ciudad"))


def create_catalog_router(db, get_current_user, require_admin):
    r = APIRouter(prefix="/api/catalog")

    async def _usage_city(nombre: str) -> str:
        users = await db.users.count_documents({"ciudad": nombre})
        vehs = await db.flota.count_documents({"Ubicacion": nombre})
        parts = [f"{users} usuario(s)" if users else "", f"{vehs} vehículo(s)" if vehs else ""]
        return " y ".join(p for p in parts if p)

    @r.get("")
    async def get_catalog(user: dict = Depends(get_current_user)):
        regions, cities = await catalog_lists(db)
        if user.get("role") == "admin":
            per_city, per_region, analysts = {}, {}, {}
            async for u in db.users.find({}, {"_id": 0, "ciudad": 1, "region": 1, "role": 1, "name": 1}):
                per_city[u.get("ciudad")] = per_city.get(u.get("ciudad"), 0) + 1
                per_region[u.get("region")] = per_region.get(u.get("region"), 0) + 1
                if u.get("role") == ANALISTA and u.get("region"):
                    analysts[u["region"]] = u.get("name")
            for c in cities:
                c["usuarios"] = per_city.get(c["nombre"], 0)
            for g in regions:
                g["usuarios"] = per_region.get(g["nombre"], 0)
                g["ciudades"] = sum(1 for c in cities if c.get("region_id") == g["id"])
                g["analista"] = analysts.get(g["nombre"])
        return {"regions": regions, "cities": cities}

    @r.post("/regions")
    async def create_region(payload: RegionIn, user: dict = Depends(require_admin)):
        nombre = _norm(payload.nombre)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre de la región es obligatorio")
        if await db.regions.find_one({"nombre": nombre}):
            raise HTTPException(status_code=400, detail="Ya existe una región con ese nombre")
        doc = {"id": str(uuid.uuid4()), "nombre": nombre, "created_at": _now()}
        await db.regions.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @r.put("/regions/{rid}")
    async def update_region(rid: str, payload: RegionIn, user: dict = Depends(require_admin)):
        reg = await db.regions.find_one({"id": rid}, {"_id": 0})
        if not reg:
            raise HTTPException(status_code=404, detail="Región no encontrada")
        nombre = _norm(payload.nombre)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre de la región es obligatorio")
        if nombre != reg["nombre"]:
            if await db.regions.find_one({"nombre": nombre}):
                raise HTTPException(status_code=400, detail="Ya existe una región con ese nombre")
            n = await db.users.count_documents({"region": reg["nombre"]})
            if n:
                raise HTTPException(status_code=400, detail=f"No se puede renombrar: la región está asignada a {n} usuario(s)")
            await db.regions.update_one({"id": rid}, {"$set": {"nombre": nombre, "updated_at": _now()}})
        return await db.regions.find_one({"id": rid}, {"_id": 0})

    @r.delete("/regions/{rid}")
    async def delete_region(rid: str, user: dict = Depends(require_admin)):
        reg = await db.regions.find_one({"id": rid}, {"_id": 0})
        if not reg:
            raise HTTPException(status_code=404, detail="Región no encontrada")
        nc = await db.cities.count_documents({"region_id": rid})
        nu = await db.users.count_documents({"region": reg["nombre"]})
        if nc or nu:
            raise HTTPException(status_code=400, detail=f"No se puede eliminar: tiene {nc} ciudad(es) y {nu} usuario(s) asignados")
        await db.regions.delete_one({"id": rid})
        return {"ok": True}

    async def _check_region(region_id: Optional[str]):
        if region_id and not await db.regions.find_one({"id": region_id}):
            raise HTTPException(status_code=400, detail="Región no encontrada")

    @r.post("/cities")
    async def create_city(payload: CityIn, user: dict = Depends(require_admin)):
        nombre = _norm(payload.nombre)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre de la ciudad es obligatorio")
        if await db.cities.find_one({"nombre": nombre}):
            raise HTTPException(status_code=400, detail="Ya existe una ciudad con ese nombre")
        await _check_region(payload.region_id)
        doc = {"id": str(uuid.uuid4()), "nombre": nombre, "region_id": payload.region_id or None, "created_at": _now()}
        await db.cities.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @r.put("/cities/{cid}")
    async def update_city(cid: str, payload: CityIn, user: dict = Depends(require_admin)):
        city = await db.cities.find_one({"id": cid}, {"_id": 0})
        if not city:
            raise HTTPException(status_code=404, detail="Ciudad no encontrada")
        nombre = _norm(payload.nombre)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre de la ciudad es obligatorio")
        if nombre != city["nombre"]:
            if await db.cities.find_one({"nombre": nombre}):
                raise HTTPException(status_code=400, detail="Ya existe una ciudad con ese nombre")
            usage = await _usage_city(city["nombre"])
            if usage:
                raise HTTPException(status_code=400, detail=f"No se puede renombrar: la ciudad está en uso por {usage}")
        await _check_region(payload.region_id)
        await db.cities.update_one({"id": cid}, {"$set": {"nombre": nombre, "region_id": payload.region_id or None, "updated_at": _now()}})
        return await db.cities.find_one({"id": cid}, {"_id": 0})

    @r.post("/cities/{cid}/merge")
    async def merge_city(cid: str, payload: MergeIn, user: dict = Depends(require_admin)):
        src = await db.cities.find_one({"id": cid}, {"_id": 0})
        dst = await db.cities.find_one({"id": payload.target_id}, {"_id": 0})
        if not src or not dst:
            raise HTTPException(status_code=404, detail="Ciudad no encontrada")
        if src["id"] == dst["id"]:
            raise HTTPException(status_code=400, detail="Elige una ciudad distinta")
        src_routes = await db.service_routes.distinct("ruta_norm", {"ciudad": src["nombre"]})
        if src_routes and await db.service_routes.find_one({"ciudad": dst["nombre"], "ruta_norm": {"$in": src_routes}}):
            raise HTTPException(status_code=400, detail="Ambas ciudades tienen rutas de servicio con el mismo nombre; ajústalas antes de unir")
        moved = {}
        for col, field in MERGE_TARGETS:
            res = await db[col].update_many({field: src["nombre"]}, {"$set": {field: dst["nombre"]}})
            if res.modified_count:
                moved[col] = res.modified_count
        await db.cities.delete_one({"id": cid})
        return {"ok": True, "from": src["nombre"], "to": dst["nombre"], "moved": moved}

    @r.delete("/cities/{cid}")
    async def delete_city(cid: str, user: dict = Depends(require_admin)):
        city = await db.cities.find_one({"id": cid}, {"_id": 0})
        if not city:
            raise HTTPException(status_code=404, detail="Ciudad no encontrada")
        usage = await _usage_city(city["nombre"])
        if usage:
            raise HTTPException(status_code=400, detail=f"No se puede eliminar: la ciudad está en uso por {usage}")
        await db.cities.delete_one({"id": cid})
        return {"ok": True}

    async def catalog_startup(default_regions: dict):
        await db.regions.create_index("id", unique=True)
        await db.regions.create_index("nombre", unique=True)
        await db.cities.create_index("id", unique=True)
        await db.cities.create_index("nombre", unique=True)
        await db.cities.create_index("region_id")
        if await db.regions.count_documents({}) or await db.cities.count_documents({}):
            return
        # Migración inicial: regiones/ciudades existentes + ciudades ya usadas en los datos
        mapping = {}
        legacy = await db.ts_regions.find({}, {"_id": 0}).to_list(500)
        source = {g["nombre"]: g.get("ciudades", []) for g in legacy} if legacy else default_regions
        for name, cities in source.items():
            mapping.setdefault(_norm(name), set()).update(_norm(c) for c in cities if _norm(c))
        for reg in await db.users.distinct("region"):
            if _norm(reg):
                mapping.setdefault(_norm(reg), set())
        assigned = {c: reg for reg, cs in mapping.items() for c in cs}
        found = set(assigned)
        for col, field in (("users", "ciudad"), ("flota", "Ubicacion"), ("tool_warehouses", "ciudad"),
                           ("tool_technicians", "ciudad"), ("expenses", "ciudad")):
            found.update(_norm(v) for v in await db[col].distinct(field) if _norm(v))
        reg_ids = {}
        for name in sorted(mapping):
            reg_ids[name] = str(uuid.uuid4())
            await db.regions.insert_one({"id": reg_ids[name], "nombre": name, "created_at": _now()})
        for c in sorted(found):
            await db.cities.insert_one({"id": str(uuid.uuid4()), "nombre": c,
                                        "region_id": reg_ids.get(assigned.get(c)), "created_at": _now()})

    return r, catalog_startup
