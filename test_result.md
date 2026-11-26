#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Control de Flota Vehicular - Fleet management system with authentication, vehicle tracking, and dashboard"

backend:
  - task: "Unificación de Técnicos - Refactor de Usuarios con documento"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "REFACTOR unificación de técnicos. Cambios backend: (1) Usuarios ahora tienen campo 'documento' (=login username). POST /api/users acepta {documento,name,role,region,ciudad,password} y crea username=documento; login funciona con ese documento. (2) Nuevo rol 'tecnico'. (3) Migración: conductores -> usuarios rol tecnico (52), y espejo en tool_technicians (mismo id). (4) GET /api/modules/tecnicos devuelve usuarios rol tecnico [{id,nombre,documento,ciudad}]. (5) Al crear/editar/eliminar un usuario rol tecnico, se sincroniza db.tool_technicians (mismo id) -> GET /api/tools/technicians debe reflejarlo."
      - working: true
        agent: "testing"
        comment: "ALL 10 TESTS PASSED ✅. Test 0: Admin login (aeortega/admin123) successful (200). Test 1: GET /api/modules/tecnicos returns 52 tecnico users with correct structure {id, nombre, documento, ciudad} (200). Test 2: GET /api/tools/technicians returns 52 technicians with correct structure {id, codigo, nombre, apellido, ciudad} (200). Test 3: Create tecnico user (documento: TEST99999, name: Tecnico Prueba, role: tecnico, ciudad: QUITO) successful (200); user appears in both /api/tools/technicians and /api/modules/tecnicos; login with TEST99999/clave123 works with role=tecnico (200). Test 4: Edit tecnico user (name: Tecnico Editado, ciudad: CUENCA) successful (200); changes reflected in /api/tools/technicians (nombre: Tecnico, apellido: Editado, ciudad: CUENCA) - sync function correctly splits name into nombre (first word) and apellido (remaining words). Test 5: Delete tecnico user successful (200); user removed from /api/tools/technicians. Test 6: Create lider user (documento: LID12345, role: lider, region: R1, ciudad: AMBATO) successful (200); login with LID12345/clave123 works with role=lider (200); lider user correctly does NOT appear in /api/tools/technicians. Test 7: Migrated tecnico login successful - logged in with documento '0924098098' and password 'indurama123' with role=tecnico (200). Test 8: Tool assignment to technician successful (200); assignment shows technician_nombre in /api/tools/reports/current. Test 9: Tool assignment to warehouse successful (200). All authentication, user CRUD, documento-based login, technician mirroring, and tool assignment functionality working correctly."

  - task: "Módulo Gastos - Workflow completo de aprobación"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Nuevo módulo Gastos. Endpoints: GET /api/expenses/meta (cuentas+ciudades+regiones), POST /api/expenses (crea, solo rol lider/admin, ciudad/region del usuario), GET /api/expenses (lista con scope por rol: coordinador->su region, lider->propias, tesorero/gerente/admin->todo; filtros estado/ciudad/desde/hasta), GET /api/expenses/{id}, POST /api/expenses/{id}/coordinator-decision (aprobar/rechazar; si necesita_presupuesto->pend_presupuesto else pend_factura), POST /api/expenses/{id}/assign-budget (tesorero/admin), POST /api/expenses/{id}/invoice (solicitante/admin: url_factura, numero_solped, fecha_gasto, monto_factura), POST /api/expenses/{id}/coordinator-final (compara cotizacion vs factura, aprobar->pend_aprob_gerencia), POST /api/expenses/{id}/manager-decision (gerente/admin, aprobar->aprobado), GET /api/expenses/{id}/pdf (reportlab), GET /api/expenses/dashboard (KPIs monto_total/aprobados/rechazados/pendientes, por_categoria, por_ciudad, tiempos_etapa promedio, filtros desde/hasta/ciudad). Seed: 8 usuarios de Usuarios.xlsx + 1 gerente (clave indurama123), 33 cuentas de Cuentas.xlsx, region R1/R2 con ciudades. Probado manualmente el flujo end-to-end con curl (todos 200, PDF 200, scope por region OK)."
      - working: true
        agent: "testing"
        comment: "ALL 9 TESTS PASSED. Test 1: GET /api/expenses/meta returns 33 accounts, regions R1/R2, 14 cities, 7 estados (200 OK). Test 2: POST /api/expenses as líder jelaje creates expense with numero SG-0001, estado pend_coordinador, region R1 (200 OK). Test 3: Full flow WITH budget completed successfully - coordinador approves (pend_presupuesto), tesorero assigns budget (pend_factura), líder uploads invoice (pend_aprob_coordinador), coordinador final approves (pend_aprob_gerencia), gerente approves (aprobado) - all 200 OK. Test 4: Flow WITHOUT budget skips tesorero correctly - coordinador approval goes directly to pend_factura (200 OK). Test 5: Rejection flow works - coordinador rejects, estado becomes rechazado with rechazado_etapa and rechazo_motivo set (200 OK). Test 6: Region scope restrictions work perfectly - coordinador R2 cannot see R1 expenses in list, gets 403 when trying to act on R1 expense, líder jelaje only sees own expenses, líder tgranda gets 403 when accessing jelaje's expense (all correct). Test 7: Role restrictions work - líder gets 403 for coordinator action, tesorero gets 403 for creating expense, gerente gets 403 for assigning budget (all correct). Test 8: PDF generation works - returns 3747 bytes application/pdf (200 OK). Test 9: Dashboard works with all filters - returns kpis (total, monto_total, monto_aprobado, aprobados, rechazados, pendientes), por_categoria, por_ciudad, tiempos_etapa; filters desde/hasta/ciudad work correctly (200 OK). All authentication, authorization, workflow transitions, region scoping, and role restrictions working as expected."
      - working: true
        agent: "testing"
        comment: "REGRESSION TEST WITH EMAIL NOTIFICATIONS - ALL 8 STEPS PASSED ✅. Email notification feature added with secure PDF download links at every stage transition. CRITICAL FINDING: Email notifications do NOT break the workflow - all endpoints still return 200 status codes. Test results: Step 1: Login jelaje, create expense (cuenta_codigo: 61035001, proveedor: Prov Test, monto: 900, necesita_presupuesto: true) -> 200, estado pend_coordinador, expense created SG-0003 (id: 5f7558bb-9fc0-4d57-9bae-daadd8722ced). Step 2: Login jullaguari (coordinador R1), POST /api/expenses/{id}/coordinator-decision {decision: aprobar} -> 200, estado pend_presupuesto. Step 3: Login memejia (tesorero), POST /api/expenses/{id}/assign-budget {monto_presupuesto: 900, comentario: ok} -> 200, estado pend_factura. Step 4: Login jelaje, POST /api/expenses/{id}/invoice {url_factura: https://example.com/fac.pdf, numero_solped: SOLPED-1, fecha_gasto: 2026-03-05, monto_factura: 880} -> 200, estado pend_aprob_coordinador. Step 5: Login jullaguari, POST /api/expenses/{id}/coordinator-final {decision: aprobar} -> 200, estado pend_aprob_gerencia. Step 6: Login gerente, POST /api/expenses/{id}/manager-decision {decision: aprobar} -> 200, estado aprobado. Step 7: Rejection flow tested - created new expense SG-0004, jullaguari rejected with decision: rechazar, comentario: no -> 200, estado rechazado. Step 8: Secure PDF download tested - GET /api/expenses/{id}/pdf as admin (Bearer token) -> 200, application/pdf, 3688 bytes; GET /api/expenses/pdf/download?token=BAD_TOKEN -> 403 (invalid token correctly rejected). Backend logs confirm email notifications are being sent (multiple 202 Accepted responses from email service, some 429 rate limits but these don't break the flow). Email service integration working correctly with delivered@resend.dev test addresses. NO ISSUES FOUND. All workflow transitions, email notifications, and secure PDF links working as expected."


  - task: "Authentication - Admin Login"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Regression test PASSED. POST /api/auth/login with aeortega/admin123 returns 200 with token and role=admin. Bug fix verified - no longer returns 404."
  
  - task: "Authentication - Operator Login"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Regression test PASSED. POST /api/auth/login with operador/operador123 returns 200 with token and role=user."
  
  - task: "Authentication - Get Current User"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Regression test PASSED. GET /api/auth/me with Bearer token returns 200 with correct user data (username: aeortega, role: admin)."
  
  - task: "Flota Module - Get Vehicles"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Regression test PASSED. GET /api/modules/flota with admin Bearer token returns 200 with list of 78 vehicles."
  
  - task: "Dashboard - Get Dashboard Data"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Regression test PASSED. GET /api/dashboard with admin Bearer token returns 200 with dashboard data (kpis, consumo_combustible, gasto_por_vehiculo, gasto_por_ciudad, multas_por_conductor, consumo_por_vehiculo)."
  
  - task: "Authentication - Wrong Password Handling"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Regression test PASSED. POST /api/auth/login with wrong password returns 401 (NOT 404). Bug fix verified - the 404 error is resolved."

  - task: "Entregas de documentos (backend /api/docs/*)"
    implemented: true
    working: "NA"
    file: "backend/documents.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Nuevo módulo. Endpoints /api/docs/meta, POST/GET /api/docs/entregas (scope recibidas|enviadas|todas[admin]), GET /api/docs/entregas/{id}, POST /api/docs/entregas/{id}/aceptar (solo receptor), GET /api/docs/entregas/{id}/acta (PDF), GET /api/docs/pendientes, GET /api/docs/dashboard (admin). Código CD-AAAA-000001, email al receptor."

  - task: "Pago a talleres Fase A - Talleres tercerizados, Tarifarios y archivos"
    implemented: true
    working: "NA"
    file: "backend/tallerpay/router.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Endpoints /api/tallerpay/talleres (GET/POST/PUT, /{id}/estado, /template, /import upsert por codigo_sap), /api/tallerpay/tarifarios (GET/POST/PUT/DELETE, /template, /import upsert por sap+linea+peso), archivos /talleres/{id}/archivos (GET/POST multipart), /archivos/{id} (GET/DELETE soft). Permisos: solo admin/coordinador/lider; edicion segun matriz tp_talleres/tp_tarifarios (default solo admin)."

