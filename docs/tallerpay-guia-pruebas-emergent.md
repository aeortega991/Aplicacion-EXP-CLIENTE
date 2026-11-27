# TallerPay — Guía de importación y pruebas en Emergent

> **Rama a importar:** `feature/tallerpay/catalogo-act-matriz` del repositorio `aeortega991/Aplicacion-EXP-CLIENTE`. No crear otra rama ni sustituir `main`.
>
> **Alcance:** prueba funcional en entorno separado con base MongoDB de prueba. No ejecutar pagos reales.

## Preparación del entorno

1. Conectar Emergent con el mismo repositorio GitHub e importar la rama **exacta** `feature/tallerpay/catalogo-act-matriz`.
2. Confirmar que la importación incluye `backend/tallerpay/*.py`, `frontend/src/pages/tallerpay/*.jsx`, `frontend/src/App.js`, `frontend/src/layouts/TallerPayLayout.jsx` y `.github/workflows/tallerpay-v2.yml`.
3. Configurar `MONGO_URL` y `DB_NAME` apuntando a **MongoDB de pruebas**. No compartir la base de producción. Usar las variables existentes en el proyecto; `REACT_APP_BACKEND_URL` debe apuntar al backend de prueba.
4. Iniciar backend/frontend según el mecanismo del proyecto. Verificar que el backend termina de crear índices MongoDB en el evento `startup`; revisar logs ante errores de índices existentes.
5. Abrir la aplicación y entrar con un usuario `admin` de pruebas. Comprobar menú **Pago a talleres**.

## Secuencia de datos

1. **Técnicos:** en el catálogo existente de técnicos, crear/verificar el código SAP del técnico piloto. El código debe ser idéntico al de la columna V del SAP. No vincularlo con ningún taller.
2. **Productos y líneas:** asignar los códigos de producto SAP a `blanca`, `cafe` u otras líneas activas. Revisar la sección de productos pendientes.
3. **Codificador ACT:** importar el Excel del codificador; confirmar códigos y niveles SB/SL→SL, SM→SM, SG/SE→SG. Los códigos sin nivel requieren revisión.
4. **Tarifarios por técnico:** para el mismo código, configurar matriz SL/SM/SG por línea y un **USD/km individual** (no existe importe estándar).
5. **Instalación especial:** si el piloto contiene instalaciones, registrar **INSTALACION NIVEL 1** para ese técnico y línea, por ejemplo USD 13. Los tickets de instalaciones de cualquier otro nivel deben valorar con esa misma tarifa.
6. **Promociones:** crear una regla vigente por cadena/modelo/categoría con precio promocional. Ejemplo: instalación nivel 1 tarifa normal USD 13 y promoción USD 10; el ticket coincidente va a `CS_Com` por USD 10.
7. **SAP:** importar un XML original o XLSX convertido. Utilizar **Verificar y previsualizar** y, solo si no hay errores, **Confirmar importación**. Verificar total de tickets, fecha de solución, técnico, serie, foráneo, fecha Inicio Prometida y exclusiones por asunto.
8. **Liquidaciones:** elegir el técnico y el mes. Revisar tickets incluidos, clasificación, importes y errores pendientes. Para los tickets foráneos pagables, ingresar kilómetros (0 permitido) y pulsar **Recalcular**. El sistema debe utilizar `km × tarifa_km_del_técnico`.
9. **Guardar borrador, cerrar y exportar**. Verificar tres hojas `CS_Exp`, `CS_Com`, `CS_NoPago`. Comprobar campo `serie`, rojo en series repetidas entre hojas, y `categoria_resolucion_original` al final.
10. **Autorización:** usuario `lider` no puede modificar una liquidación cerrada. Solo `admin`/`coordinador` con los permisos pertinentes pueden modificarla; debe quedar historial de motivo, usuario y valor anterior/nuevo.

## Pruebas negativas obligatorias

- Confirmar importación SAP XML y XLSX; reimportar el mismo archivo para verificar omisión de duplicados y rechazo de estructuras inválidas.
- Intentar liquidar producto sin línea, ACT sin tarifa, instalación sin importe aplicable y ticket foráneo sin USD/km: **debe impedirse el guardado**.
- Serie repetida en `CS_Exp` y `CS_Com` → las dos celdas de serie en rojo. Una serie vacía no debe colorearse.
- INSTALACION NIVEL 2/3/X → INSTALACION NIVEL 1 para su tarifa, conservando dato original.
- Asunto con «ENTREGA» u otro ID de siete dígitos → `CS_NoPago`, aun con promoción.
- Intentar liquidar dos veces un mismo ticket → respuesta de conflicto 409, sin duplicar liquidación.
- Modificar un valor de una liquidación cerrada sin justificación y con rol `lider` → rechazo.
- Si una promoción comercial anterior carece de `precio_promocional`, completar el valor antes de liquidarla.

## Límites de la verificación automatizada actual

GitHub Actions valida **unit tests de backend** y **compilación frontend**. La guía anterior exige además una **prueba integrada** con backend+MongoDB y una **prueba de navegador** en Emergent. Un build exitoso no garantiza por sí mismo el funcionamiento operativo ni reemplaza la revisión de importes.

## Rutas de interés

- `/pago-talleres/tarifarios` — tarifas del técnico y USD/km
- `/pago-talleres/productos` — catálogo SAP producto→línea
- `/pago-talleres/codificador` — codificador ACT
- `/pago-talleres/promociones` — promociones
- `/pago-talleres/importacion` — SAP
- `/pago-talleres/liquidaciones` — liquidación individual
