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
- **Filtros de Ciudad en Operaciones (Feb 2026)**: Las 3 páginas de Operación (Asignar, Devoluciones, Traspasos) tienen un filtro por ciudad que reduce el select de técnicos/bodegas a los que pertenecen a la ciudad elegida. En Traspasos hay dos filtros independientes (ciudad origen y ciudad destino). data-testids: `asig-ciudad-filter`, `dev-ciudad-filter`, `trs-ciudad-from`, `trs-ciudad-to`.
- **Carga masiva por Excel (Jun 2026)**: Botón "Carga masiva" (solo admin) con diálogo `BulkUploadDialog.jsx` (descarga plantilla + sube .xlsx). Integrado en Flota (`ModulePage.jsx`, endpoints `/api/modules/{module}/template` y `/api/modules/{module}/bulk-import`) y en Herramientas (`HerramientasPage.jsx`, endpoints `/api/tools/tools/template` y `/api/tools/tools/bulk-import`). Fix: se corrigió el import faltante de `BulkUploadDialog` en `ModulePage.jsx` que rompía la página de Flota para administradores. Pendiente de validación del usuario (eligió validar él mismo, sin agente de testing).
- **Columna ID secuencial (Jun 2026)**: (1) Flota: la columna "Nro" ahora se muestra como **"ID" con prefijo `VH-####`** (formato visual tipo `VH-0079`, no destructivo; el dato sigue siendo entero secuencial), es la primera columna de la tabla y se **autogenera de forma secuencial** en el backend al crear un vehículo (`create_record` extendido a `flota`). (2) Gastos: el encabezado "N°" se renombró a **"ID"**; el código `SG-XXXX` ya es secuencial.
- **Herramientas · Bloqueo rol Técnico (Jun 2026)**: El rol `tecnico` no puede acceder al módulo de Herramientas. En `Hub.jsx` se oculta la tarjeta "Herramientas" para técnicos; en `App.js` un guard `BlockTecnico` redirige cualquier ruta `/herramientas/*` al hub (`/`) si el usuario es técnico. Lint/compilación OK.
- **Vehículos · Permisos rol Técnico (Jun 2026)**: En el módulo Vehículos, el rol `tecnico` (1) en **Rutas** no ve el listado cargado: se oculta tabla/buscador/exportar y solo se muestra una tarjeta con el botón "Nueva ruta"; (2) en los **demás módulos** es de **solo lectura**: se oculta el botón "Agregar" (editar/eliminar ya eran solo admin). Enforcement también en backend: `POST /api/modules/{module}` responde **403** para técnico cuando `module != "rutas"`. `ModulePage.jsx` (flags `isTecnico`/`canAdd`/`hideList`) + `create_record`. Verificado por curl: técnico crea ruta→200, crea en flota→403.
- **Gastos · Admin de Cuentas contables (Jun 2026)**: Menú "Cuentas contables" (solo admin) en el sidebar de Gastos. Página `CuentasPage.jsx` (`/gastos/cuentas`) con tabla, búsqueda y CRUD completo (descripción + código). Backend: `GET/POST /api/expense-accounts`, `PATCH/DELETE /api/expense-accounts/{id}` (todos `require_admin`), valida código único. Verificado por curl: crear/editar/eliminar OK, duplicado→400, no-admin→403.
- **Gastos · Cuenta contable dividida (Jun 2026)**: En el formulario "Nueva solicitud" el campo "Cuenta contable" se separó en dos: un desplegable que muestra solo la **descripción** (`a.nombre`) y un campo **"Código" de solo lectura** que se autocompleta con el código numérico al seleccionar (el valor del select sigue siendo `cuenta_codigo`, backend sin cambios). `SolicitudesPage.jsx`. 33 cuentas sin descripciones duplicadas.
- **Login · textos actualizados (Jun 2026)**: En la pantalla de bienvenida el título pasó a "Sistema de gestión integral Experiencia al cliente" y el subtítulo a "Vehículos, herramientas, gastos."; se eliminó la grilla de módulos antiguos (Flota/Seguros/Multas…). `Login.jsx`. Verificado por captura (login es público).
- **Gastos · Menú Alertas (Jun 2026)**: Centro de notificaciones de autorizaciones pendientes por usuario. `GET /api/expenses/alerts` devuelve `{count, items}` según rol y alcance: coordinador→`pend_coordinador`+`pend_aprob_coordinador` de su región, tesorero→`pend_presupuesto`, gerente→`pend_aprob_gerencia`, líder→`pend_factura` propias, admin→todos los estados pendientes. Sidebar con **badge de conteo** (poll 60s). Página `GastosAlertas.jsx` (`/gastos/alertas`) lista las pendientes y abre el detalle para actuar. Verificado por curl: coordinador R1 ve la solicitud R1, coordinador R2 y líder ven 0 (scoping correcto).
- **Gastos · Menú Reportes (Jun 2026)**: Página `GastosReportes.jsx` (`/gastos/reportes`) con filtros por **ciudad, estado y rango de fecha de ingreso**, KPIs (solicitudes, monto total, aprobados, monto aprobado, rechazados), tabla con detalle al clic y **export a Excel** (`/api/expenses/export` con ciudad+desde+hasta). Respeta el scope por rol.
- **Carga masiva de usuarios (Jun 2026)**: Solo admin. `GET /api/users/template` (plantilla con fila de ejemplo) y `POST /api/users/bulk-import` (crea usuarios reusando `hash_password` bcrypt; `documento`=login; contraseña vacía → `indurama123`; valida rol, omite duplicados en archivo y existentes, sincroniza espejo de técnicos). Botón "Carga masiva" en `UsersPage.jsx` (visible en los 3 módulos para admin). Verificado por curl: 2 insertados, duplicado y rol inválido reportados, login con contraseña por defecto OK, técnico espejado en /tools/technicians. Se eliminaron del formulario los campos "Ciclo Mnto Prev. (Km)", "Odómetro Inicial (Km)" y "Estado Mnto Prev." Tres columnas pasan a ser **de solo lectura y calculadas en el backend** (`_fleet_derived_metrics` + enriquecimiento en `GET /api/modules/flota`): "Odómetro Último Mnto (Km)" = Km Odómetro del último mantenimiento del vehículo; "Odómetro Actual (Km)" = último "Km Regreso (Kms Final)" registrado de la última ruta; "Falta Próx. Mnto (Km)" = max(0, últimoPreventivo + 5000 − odómetroActual). Las 3 se agregaron a `listColumns`. Verificado por curl: 60/78 vehículos con odómetro calculado; p.ej. PFL3989 ultMnto=95000 actual=98496 falta=1504. Nota: no se pudo tomar captura autenticada por limitación del navegador del preview; backend verificado por curl, frontend compila y lint OK.
- **SSO Microsoft Entra ID / Active Directory (Jun 2026)** — LISTO A NIVEL DE CÓDIGO (desactivado hasta configurar credenciales). Login corporativo con cuentas de Outlook / Microsoft 365 vía OAuth2 Authorization Code (MSAL). Backend (`server.py`): `GET /api/auth/microsoft/config` (enabled bool), `GET /api/auth/microsoft/login` (inicia flujo, guarda state en `db.oauth_states` con TTL), `GET /api/auth/microsoft/callback` (valida aud/tid, vincula por correo con usuario existente, emite el JWT propio y redirige a `/sso/callback#token=`). Se activa solo si están todas las `ENTRA_*` en `backend/.env` (añadidas en blanco). Frontend: `MicrosoftSignInButton.jsx` (se muestra solo si `config.enabled`), página `SsoCallback.jsx` (ruta `/sso/callback`), `AuthContext.loginWithToken()`. `ENTRA_AUTO_PROVISION` controla si se auto-crea usuario (rol `ENTRA_DEFAULT_ROLE`) cuando el correo no existe. Guía de activación: `docs/sso-microsoft-entra.md`. Verificado: config=false, login SSO=404 y login por contraseña=200 (regresión OK). No testeable e2e sin credenciales de Azure.

