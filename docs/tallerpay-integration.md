# Pago a talleres — Fase 1

La integración inicial añade el módulo **Pago a talleres** con el submenú **Talleres tercerizados**. No modifica el recurso `veh_talleres` (proveedores de flota).

## Permisos
- Solo `admin`, `coordinador` y `lider` pueden acceder al nuevo módulo.
- Los roles restantes quedan excluidos incluso si una matriz antigua contiene permisos.
- El administrador mantiene el acceso total habitual.
- Los recursos `tallerpay` y `tp_*` se incorporan a la matriz por rol.
- El backend verifica rol, acceso al módulo y acceso a la sección. El frontend proporciona la misma restricción para navegación.
- Ningún endpoint de liquidación o pago se habilita en esta fase.

## Arquitectura
- React: nueva tarjeta en `Hub.jsx`, nuevas rutas en `App.js`, layout y páginas bajo `pages/tallerpay/`.
- FastAPI: router independiente `backend/tallerpay/router.py`, registrado en `server.py`.
- Base de datos: no se crean colecciones hasta la fase funcional. Posteriormente usar prefijo propio para evitar conflicto con `Vehículos → Talleres`.

## Validación pendiente
1. Ejecutar pruebas backend: `cd backend && python -m unittest discover -s tests -p 'test_tallerpay_access.py'`.
2. Construir frontend: `cd frontend && yarn install && yarn build`.
3. Comprobar navegación de los tres roles autorizados, denegación de los demás y matriz de permisos.
4. Revisar funcionamiento de los seis módulos actuales antes de fusionar.

La Fase 1 no implementa cálculo monetario, carga SAP, tarifas ni reportes Excel.
