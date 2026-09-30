# docs/project-decisions.md

**Directriz de referencia:** Directriz unificada de desarrollo Emergent IA v1.0 (2026-09-29),
que consolida la Matriz corporativa v2.1 (Bloque A), el estandar NestJS (Bloque B) y el
estandar React (Bloque C).

> Este archivo registra decisiones, criticidad y supuestos conforme a la seccion 0.3 de
> la directriz. Las decisiones que exigen validacion corporativa permanecen **PENDIENTES**;
> Emergent IA no puede autoaprobarlas.

## 1. Negocio

- **Alcance:** gestion de flota vehicular, herramientas/activos y flujo de aprobacion de gastos.
- **Propietario funcional:** PENDIENTE (a designar por el area de negocio).
- **Usuarios:** areas de operacion, tecnicos, coordinadores regionales (R1/R2), tesoreria y gerencia.
- **Datos:** vehiculos, activos/herramientas, usuarios, solicitudes de gasto, cuentas contables.
- **Integraciones:** servicio de correo gestionado (Emergent). Sin integraciones ERP/IAM productivas.

## 2. Criticidad (Directriz A.1)

- **Estado:** NO clasificada formalmente. **PENDIENTE** de validacion por Arquitectura
  Empresarial + Seguridad de la Informacion + responsable de negocio.
- **Supuesto de trabajo provisional:** media. No autoaprobable.
- **RTO/RPO:** PENDIENTES de definicion con negocio.

## 3. Arquitectura

- **Patron:** monolito (backend FastAPI monoservicio + SPA React). Los limites por modulo existen
  a nivel logico (routers por dominio en backend; estructura por feature en frontend), pero NO
  siguen la separacion dominio/aplicacion/infraestructura exigida (A.3.1).
- **Microservicios:** no aplican (A.3.3).
- **Decision:** avanzar como monolito modular; el refactor a limites explicitos por modulo queda como mejora.

## 4. Backend

- **Stack actual:** Python + FastAPI + MongoDB (Motor). **FUERA del catalogo permitido**
  (Java LTS o Node.js+TS+NestJS, A.2/A.5). Requiere **excepcion corporativa aprobada** o
  **migracion** a un stack permitido. Estado: **EXCEPCION REQUERIDA / PENDIENTE**.
- **ORM/persistencia:** acceso Mongo directo con UUIDs (sin ObjectId expuesto).

## 5. Frontend

- **Stack actual:** React 19 (CRA/craco) + TypeScript NO (JS/JSX) + Tailwind + shadcn/ui.
- **Aprobacion React (A.6.2):** PENDIENTE de Arquitectura Empresarial.
- **TypeScript (C.2):** el codigo esta en JS/JSX, no TS estricto. **NO conforme.**
- **Router:** react-router. **Estado:** local por defecto; cliente HTTP unico en `shared`/`lib/api.js` (axios con interceptores).

## 6. Identidad y sesion

- **Actual:** autenticacion propia (JWT + bcrypt), token en `localStorage`.
- **Directriz:** IAM corporativo OIDC/OAuth 2.0; PROHIBIDO token en localStorage (C.9/C.15);
  PROHIBIDO login propio sin aprobacion (B.12.6).
- **Estado:** **NO conforme.** Integracion IAM y rediseno de sesion (cookie httpOnly del backend) **PENDIENTES**.

## 7. Operacion

- OCI/contenedores, Kubernetes, Vault, CI/CD, OpenTelemetry, IaC, health checks readiness/liveness:
  **NO disponibles** en el entorno actual. Estado: **PENDIENTE / INTEGRACION NO DISPONIBLE**.

## 8. Calidad

- SonarQube corporativo, gates de cobertura por criticidad, SAST/SCA, presupuesto de bundle,
  Dependabot/Renovate: **PENDIENTES**. No hay suite de pruebas automatizada aun.

## Supuestos declarados

1. El entorno de prototipado no expone IAM, Vault, SonarQube, registro OCI ni pipeline corporativo.
2. La criticidad y la aprobacion de stack se tratan como pendientes hasta contar con evidencia formal.
3. Los secretos reales se gestionan fuera del repo (vault); aqui solo hay `.env.example`.