## Test Credentials
- Admin: `aeortega` / `admin123`
- User: `operador` / `operador123`

## Test Credentials
- Admin: `aeortega` / `admin123`
- User: `operador` / `operador123`
- Módulo Gastos (clave `indurama123`): coordinador R1 `jullaguari`, coordinador R2 `tarias`, lider R1 `jelaje`/`tgranda`, lider R2 `ambato`/`pmarin`, tesorero `memejia`, gerente `gerente`

## Módulo Gastos — Aprobación de Gastos (Feb 2026)
- Nuevo hub card "Gastos" + sección `/gastos` (Dashboard + Solicitudes). Layout `GastosLayout`.
- Roles nuevos: `coordinador`, `lider`, `tesorero`, `gerente` + campo `region` (R1/R2) en usuarios. Seed de 8 usuarios (Usuarios.xlsx) + gerente, 33 cuentas contables (Cuentas.xlsx). Regiones R1/R2 = conjuntos de ciudades; ciudad asignada aleatoriamente por región.
- Flujo: lider crea → coordinador aprueba/rechaza → (opcional) tesorero asigna presupuesto si `necesita_presupuesto` → lider carga factura (URL, SOLPED, fecha gasto, monto) → coordinador compara cotización vs factura → gerente aprueba (doble aprobación coord+gerente) → aprobado.
- Visibilidad: coordinador/lider solo su región (lider solo propias), tesorero/gerente/admin todo.
- PDF por solicitud (reportlab) en `GET /api/expenses/{id}/pdf`. Emails preparados (`_expense_notify`) pero INACTIVOS (sin EMERGENT_EMAIL_KEY).
- Dashboard `/api/expenses/dashboard`: filtros desde/hasta/ciudad; KPIs (total, monto total, monto aprobado, aprobados, rechazados, pendientes), gasto por categoría, gasto por ciudad, tiempo promedio por etapa.
- Backend testeado (9/9 casos OK). reportlab y openpyxl agregados a requirements.txt.
- **Correos ACTIVADOS (Feb 2026)**: notificaciones en cada transición del flujo vía servicio de email gestionado de Emergent (`EMERGENT_EMAIL_KEY`, `EMAIL_FROM_NAME`, `APP_BASE_URL` en backend/.env). Se notifica al actor y al siguiente responsable/aprobador, y en aprobaciones/rechazos al aprobador y al solicitante. El servicio NO admite adjuntos, por lo que se incluye un ENLACE SEGURO con token JWT (14 días) para descargar el PDF: `GET /api/expenses/pdf/download?token=`. Export Excel de solicitudes con filtros ciudad+fecha creación: `GET /api/expenses/export`.

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
