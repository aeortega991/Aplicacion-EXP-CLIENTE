"""Viajes (salida/retorno) sobre la colección `rutas` y catálogo `service_routes` (Rutas de servicio)."""
import re
import uuid
from datetime import datetime, timezone, timedelta
from io import BytesIO
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

EN_CURSO, FINALIZADO = "En curso", "Finalizado"
DONE_TRIPS = {"Estado Viaje": {"$ne": EN_CURSO}}
PROTECTED_TRIP_KEYS = {"Codigo Viaje", "Estado Viaje", "Ruta", "Ruta ID", "Ciudad", "Conductor ID", "_created_by",
                       "_created_by_id", "_created_by_name", "_created_at", "_finalized_at", "_finalized_by"}
RET_NUM = ["Kms Final (Odómetro)", "Precio x Galón ($/gal)", "Total Combustible ($)", "Gasto peajes ($)", "Otros Gastos ($)"]
RET_TXT = ["Fecha de Llegada", "Estación de Combustible", "Tipo de Combustible", "Observaciones"]
COMBUSTIBLES = ["Diesel", "Gasolina Extra", "Gasolina Super", "Ecopaís"]
LOCAL_TZ = timezone(timedelta(hours=-5))
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _norm(s) -> str:
    return str(s or "").strip().upper()


def _clean_text(s) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _date(v, label: str) -> str:
    s = str(v or "").strip()[:10]
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{label} es obligatoria (AAAA-MM-DD)")
    return s


def _number(v, label: str, required: bool = False) -> Optional[float]:
    if v is None or str(v).strip() == "":
        if required:
            raise HTTPException(status_code=400, detail=f"{label} es obligatorio")
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{label} debe ser numérico")
    return int(n) if n.is_integer() else n


class RutaIn(BaseModel):
    ruta: str
    ciudad: str
    estado: str = "Activo"


class SalidaIn(BaseModel):
    fecha_salida: str
    placa: str
    conductor_id: str
    km_salida: Any = None
    ruta_id: str


class RetornoIn(BaseModel):
    data: Dict[str, Any]