frontend:
  - task: "Login Flow - Admin User (UI)"
    implemented: true
    working: true
    file: "frontend/src/pages/Login.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "UI test PASSED. Admin login (aeortega/admin123) successfully redirects to Hub page. User info displayed correctly (@aeortega · admin). Success toast 'Bienvenido' shown. NO 404 error toast. Logout works correctly."
  
  - task: "Login Flow - Operator User (UI)"
    implemented: true
    working: true
    file: "frontend/src/pages/Login.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "UI test PASSED. Operator login (operador/operador123) successfully redirects to Hub page. User info displayed correctly (@operador · user). Success toast 'Bienvenido' shown. NO 404 error toast."
  
  - task: "404 Bug Fix Verification"
    implemented: true
    working: true
    file: "frontend/.env"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Bug fix VERIFIED. No 404 errors detected in network requests or error toasts. REACT_APP_BACKEND_URL correctly set in frontend/.env. All login API calls successful (200 status). No console errors detected."

metadata:
  created_by: "testing_agent"
  version: "1.0"
  test_sequence: 5
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "testing"
    message: "Regression testing completed for login 404 bug fix. All 6 tests PASSED. The .env files (backend/.env and frontend/.env) have been restored and the backend is running correctly. All authentication endpoints are working as expected: admin login (200), operator login (200), auth/me (200), modules/flota (200 with 78 vehicles), dashboard (200), and wrong password handling (401 not 404). The bug is FIXED."
  - agent: "testing"
    message: "UI testing completed for login 404 bug fix. BOTH admin and operator login flows work perfectly in the browser. Admin (aeortega/admin123) and Operator (operador/operador123) both successfully login, redirect to Hub, and show correct user info. NO 404 error toasts appear. NO network 404 errors detected. NO console errors. The bug is COMPLETELY FIXED and verified in the UI."
  - agent: "main"
    message: "Nuevo módulo GASTOS agregado. Por favor probar SOLO el backend del módulo de gastos (endpoints /api/expenses/*). Usuarios (clave indurama123): lider R1 jelaje/tgranda, lider R2 ambato/pmarin, coordinador R1 jullaguari, coordinador R2 tarias, tesorero memejia, gerente gerente. Admin aeortega/admin123. Validar: (1) crear solicitud como lider, (2) flujo con presupuesto (coordinador aprueba->tesorero asigna->lider factura->coordinador final->gerente aprueba->aprobado), (3) flujo SIN presupuesto (salta tesorero, va directo a pend_factura), (4) rechazo en cada etapa, (5) scope por region: coordinador R2 no debe ver ni actuar sobre gastos R1 (403/no listado), lider solo ve las propias, (6) restricciones de rol (un lider no puede aprobar, tesorero no puede crear, etc. -> 403), (7) PDF 200, (8) dashboard con filtros desde/hasta/ciudad devuelve kpis, por_categoria, por_ciudad, tiempos_etapa. No probar módulos de Vehículos/Herramientas."
  - agent: "testing"
    message: "EXPENSES MODULE TESTING COMPLETED - ALL 9 TESTS PASSED ✅. Comprehensive testing of all expenses endpoints completed successfully. Test results: (1) Meta endpoint returns correct data structure with 33 accounts, regions R1/R2, 14 cities, 7 estados. (2) Expense creation works correctly with proper estado, numero format (SG-XXXX), and region assignment. (3) Full workflow WITH budget completed successfully through all 5 stages (coordinador->tesorero->líder->coordinador final->gerente) with correct estado transitions. (4) Workflow WITHOUT budget correctly skips tesorero stage. (5) Rejection flow works with proper rechazado_etapa and rechazo_motivo tracking. (6) Region scope restrictions work perfectly - coordinador R2 cannot see/act on R1 expenses (403), líderes only see own expenses. (7) Role restrictions enforced correctly - all unauthorized actions return 403. (8) PDF generation works (3747 bytes, application/pdf). (9) Dashboard returns complete KPI structure with filters working correctly. NO ISSUES FOUND. All authentication, authorization, workflow transitions, region scoping, and role restrictions working as expected."
  - agent: "main"
    message: "REFACTOR unificación de técnicos. Cambios backend a probar: (1) Usuarios ahora tienen campo 'documento' (=login username). POST /api/users acepta {documento,name,role,region,ciudad,password} y crea username=documento; login funciona con ese documento. (2) Nuevo rol 'tecnico'. (3) Migración: conductores -> usuarios rol tecnico (52), y espejo en tool_technicians (mismo id). (4) GET /api/modules/tecnicos devuelve usuarios rol tecnico [{id,nombre,documento,ciudad}]. (5) Al crear/editar/eliminar un usuario rol tecnico, se sincroniza db.tool_technicians (mismo id) -> GET /api/tools/technicians debe reflejarlo. Probar: (a) crear usuario role=tecnico con documento X -> aparece en GET /api/tools/technicians y GET /api/modules/tecnicos; login con X + password funciona. (b) editar su nombre/ciudad -> se refleja en /api/tools/technicians. (c) eliminarlo -> desaparece de /api/tools/technicians. (d) crear usuario role=lider con documento -> login por documento OK. (e) asignación de herramientas: POST /api/tools/assignments/batch con destination_type='technician' y technician_id = id de un usuario tecnico existente (tómalo de /api/tools/technicians) + tool_ids (usa GET /api/tools/tools; si no hay, crea una con POST /api/tools/tools) -> 200; y destination_type='warehouse' con warehouse_id de GET /api/tools/warehouses -> 200. (f) GET /api/tools/assignments/current o report_current debe mostrar technician_nombre para asignaciones a técnicos. Credenciales admin aeortega/admin123. Técnicos migrados usan password indurama123. NO probar Vehículos CRUD ni Gastos (ya probados)."
  - agent: "testing"
    message: "TECHNICIAN UNIFICATION REFACTOR TESTING COMPLETED - ALL 10 TESTS PASSED ✅. Comprehensive testing of the unified user/technician system completed successfully. Test results: (0) Admin login successful (200). (1) GET /api/modules/tecnicos returns 52 tecnico users with correct structure {id, nombre, documento, ciudad} (200). (2) GET /api/tools/technicians returns 52 technicians with correct structure {id, codigo, nombre, apellido, ciudad} (200). (3) Create tecnico user successful - user created with documento TEST99999, appears in both /api/tools/technicians and /api/modules/tecnicos, login with TEST99999/clave123 works with role=tecnico (all 200). (4) Edit tecnico user successful - name and ciudad updated, changes correctly reflected in /api/tools/technicians (sync function splits name into nombre/apellido as designed) (200). (5) Delete tecnico user successful - user removed from /api/tools/technicians (200). (6) Create lider user successful - user created with documento LID12345, login works with role=lider, correctly does NOT appear in /api/tools/technicians (200). (7) Migrated tecnico login successful - logged in with documento '0924098098' and password 'indurama123' with role=tecnico (200). (8) Tool assignment to technician successful - assignment created, technician_nombre shows in /api/tools/reports/current (200). (9) Tool assignment to warehouse successful - assignment created (200). NO ISSUES FOUND. All authentication, user CRUD, documento-based login, technician mirroring (sync function working correctly), and tool assignment functionality working as expected."
  - agent: "testing"
    message: "GASTOS MODULE EMAIL NOTIFICATIONS REGRESSION TEST COMPLETED - ALL 8 STEPS PASSED ✅. Tested the full workflow with email notifications and secure PDF download links after adding email notification feature. CRITICAL FINDING: Email notifications do NOT break the workflow - all endpoints still return 200 status codes as required. Test results: (1) Login jelaje (líder R1), create expense with necesita_presupuesto=true (cuenta_codigo: 61035001, proveedor: Prov Test, monto: 900) -> 200, estado pend_coordinador, expense SG-0003 created. (2) Login jullaguari (coordinador R1), approve via coordinator-decision -> 200, estado pend_presupuesto. (3) Login memejia (tesorero), assign budget (monto: 900) -> 200, estado pend_factura. (4) Login jelaje, upload invoice (url_factura, numero_solped: SOLPED-1, monto_factura: 880) -> 200, estado pend_aprob_coordinador. (5) Login jullaguari, approve via coordinator-final -> 200, estado pend_aprob_gerencia. (6) Login gerente, approve via manager-decision -> 200, estado aprobado. (7) Rejection flow tested - created new expense SG-0004, jullaguari rejected with comentario 'no' -> 200, estado rechazado. (8) Secure PDF download tested - authenticated GET /api/expenses/{id}/pdf as admin -> 200, application/pdf, 3688 bytes; public GET /api/expenses/pdf/download?token=BAD_TOKEN -> 403 (invalid token correctly rejected). Backend logs confirm email notifications are being sent at each stage transition (multiple 202 Accepted responses from email service to delivered@resend.dev test addresses, some 429 rate limits but these don't break the flow). Email service integration working correctly. NO ISSUES FOUND. All workflow transitions, email notifications, and secure PDF links working as expected."
