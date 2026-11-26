# TallerPay — Promociones comerciales (Fase B2)

## Implementación

**Rama:** `feature/tallerpay/catalogo-act-matriz` (sin crear otra rama).

El menú `/pago-talleres/promociones` permite administrar reglas que asignan la responsabilidad comercial de los tickets. La configuración se almacena en `tp_promotions`, y el historial de importación en `tp_promotion_imports`. No modifica colecciones de otros módulos.

Campos de cada regla: nombre, cadena comercial, modelo, categoría de resolución, línea, producto, vigencia desde/hasta, observaciones, estado. Se permite `*` para un campo sin restricción; la regla debe especificar como mínimo un criterio concreto. La cadena comercial se exige en el formulario y puede ser `*` si hay otras condiciones.

Ejemplo de configuración (no registra ni activa una promoción automáticamente): Kywi + una categoría de resolución de instalación + un producto de aire acondicionado, vigente en fechas indicadas. Debe validarse con los datos de negocio reales.

La pantalla soporta alta, edición, activación, desactivación, filtrado, descarga de plantilla e importación Excel .xlsx (hasta 8MB). La importación no persiste filas cuando se detectan errores; no reescribe promociones idénticas ya existentes.

## Evaluación de reglas

El endpoint `POST /api/tallerpay/promociones/evaluar` recibe los campos del ticket y devuelve:
- `CS_NoPago` si no tiene fecha de solución, tiene causa de no solución, el asunto contiene ENTREGA, o se identificó explícitamente una referencia a otro ticket.
- `CS_Exp` si es pagable y ninguna regla activa/vigente coincide.
- `CS_Com` si una regla activa/vigente coincide con cadena, modelo, categoría resolución, línea y producto.
- `PENDIENTE` si hay más de una coincidencia con igual especificidad (no elegir arbitrariamente una).

La fecha de solución decide la vigencia. Los criterios se comparan sin distinguir mayúsculas y con espacios normalizados. Las coincidencias más específicas prevalecen frente a las genéricas.

**Importante:** este módulo configura la *responsabilidad* de un pago; no asigna por sí solo importe o tarifa de instalación. Para liquidación real se requiere conectar el evaluador al módulo SAP, identificar correctamente las referencias a otros tickets y validar las condiciones contractuales de cada promoción. Un precio promocional al consumidor no implica automáticamente que Comercial asuma el importe del taller.

## Permisos

Admin tiene acceso completo. Los roles coordinador y líder necesitan permisos de lectura/edición según `tp_promociones`. Otros roles se bloquean en el backend.

## Pruebas

`backend/tests/test_tallerpay_promociones.py` cubre coincidencias, vigencia, estado, prioridad de CS_NoPago, ambigüedad y rutas. El pipeline GitHub Actions ejecuta estas pruebas y compila React.

No se han cargado reglas reales, ni realizado pruebas en la base MongoDB de Emergent. Usar copia de seguridad y registros de prueba.
