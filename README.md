# Control de Flota Vehicular y Gestion de Activos

Aplicacion satelite para la gestion de flota vehicular, herramientas/activos y un
flujo de aprobacion de gastos con notificaciones por correo.

> **Aviso de cumplimiento (Directriz unificada Emergent IA v1.0).** Este repositorio
> se desarrolla en un entorno de prototipado. El stack actual NO coincide con el
> catalogo corporativo por defecto y varias obligaciones requieren validacion o
> integracion corporativa que no puede autoaprobarse. Ver
> [`docs/compliance-matrix.md`](docs/compliance-matrix.md) y
> [`docs/project-decisions.md`](docs/project-decisions.md) para el estado real,
> pendientes y excepciones requeridas. **No debe presentarse como una solucion
> corporativa plenamente conforme ni lista para produccion.**

## Negocio, criticidad y responsables

- **Propietario funcional:** por definir (pendiente de validacion — ver project-decisions.md).
- **Criticidad:** NO clasificada formalmente. Debe validarla Arquitectura Empresarial,
  Seguridad de la Informacion y el responsable del proceso (Directriz A.1). Supuesto
  de trabajo provisional: **media** (no autoaprobable).
- **Contacto del equipo:** por definir.

## Stack tecnologico (estado real)

| Capa | Tecnologia actual | Catalogo corporativo | Estado |
|------|-------------------|----------------------|--------|
| Backend | Python 3 + FastAPI | Java LTS o Node.js+TS+NestJS | Fuera de catalogo — excepcion/migracion requerida |
| Frontend | React 19 (CRA/craco) + Tailwind + shadcn/ui | Angular (React con aprobacion) | Aprobacion de Arquitectura requerida |
| Base de datos | MongoDB (Motor async) | Definida por proyecto | En uso |
| Auth | JWT propio (bcrypt) | IAM corporativo OIDC/OAuth 2.0 | No conforme — integracion IAM pendiente |

## Prerrequisitos de desarrollo local

- Node.js LTS + Yarn (frontend)
- Python 3.11+ (backend)
- MongoDB accesible via `MONGO_URL`
- Servicios gestionados por `supervisor` (no iniciar servidores manualmente)

## Configuracion (sin secretos)

Copiar `backend/.env.example` a `backend/.env` y completar. El `.env` esta excluido
por `.gitignore` (Directriz A.9.7 / B.12.1). El frontend usa `REACT_APP_BACKEND_URL`.

## Build / ejecucion / pruebas

```bash
# Backend (gestionado por supervisor)
sudo supervisorctl restart backend

# Frontend
cd frontend && yarn install
sudo supervisorctl restart frontend

# API contract (OpenAPI 3.x autogenerado por FastAPI)
#   GET /openapi.json  |  UI: /docs
```

> **Pruebas automatizadas:** NO implementadas aun (Jest/Vitest/RTL/Playwright/pytest).
> La cobertura minima por criticidad (Directriz A.9.6) es un GATE de CI todavia pendiente.

## Modulos funcionales

- **Vehiculos:** flota, seguros, impuestos, talleres, rutas, multas, mantenimiento,
  alertas, mapa e historial vehicular. Exportacion Excel/PDF.
- **Herramientas/Activos:** inventario, bodegas, asignaciones (a tecnicos y bodegas),
  devoluciones, traspasos, reportes e historial.
- **Gastos:** flujo de aprobacion (coordinador -> presupuesto/tesoreria -> factura ->
  aprobacion final coordinador + gerencia), dashboard con filtros ciudad/fecha,
  exportacion Excel y PDF, notificaciones por correo con enlace seguro al PDF.
- **Usuarios:** gestion centralizada (documento, nombre, email, region, rol, ciudad).
  Roles: admin, coordinador, lider, tesorero, gerente, tecnico, user.

## Enlaces tecnicos

- Decisiones y supuestos: [`docs/project-decisions.md`](docs/project-decisions.md)
- Matriz de cumplimiento: [`docs/compliance-matrix.md`](docs/compliance-matrix.md)
- Contrato OpenAPI: `GET /openapi.json`
- Credenciales de prueba (no productivas): `memory/test_credentials.md`
