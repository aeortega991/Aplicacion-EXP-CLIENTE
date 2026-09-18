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
- **Módulo Rutas (Feb 2026)**: 1009 rutas sembradas; formulario con selects dinámicos y cálculo automático de Km/Galones/Rendimiento/Gasto. Vehículo dropdown filtra solo Status=Activo. Campo "Estado Vehículo" eliminado.
- **Módulo Mantenimiento (Feb 2026)**: Nro auto-generado ascendente en el backend. Placa desde dropdown de Flota (solo Activo). Taller desde dropdown de Talleres.
- **Módulo Conductores (Feb 2026)**: campo Correo agregado.
- **Historial Vehicular (Feb 2026)**: `/historial` con dropdown de placas, ficha completa, 8 KPIs, secciones (Seguros, Mnto, Multas, Rutas) y export PDF vía reportlab.
- **Emails de Mantenimiento (Feb 2026)**: `POST /api/alerts/send-mnto-emails` (admin) usa Resend (Emergent-managed) para enviar aviso al usuario asignado del vehículo con mnto vencido. Botón "Notificar por correo" en la página de Alertas.
- **Dashboard extendido (Feb 2026)**: filtros de fecha + KPIs Galones/Rendimiento + gráfico combo Km-vs-Km/gal
- **Alertas de Vencimiento (Feb 2026)**: página `/alertas` con seguros, mantenimientos e impuestos vencidos/próximos; filtro por horizonte (7/15/30/60/90 días) y tipo
- **Exportar a Excel (Feb 2026)**: botón en cada módulo descarga .xlsx con todos los registros vía `/api/modules/{module}/export`
- **Mapa de Rutas (Feb 2026)**: página `/mapa` con OpenStreetMap + react-leaflet 5.x; 26 ciudades del Ecuador geocodificadas, círculos proporcionales a viajes, polilíneas entre ciudades con grosor por frecuencia, filtros de fecha
- **Hub + Módulo Herramientas (Feb 2026)**: nueva app modular con Hub principal (Vehículos vs Herramientas). Colecciones: `tools`, `tool_technicians`, `tool_assignments`, `tool_assignment_batches`. CRUD completo, dashboard por ciudad, asignaciones múltiples con PDF y correo automático.
- **Bodegas + Devoluciones + Traspasos (Feb 2026)**: Auto-seeding de bodegas (1 por ciudad). Asignación puede ir a Técnico O Bodega Interna. Módulo Devoluciones (tech → bodega ciudad, con PDF + email). Módulo Traspasos entre bodegas de distintas ciudades (con PDF + email a bodega origen/destino + admin + WAREHOUSE_EMAIL). Endpoint seed `/api/tools/seed-test-data` (admin) genera 20 herramientas random + 5 técnicos por ciudad. Reportes de asignaciones filtran solo tech (excluyen warehouse). Nuevas colecciones: `tool_warehouses`, `tool_return_batches`, `tool_transfers`.
- **Round 3 Herramientas (Feb 2026)**: (1) Módulo Bodegas con vista grid de tarjetas y detalle por bodega + export PDF de inventario (`GET /api/tools/warehouses/{id}/inventory/pdf`). (2) Bulk Baja en inventario: checkboxes por fila, select-all, barra contextual con botones "Dar de baja" / "Reactivar" (endpoint `POST /api/tools/tools/bulk-deactivate`, cierra asignaciones vigentes automáticamente). (3) Historial por Técnico: página con select, filtros (todas/vigentes/devueltas), KPIs (total/vigentes/devueltas/valor) y export PDF (`GET /api/tools/technicians/{id}/history/pdf`). Sidebar: entradas "Bodegas" y "Historial técnico".

## Test Credentials
- Admin: `aeortega` / `admin123`
- User: `operador` / `operador123`

## Backlog / Roadmap
- P2 (refactor sugerido por code review): Dividir `server.py` (>2200 líneas) en routers separados (`routers/tools.py`, `routers/fleet.py`)
- P2: Extraer helper compartido `_build_tools_email_html()` (código HTML de emails duplicado en 3 endpoints)
- P2: Migrar PDFs de hex-in-mongo a GridFS o filesystem
- P1: Bulk edit/eliminar en tablas de flota (ya solicitado antes, pendiente)
- P2: Filtro opcional por warehouse_id en `/tools/reports/current`

## Backlog / Next
- P1: Filtros avanzados por columna + exportar a Excel/PDF
- P1: Import masivo desde Excel en cada módulo (subir archivo)
- P2: Alertas de vencimientos (seguros, matrículas, mnto preventivo)
- P2: Módulo Rutas (existente en Excel, no incluido en MVP)
- P2: Dashboard con filtro por rango de fechas
