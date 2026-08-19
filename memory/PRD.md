# PRD — Control de Flota Vehicular

## Original Problem Statement
Aplicación con pantalla principal y varios módulos para control de flota vehicular basada en un Excel de referencia (`control-de-flota-vehicular.xlsx`) con las hojas Flota, Seguros, Impuestos, Talleres, Conductores, Multas, Mantenimiento; más un módulo dashboard con visualizaciones de gasto total por vehículo y por ciudad, detalle de multas por usuario, y consumo/kilometraje de combustible.

## User Choices
- Autenticación: usuario + contraseña (no email), roles `admin` y `user`
- Datos iniciales: sembrar desde el Excel proporcionado
- Idioma: español latinoamericano · Moneda: USD · Estilo: profesional corporativo

## Architecture
- **Backend**: FastAPI + Motor (MongoDB async) + JWT (PyJWT) + bcrypt
  - Auth con Bearer token en header
  - Colecciones: `users`, `flota`, `seguros`, `impuestos`, `talleres`, `conductores`, `multas`, `mantenimiento`
  - Endpoints: `/api/auth/*`, `/api/users`, `/api/modules/{module}` (CRUD), `/api/dashboard`
- **Frontend**: React 19 + React Router 7 + shadcn/ui + Recharts + Sonner (toasts)
  - Layout con sidebar colapsable, protección de rutas, AuthContext
  - `ModulePage` genérico driven por schema (columnas del Excel)
- **Seed**: al iniciar, importa `seed_data.json` (78 vehículos, 26 seguros, 25 impuestos, 12 talleres, 52 conductores, 20 multas, 18 mnto).

## What's Implemented (Feb 2026)
- Login con dos roles (Feb 2026)
- CRUD 7 módulos con columnas exactas del Excel (Feb 2026)
- Dashboard con KPIs + 4 gráficos (Feb 2026)
- Gestión de usuarios (solo admin) (Feb 2026)
- Autorización basada en rol: usuarios `user` no pueden editar/eliminar
- **Módulo Rutas (Feb 2026)**: 1009 rutas sembradas; formulario con selects dinámicos y cálculo automático de Km/Galones/Rendimiento/Gasto
- **Dashboard extendido (Feb 2026)**: filtros de fecha + KPIs Galones/Rendimiento + gráfico combo Km-vs-Km/gal
- **Alertas de Vencimiento (Feb 2026)**: página `/alertas` con seguros, mantenimientos e impuestos vencidos/próximos; filtro por horizonte (7/15/30/60/90 días) y tipo
- **Exportar a Excel (Feb 2026)**: botón en cada módulo descarga .xlsx con todos los registros vía `/api/modules/{module}/export`
- **Mapa de Rutas (Feb 2026)**: página `/mapa` con OpenStreetMap + react-leaflet 5.x; 26 ciudades del Ecuador geocodificadas, círculos proporcionales a viajes, polilíneas entre ciudades con grosor por frecuencia, filtros de fecha

## Test Credentials
- Admin: `aeortega` / `admin123`
- User: `operador` / `operador123`

## Backlog / Next
- P1: Filtros avanzados por columna + exportar a Excel/PDF
- P1: Import masivo desde Excel en cada módulo (subir archivo)
- P2: Alertas de vencimientos (seguros, matrículas, mnto preventivo)
- P2: Módulo Rutas (existente en Excel, no incluido en MVP)
- P2: Dashboard con filtro por rango de fechas
