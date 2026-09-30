# docs/compliance-matrix.md

**Directriz:** Emergent IA v1.0 (Matriz A v2.1 + NestJS B + React C).
**Leyenda de estado:** `CUMPLIDO` · `PARCIAL` · `PENDIENTE` · `NO APLICA (justificado)` · `EXCEPCION REQUERIDA`.

> Ninguna integracion inaccesible se marca CUMPLIDA mediante mock (Directriz 0.6). Este mapeo
> refleja el estado real del prototipo (FastAPI + React CRA + MongoDB).

| ID | Obligacion | Fuente | Implementacion / archivo | Estado | Responsable |
|----|-----------|--------|--------------------------|--------|-------------|
| ARQ-01 | Monolito modular con limites explicitos | A.3.1/3.2 | Routers por dominio (`backend/server.py`), features en `frontend/src` | PARCIAL | Arquitectura |
| BK-01 | Backend en catalogo (Java/NestJS) | A.2/A.5 | Python + FastAPI | EXCEPCION REQUERIDA | Arquitectura |
| BK-02 | TypeScript obligatorio en backend | B (stack) | N/A (Python) | NO APLICA (stack distinto) | Arquitectura |
| BK-03 | Validacion de entradas | B.12.5 | Pydantic (models FastAPI) | CUMPLIDO | Backend |
| BK-04 | Manejo centralizado de errores tipados | B.12.9 | HTTPException; falta filtro/envoltorio unico | PARCIAL | Backend |
| BK-05 | `ResponseStructure<T>` en respuestas con body | B.15.7 | Respuestas crudas actuales | PENDIENTE | Backend |
| BK-06 | GET no modifica; PUT/PATCH/DELETE aprobados | B.15.1/15.2 | GET de lectura; se usan PATCH/DELETE (usuarios) | PARCIAL | Arquitectura |
| BK-07 | Idempotencia, filtrado/orden uniforme, timeouts | B.15.9 | Filtros por modulo; sin Idempotency-Key | PARCIAL | Backend |
| API-01 | API-first + OpenAPI 3.x + catalogo corporativo | A.8/B.15.8 | OpenAPI autogenerado (`/openapi.json`); sin registro corporativo | PARCIAL | Backend |
| DAT-01 | Consultas parametrizadas / filtros NoSQL validados | B.12.4 | Filtros via Pydantic; sin interpolacion | CUMPLIDO | Backend |
| DAT-02 | Preferir inactivacion sobre borrado fisico | B.15.4 | Bajas logicas en modulos; borrado usuario fisico | PARCIAL | Backend |
| DAT-03 | Dinero en decimales/unidades minimas; backend fuente de verdad | 0.4/C.2 | Montos en backend; frontend solo formatea | PARCIAL | Backend |
| SEC-01 | Sin secretos en repo; `.env` en `.gitignore` | A.9.7/B.12.1 | `.gitignore` excluye `.env`; `.env.example` provisto | CUMPLIDO | Seguridad |
| SEC-02 | Escaneo bloqueante de secretos (gitleaks/trufflehog) | A.9.2/B.12.2 | No hay CI | PENDIENTE | DevSecOps |
| SEC-03 | Passwords con bcrypt/argon2 | B.12.3 | bcrypt (`hash_password`) | CUMPLIDO | Backend |
| SEC-04 | IAM corporativo OIDC/OAuth; sin login propio | A.auth/B.12.6 | Auth propia (JWT) | EXCEPCION REQUERIDA | IAM/Seguridad |
| SEC-05 | No tokens en localStorage; cookie httpOnly | C.9/C.15 | Token en localStorage | NO CONFORME (PENDIENTE) | Frontend/Seguridad |
| SEC-06 | CORS whitelist (no `*`) | B.12.7 | `CORS_ORIGINS=*` | NO CONFORME (PENDIENTE) | Backend |
| SEC-07 | Hardening HTTP (helmet/TLS/limite body) | B.12.7 | Parcial (proxy plataforma) | PARCIAL | Backend |
| SEC-08 | Rate limiting en auth/publicos | B.12.8 | No implementado | PENDIENTE | Backend |
| SEC-09 | Archivos de usuario tratados como no confiables | C.15 | Uploads/URLs sin sanitizacion dedicada | PARCIAL | Frontend/Backend |
| FE-01 | Frontend Angular por defecto / React aprobado | A.6.1/6.2 | React CRA | APROBACION REQUERIDA | Arquitectura |
| FE-02 | TypeScript strict | C.2 | JS/JSX | PENDIENTE | Frontend |
| FE-03 | Cliente HTTP unico con interceptores | C.10 | `frontend/src/lib/api.js` (axios) | CUMPLIDO | Frontend |
| FE-04 | Estructura por feature | C.3 | `pages/`, `layouts/`, `components/` por dominio | PARCIAL | Frontend |
| FE-05 | Validacion en runtime de respuestas API | C.10 | No hay validacion runtime (zod) | PENDIENTE | Frontend |
| FE-06 | Tema centralizado; sin hex sueltos | C.13 | Tailwind + shadcn; algunos colores inline | PARCIAL | Frontend |
| FE-07 | Datasets grandes: paginado/orden en servidor + virtualizacion | C.13.1 | Filtrado mayormente en cliente | PARCIAL | Frontend |
| FE-08 | Error boundaries de render | C.18 | No implementados | PENDIENTE | Frontend |
| FE-09 | Presupuesto de bundle en CI | C.16.2 | No hay CI | PENDIENTE | Frontend |
| OBS-01 | Logs JSON, correlation id, OpenTelemetry | B.17/A.9.5 | logging basico | PENDIENTE | Backend |
| OBS-02 | Health checks readiness/liveness | B.17.2/A.9.1 | No expuestos | PENDIENTE | Backend |
| OPS-01 | Contenedor OCI no root + SBOM | A.9.1/B.18 | Gestionado por plataforma; sin Dockerfile propio | PENDIENTE | DevOps |
| OPS-02 | CI/CD completo (build, tests, escaneo, SBOM, rollback) | A.9.2 | No disponible | PENDIENTE | DevOps |
| OPS-03 | IaC | A.2 | No disponible | PENDIENTE | DevOps |
| QA-01 | Pruebas unit/integracion/E2E + cobertura por criticidad | A.9.6/B.20/C.22 | Sin suite automatizada | PENDIENTE | QA |
| QA-02 | ESLint + Prettier sin errores | C.20 | ESLint presente (warnings) | PARCIAL | Frontend |
| QA-03 | SonarQube quality gate corporativo | A.9.6/C.20 | No integrado | PENDIENTE | DevSecOps |
| DEP-01 | Lockfile + audit + un solo actualizador | B.19/C.21 | `yarn.lock` presente; sin audit/Dependabot | PARCIAL | Frontend |
| DOC-01 | README + criticidad + responsables | A.4.4 | `README.md` (este entregable) | PARCIAL | Equipo |
| DOC-02 | ADRs para decisiones relevantes | A.4.4 | No creados | PENDIENTE | Arquitectura |
| DOC-03 | Diagramas ArchiMate/C4 correspondientes al codigo | A.4.1-4.3 | No entregados | PENDIENTE | Arquitectura |
| DOC-04 | Documentacion de codigo (TSDoc/JSDoc/Javadoc) | A.4.5 | Parcial | PENDIENTE | Equipo |

## Resumen ejecutivo

- **Cumplido (feasible en este entorno):** gestion de secretos fuera del repo, bcrypt,
  validacion de entradas (Pydantic), cliente HTTP unico, OpenAPI autogenerado.
- **No conforme / pendiente critico:** stack backend fuera de catalogo, React sin aprobacion,
  token en localStorage, CORS `*`, IAM corporativo, sin TypeScript, sin pruebas ni CI/CD,
  sin observabilidad ni contenedor OCI/SBOM.
- **Conclusion (Directriz 0.7):** el prototipo NO puede declararse conforme ni listo para
  produccion. Las decisiones de stack, criticidad e IAM requieren validacion corporativa formal.