def create_trips_router(db, get_current_user, effective_perms, require_edit, resolve_cities, filter_by_cities):
    r = APIRouter(prefix="/api")

    async def _can(user: dict, key: str, action: str = "view") -> bool:
        if user.get("role") == "admin":
            return True
        return bool((await effective_perms(user)).get(key, {}).get(action))

    async def _require_any(user: dict, key: str):
        if not (await _can(user, key) or await _can(user, key, "edit")):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta sección")

    # ---------------- Rutas de servicio ----------------
    async def _valid_city(ciudad) -> str:
        c = _norm(ciudad)
        if not c or not await db.cities.find_one({"nombre": c}):
            raise HTTPException(status_code=400, detail=f"La ciudad {c or '(vacía)'} no existe en el catálogo de ciudades")
        return c

    async def _insert_route(ruta: str, ciudad: str, estado: str, user: dict) -> dict:
        for _ in range(5):
            last = await db.service_routes.find_one({}, {"seq": 1}, sort=[("seq", -1)])
            seq = (last or {}).get("seq", 0) + 1
            doc = {"id": str(uuid.uuid4()), "seq": seq, "codigo": f"RS-{seq:04d}", "ruta": ruta, "ruta_norm": _norm(ruta),
                   "ciudad": ciudad, "estado": estado, "created_at": _now(), "created_by": user.get("username")}
            try:
                await db.service_routes.insert_one(doc)
                doc.pop("_id", None)
                return doc
            except DuplicateKeyError as e:
                if "ruta_norm" in str(e):
                    raise HTTPException(status_code=400, detail=f"La ruta {ruta} ya existe en {ciudad}")
        raise HTTPException(status_code=500, detail="No se pudo generar el ID de la ruta")

    async def _clean_route(payload: RutaIn, rid: Optional[str] = None):
        ruta = _clean_text(payload.ruta)
        if not ruta:
            raise HTTPException(status_code=400, detail="La ruta es obligatoria")
        ciudad = await _valid_city(payload.ciudad)
        if payload.estado not in ("Activo", "Inactivo"):
            raise HTTPException(status_code=400, detail="Estado inválido")
        if await db.service_routes.find_one({"ruta_norm": _norm(ruta), "ciudad": ciudad, "id": {"$ne": rid}}):
            raise HTTPException(status_code=400, detail=f"La ruta {ruta} ya existe en {ciudad}")
        return ruta, ciudad

    @r.get("/service-routes")
    async def list_routes(ciudad: Optional[str] = None, estado: Optional[str] = None, user: dict = Depends(get_current_user)):
        await _require_any(user, "veh_rutas_servicio")
        q: dict = {}
        if ciudad:
            q["ciudad"] = _norm(ciudad)
        if estado:
            q["estado"] = estado
        return await db.service_routes.find(q, {"_id": 0}).sort([("ciudad", 1), ("ruta_norm", 1)]).to_list(10000)

    @r.post("/service-routes")
    async def create_route(payload: RutaIn, user: dict = Depends(get_current_user)):
        await require_edit("veh_rutas_servicio", user)
        ruta, ciudad = await _clean_route(payload)
        return await _insert_route(ruta, ciudad, payload.estado, user)

    @r.put("/service-routes/{rid}")
    async def update_route(rid: str, payload: RutaIn, user: dict = Depends(get_current_user)):
        await require_edit("veh_rutas_servicio", user)
        if not await db.service_routes.find_one({"id": rid}):
            raise HTTPException(status_code=404, detail="Ruta no encontrada")
        ruta, ciudad = await _clean_route(payload, rid)
        await db.service_routes.update_one({"id": rid}, {"$set": {
            "ruta": ruta, "ruta_norm": _norm(ruta), "ciudad": ciudad, "estado": payload.estado,
            "updated_at": _now(), "updated_by": user.get("username")}})
        return await db.service_routes.find_one({"id": rid}, {"_id": 0})

    @r.get("/service-routes/template")
    async def routes_template(user: dict = Depends(get_current_user)):
        await require_edit("veh_rutas_servicio", user)
        import openpyxl
        from openpyxl.styles import Font, PatternFill
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Rutas"
        ws.append(["Ruta", "Ciudad"])
        ws.append(["Centro - Norte", "QUITO"])
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="0033A0")
        ws.column_dimensions["A"].width = 40
        ws.column_dimensions["B"].width = 24
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        return StreamingResponse(buf, media_type=XLSX, headers={"Content-Disposition": 'attachment; filename="plantilla_rutas_servicio.xlsx"'})

    @r.post("/service-routes/import")
    async def import_routes(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        await require_edit("veh_rutas_servicio", user)
        import openpyxl
        try:
            wb = openpyxl.load_workbook(BytesIO(await file.read()), data_only=True)
        except Exception:
            raise HTTPException(status_code=400, detail="Archivo Excel inválido (.xlsx)")
        rows = list(wb.active.iter_rows(values_only=True))
        if not rows:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
        headers = [_norm(h) for h in rows[0]]
        if "RUTA" not in headers or "CIUDAD" not in headers:
            raise HTTPException(status_code=400, detail="La plantilla debe tener las columnas Ruta y Ciudad")
        i_ruta, i_ciudad = headers.index("RUTA"), headers.index("CIUDAD")
        cities = set(await db.cities.distinct("nombre"))
        inserted, duplicates, errors, total = 0, 0, [], 0
        for idx, row in enumerate(rows[1:], start=2):
            if row is None or all(c is None or str(c).strip() == "" for c in row):
                continue
            total += 1
            ruta = _clean_text(row[i_ruta] if i_ruta < len(row) else "")
            ciudad = _norm(row[i_ciudad] if i_ciudad < len(row) else "")
            if not ruta or not ciudad:
                errors.append(f"Fila {idx}: Ruta y Ciudad son obligatorias")
                continue
            if ciudad not in cities:
                errors.append(f"Fila {idx}: la ciudad {ciudad} no existe en el catálogo")
                continue
            if await db.service_routes.find_one({"ruta_norm": _norm(ruta), "ciudad": ciudad}):
                duplicates += 1
                errors.append(f"Fila {idx}: duplicada ({ruta} · {ciudad})")
                continue
            try:
                await _insert_route(ruta, ciudad, "Activo", user)
                inserted += 1
            except HTTPException as e:
                errors.append(f"Fila {idx}: {e.detail}")
        return {"inserted": inserted, "duplicates": duplicates, "errors": errors, "total_filas": total}

    @r.get("/service-routes/for-conductor")
    async def routes_for_conductor(conductor_id: str, user: dict = Depends(get_current_user)):
        await _require_any(user, "veh_rutas")
        cond = await db.users.find_one({"id": conductor_id, "role": "tecnico"}, {"_id": 0, "name": 1, "ciudad": 1})
        if not cond:
            raise HTTPException(status_code=404, detail="Conductor no encontrado")
        ciudad = _norm(cond.get("ciudad"))
        routes = await db.service_routes.find({"ciudad": ciudad, "estado": "Activo"}, {"_id": 0}).sort("ruta_norm", 1).to_list(2000) if ciudad else []
        message = None
        if not ciudad:
            message = f"{cond.get('name')} no tiene ciudad asociada. Asígnale una ciudad en Usuarios para poder registrar el viaje."
        elif not routes:
            message = f"No hay rutas activas para {ciudad}. Regístralas en Rutas de servicio para poder registrar el viaje."
        return {"ciudad": ciudad or None, "routes": routes, "message": message}

    # ---------------- Viajes ----------------
    async def _next_code() -> str:
        prefix = f"VJ-{datetime.now(LOCAL_TZ).year}-"
        last = await db.rutas.find_one({"Codigo Viaje": {"$regex": f"^{prefix}"}}, {"Codigo Viaje": 1}, sort=[("Codigo Viaje", -1)])
        seq = int(last["Codigo Viaje"][-6:]) + 1 if last else 1
        return f"{prefix}{seq:06d}"

    @r.post("/viajes/salida")
    async def register_departure(payload: SalidaIn, user: dict = Depends(get_current_user)):
        await require_edit("veh_rutas", user)
        fecha = _date(payload.fecha_salida, "La fecha de salida")
        placa = str(payload.placa or "").strip()
        if not placa:
            raise HTTPException(status_code=400, detail="El vehículo es obligatorio")
        veh = await db.flota.find_one({"Placa Vehiculo": placa}, {"_id": 0, "Status": 1})
        if not veh:
            raise HTTPException(status_code=400, detail="Vehículo no encontrado")
        if str(veh.get("Status") or "").strip().lower() != "activo":
            raise HTTPException(status_code=400, detail="El vehículo no está activo")
        km = _number(payload.km_salida, "KM salida", required=True)
        if km < 0:
            raise HTTPException(status_code=400, detail="KM salida no puede ser negativo")
        cond = await db.users.find_one({"id": payload.conductor_id, "role": "tecnico"}, {"_id": 0, "id": 1, "name": 1, "ciudad": 1})
        if not cond:
            raise HTTPException(status_code=400, detail="El conductor (técnico) es obligatorio")
        ciudad = _norm(cond.get("ciudad"))
        if not ciudad:
            raise HTTPException(status_code=400, detail=f"{cond.get('name')} no tiene ciudad asociada")
        route = await db.service_routes.find_one({"id": payload.ruta_id}, {"_id": 0})
        if not route or route.get("estado") != "Activo" or route.get("ciudad") != ciudad:
            raise HTTPException(status_code=400, detail=f"La ruta debe ser una ruta activa de {ciudad}, la ciudad del conductor")
        doc = {
            "id": str(uuid.uuid4()), "Fecha de Salida": fecha, "Placa Vehiculo": placa,
            "Conductor": cond.get("name"), "Conductor ID": cond["id"], "Kms Inicial (Odómetro)": km,
            "Ruta": route["ruta"], "Ruta ID": route["id"], "Ciudad": ciudad, "Estado Viaje": EN_CURSO,
            "_created_by": user.get("username"), "_created_by_id": user["id"], "_created_by_name": user.get("name"),
            "_created_at": _now(),
        }
        for _ in range(5):
            doc["Codigo Viaje"] = await _next_code()
            try:
                await db.rutas.insert_one(doc)
                break
            except DuplicateKeyError:
                doc.pop("_id", None)
        else:
            raise HTTPException(status_code=500, detail="No se pudo generar el código del viaje")
        doc.pop("_id", None)
        return doc

    @r.get("/viajes")
    async def list_trips(user: dict = Depends(get_current_user)):
        await _require_any(user, "veh_rutas")
        if not await _can(user, "veh_rutas"):
            return await db.rutas.find({"_created_by_id": user["id"]}, {"_id": 0}).sort("_created_at", -1).to_list(5000)
        docs = await db.rutas.find({}, {"_id": 0}).to_list(50000)
        docs = await filter_by_cities("rutas", docs, await resolve_cities("rutas", user, None))
        docs.sort(key=lambda d: (str(d.get("Fecha de Salida") or ""), str(d.get("_created_at") or "")), reverse=True)
        return docs

    @r.get("/viajes/pendientes")
    async def pending_trips(user: dict = Depends(get_current_user)):
        await require_edit("veh_rutas", user)
        q = {"_created_by_id": user["id"], "Estado Viaje": EN_CURSO, "_finalized_at": {"$exists": False}}
        return await db.rutas.find(q, {"_id": 0}).sort("_created_at", -1).to_list(2000)

    @r.put("/viajes/{tid}/retorno")
    async def register_return(tid: str, payload: RetornoIn, user: dict = Depends(get_current_user)):
        await require_edit("veh_rutas", user)
        trip = await db.rutas.find_one({"id": tid, "_created_by_id": user["id"]}, {"_id": 0})
        if not trip:
            raise HTTPException(status_code=404, detail="Viaje no encontrado o registrado por otro usuario")
        if trip.get("Estado Viaje") != EN_CURSO or trip.get("_finalized_at"):
            raise HTTPException(status_code=409, detail="Este viaje ya tiene un retorno registrado")
        d = payload.data or {}
        llegada = _date(d.get("Fecha de Llegada"), "La fecha de llegada")
        if llegada < str(trip.get("Fecha de Salida"))[:10]:
            raise HTTPException(status_code=400, detail="La fecha de llegada no puede ser anterior a la fecha de salida")
        nums = {k: _number(d.get(k), k, required=(k == "Kms Final (Odómetro)")) for k in RET_NUM}
        km_ini = float(trip.get("Kms Inicial (Odómetro)") or 0)
        if nums["Kms Final (Odómetro)"] < km_ini:
            raise HTTPException(status_code=400, detail="El KM de regreso debe ser mayor o igual al KM de salida")
        tipo = str(d.get("Tipo de Combustible") or "").strip()
        if tipo and tipo not in COMBUSTIBLES:
            raise HTTPException(status_code=400, detail="Tipo de combustible inválido")
        km = max(nums["Kms Final (Odómetro)"] - km_ini, 0)
        precio, total = nums["Precio x Galón ($/gal)"] or 0, nums["Total Combustible ($)"] or 0
        gal = total / precio if precio > 0 else 0
        upd = {k: v for k, v in nums.items() if v is not None}
        upd.update({k: str(d.get(k)).strip() for k in RET_TXT if d.get(k) not in (None, "")})
        upd.update({
            "Fecha de Llegada": llegada, "Kms Recorridos": int(km) if float(km).is_integer() else round(km, 2),
            "Volumen de Combustible (gal)": round(gal, 2),
            "Recorrido por und. de comb. (Km/gal)": round(km / gal, 2) if gal > 0 else 0,
            "Gasto Total ($)": round(total + (nums["Gasto peajes ($)"] or 0) + (nums["Otros Gastos ($)"] or 0), 2),
            "Estado Viaje": FINALIZADO, "_finalized_at": _now(), "_finalized_by": user.get("username"),
        })
        # replace_one: algunas claves contienen "." y $set las interpretaría como rutas anidadas
        res = await db.rutas.replace_one(
            {"id": tid, "_created_by_id": user["id"], "Estado Viaje": EN_CURSO, "_finalized_at": {"$exists": False}},
            {**trip, **upd})
        if res.matched_count == 0:
            raise HTTPException(status_code=409, detail="Este viaje ya tiene un retorno registrado")
        return await db.rutas.find_one({"id": tid}, {"_id": 0})

    async def trips_startup():
        await db.service_routes.create_index("id", unique=True)
        await db.service_routes.create_index("seq", unique=True)
        await db.service_routes.create_index([("ruta_norm", 1), ("ciudad", 1)], unique=True, name="ruta_norm_ciudad")
        await db.service_routes.create_index([("ciudad", 1), ("estado", 1)])
        await db.rutas.create_index("Codigo Viaje", unique=True, name="codigo_viaje_unique",
                                    partialFilterExpression={"Codigo Viaje": {"$exists": True}})
        await db.rutas.create_index([("_created_by_id", 1), ("Estado Viaje", 1)])
        # Registros históricos (flujo anterior: salida y regreso juntos) quedan como Finalizado
        await db.rutas.update_many({"Estado Viaje": {"$exists": False}}, {"$set": {"Estado Viaje": FINALIZADO}})

    return r, trips_startup
