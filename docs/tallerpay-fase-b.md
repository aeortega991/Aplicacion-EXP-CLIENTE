# TallerPay Fase B — Catálogos, ACT y matriz de tarifas

## Rama para probar en Emergent
`feature/tallerpay/catalogo-act-matriz`. Importar esta rama completa, no fusionar con `main` antes de validar.

## Alcance
- `tp_lines`: catálogo configurable. Inicio con Línea Blanca y Línea Café; alta de líneas adicionales desde Tarifarios. Los talleres eligen las líneas de este catálogo.
- `tp_act_weights`: pesos ACT. Inicializa SB→SL, SL→SL, SM→SM, SG→SG, SE→SG. Se pueden crear pesos nuevos y asignar un destino entre SL, SM y SG.
- `tp_act_codes` y `tp_act_imports`: carga Excel .xlsx del Codificador ACT con código, descripción, peso y equivalencia informativa. Importación todo o nada si hay filas inválidas. Un código desconocido o peso no configurado no se paga automáticamente.
- `tp_tariff_matrix`: tres importes por línea y taller; las cantidades se guardan como texto decimal con dos decimales para precisión monetaria. Cada edición añade un evento en `historial`.
- `tp_tariffs`: tarifario antiguo conservado sin modificación. Su migración **requiere** asociar manualmente cada peso anterior a SL, SM o SG y no sobrescribe destinos existentes.
- Pantallas nuevas en React: `CodificadorPage.jsx` y `TarifarioMatrizPage.jsx`.

## Cómo probar
1. Desplegar la rama en un entorno **de pruebas**, con copia de seguridad de MongoDB previa.
2. Iniciar sesión como administrador y visitar `/pago-talleres/tarifarios` y `/pago-talleres/codificador`.
3. Comprobar que aparecen las dos líneas iniciales; crear otra línea y asignarla a un taller.
4. Verificar que la matriz ofrece exactamente Leve, Moderado y Grave por línea.
5. Cargar un Excel .xlsx con encabezados `codigo`, `descripcion`, `peso`, `equivalencia`.
6. Verificar SB→SL, SE→SG, SM→SM y un peso personalizado con nivel asignado.
7. Revisar los registros históricos de tarifas; mapear solo pesos cuyo significado esté confirmado, luego ejecutar la copia manual.
8. Probar usuarios admin, líder y coordinador, y denegación 403 de otros roles.

## Seguridad de datos
Esta integración NO migra los tarifarios automáticamente al iniciar, NO elimina registros anteriores y NO modifica datos de los seis módulos originales. No se debe mapear un antiguo peso numérico a un nivel económico sin confirmar su significado.

## CI
GitHub Actions `.github/workflows/tallerpay-v2.yml` ejecuta pruebas unitarias de catálogo/ACT y permisos, además de compilación de React. Las pruebas de extremo a extremo con MongoDB requieren un entorno de prueba y credenciales temporales administradas fuera del repositorio.

## Pendientes
Validar el encabezado real y los códigos de un archivo ACT de producción, ajustar el mapeo de columnas si difiere y completar pruebas de integración con MongoDB. Instalaciones de aire acondicionado y liquidaciones permanecen fuera del alcance de esta fase.
