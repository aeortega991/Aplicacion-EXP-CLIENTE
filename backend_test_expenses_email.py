#!/usr/bin/env python3
"""
Backend API Testing - Gastos Module Email Notifications Regression Test
Tests the full workflow with email notifications and secure PDF download links
"""

import requests
import json
import sys
from typing import Optional

# Load backend URL from frontend/.env
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BASE_URL = line.split('=', 1)[1].strip()
            break

API_BASE = f"{BASE_URL}/api"

# Test credentials (from test_credentials.md)
USERS = {
    "jelaje": {"username": "jelaje", "password": "indurama123", "role": "lider"},
    "jullaguari": {"username": "jullaguari", "password": "indurama123", "role": "coordinador"},
    "memejia": {"username": "memejia", "password": "indurama123", "role": "tesorero"},
    "gerente": {"username": "gerente", "password": "indurama123", "role": "gerente"},
    "admin": {"username": "aeortega", "password": "admin123", "role": "admin"}
}

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def log_test(step_num: str, description: str):
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}STEP {step_num}: {description}{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")

def log_pass(message: str):
    print(f"{GREEN}✓ PASS: {message}{RESET}")

def log_fail(message: str):
    print(f"{RED}✗ FAIL: {message}{RESET}")

def log_info(message: str):
    print(f"{YELLOW}ℹ INFO: {message}{RESET}")

def make_request(method: str, endpoint: str, token: Optional[str] = None, json_data: dict = None, params: dict = None):
    """Make HTTP request and return response"""
    url = f"{API_BASE}{endpoint}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, params=params, timeout=10)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=json_data, timeout=10)
        elif method == "PATCH":
            resp = requests.patch(url, headers=headers, json=json_data, timeout=10)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers, timeout=10)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        log_info(f"{method} {endpoint} -> {resp.status_code}")
        return resp
    except Exception as e:
        log_fail(f"Request failed: {e}")
        return None

def login(username: str) -> Optional[str]:
    """Login and return token"""
    user_info = USERS.get(username)
    if not user_info:
        log_fail(f"Unknown user: {username}")
        return None
    
    resp = make_request("POST", "/auth/login", json_data={
        "username": user_info["username"],
        "password": user_info["password"]
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"Login failed for {username} with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return None
    
    data = resp.json()
    token = data.get("token")
    role = data.get("user", {}).get("role")
    
    if not token:
        log_fail(f"No token in login response for {username}")
        return None
    
    log_pass(f"Logged in as {username} (role: {role})")
    return token

# Global variables
expense_id_1 = None
expense_id_2 = None

def step_1_create_expense():
    """Step 1: Login as jelaje and create expense with necesita_presupuesto=true"""
    global expense_id_1
    
    log_test("1", "Login jelaje and create expense (necesita_presupuesto=true)")
    
    # Login
    token = login("jelaje")
    if not token:
        return False
    
    # Get meta to pick a cuenta_codigo
    resp = make_request("GET", "/expenses/meta", token=token)
    if not resp or resp.status_code != 200:
        log_fail(f"GET /api/expenses/meta failed with status {resp.status_code if resp else 'N/A'}")
        return False
    
    meta = resp.json()
    accounts = meta.get("accounts", [])
    if not accounts:
        log_fail("No accounts available")
        return False
    
    cuenta_codigo = accounts[0].get("codigo")
    log_info(f"Using cuenta_codigo: {cuenta_codigo}")
    
    # Create expense
    resp = make_request("POST", "/expenses", token=token, json_data={
        "cuenta_codigo": cuenta_codigo,
        "proveedor": "Prov Test",
        "fecha": "2026-03-01",
        "monto": 900,
        "necesita_presupuesto": True,
        "url_cotizacion": "https://example.com/cot.pdf",
        "descripcion": "test"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"POST /api/expenses failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    expense = resp.json()
    expense_id_1 = expense.get("id")
    numero = expense.get("numero")
    estado = expense.get("estado")
    
    if estado != "pend_coordinador":
        log_fail(f"Expected estado 'pend_coordinador', got '{estado}'")
        return False
    
    log_pass(f"Expense created: {numero} (id: {expense_id_1}, estado: {estado})")
    return True

def step_2_coordinator_approve():
    """Step 2: Login as jullaguari and approve (should go to pend_presupuesto)"""
    log_test("2", "Login jullaguari and approve (coordinator-decision)")
    
    # Login
    token = login("jullaguari")
    if not token:
        return False
    
    # Approve
    resp = make_request("POST", f"/expenses/{expense_id_1}/coordinator-decision", token=token, json_data={
        "decision": "aprobar"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"POST /api/expenses/{expense_id_1}/coordinator-decision failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    result = resp.json()
    estado = result.get("estado")
    
    if estado != "pend_presupuesto":
        log_fail(f"Expected estado 'pend_presupuesto', got '{estado}'")
        return False
    
    log_pass(f"Coordinator approved. New estado: {estado}")
    return True

def step_3_assign_budget():
    """Step 3: Login as memejia (tesorero) and assign budget"""
    log_test("3", "Login memejia and assign budget")
    
    # Login
    token = login("memejia")
    if not token:
        return False
    
    # Assign budget
    resp = make_request("POST", f"/expenses/{expense_id_1}/assign-budget", token=token, json_data={
        "monto_presupuesto": 900,
        "comentario": "ok"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"POST /api/expenses/{expense_id_1}/assign-budget failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    result = resp.json()
    estado = result.get("estado")
    
    if estado != "pend_factura":
        log_fail(f"Expected estado 'pend_factura', got '{estado}'")
        return False
    
    log_pass(f"Budget assigned. New estado: {estado}")
    return True

def step_4_upload_invoice():
    """Step 4: Login as jelaje and upload invoice"""
    log_test("4", "Login jelaje and upload invoice")
    
    # Login
    token = login("jelaje")
    if not token:
        return False
    
    # Upload invoice
    resp = make_request("POST", f"/expenses/{expense_id_1}/invoice", token=token, json_data={
        "url_factura": "https://example.com/fac.pdf",
        "numero_solped": "SOLPED-1",
        "fecha_gasto": "2026-03-05",
        "monto_factura": 880
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"POST /api/expenses/{expense_id_1}/invoice failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    result = resp.json()
    estado = result.get("estado")
    
    if estado != "pend_aprob_coordinador":
        log_fail(f"Expected estado 'pend_aprob_coordinador', got '{estado}'")
        return False
    
    log_pass(f"Invoice uploaded. New estado: {estado}")
    return True

def step_5_coordinator_final_approve():
    """Step 5: Login as jullaguari and approve final (coordinator-final)"""
    log_test("5", "Login jullaguari and approve final (coordinator-final)")
    
    # Login
    token = login("jullaguari")
    if not token:
        return False
    
    # Approve final
    resp = make_request("POST", f"/expenses/{expense_id_1}/coordinator-final", token=token, json_data={
        "decision": "aprobar"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"POST /api/expenses/{expense_id_1}/coordinator-final failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    result = resp.json()
    estado = result.get("estado")
    
    if estado != "pend_aprob_gerencia":
        log_fail(f"Expected estado 'pend_aprob_gerencia', got '{estado}'")
        return False
    
    log_pass(f"Coordinator final approved. New estado: {estado}")
    return True

def step_6_manager_approve():
    """Step 6: Login as gerente and approve (manager-decision)"""
    log_test("6", "Login gerente and approve (manager-decision)")
    
    # Login
    token = login("gerente")
    if not token:
        return False
    
    # Approve
    resp = make_request("POST", f"/expenses/{expense_id_1}/manager-decision", token=token, json_data={
        "decision": "aprobar"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"POST /api/expenses/{expense_id_1}/manager-decision failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    result = resp.json()
    estado = result.get("estado")
    
    if estado != "aprobado":
        log_fail(f"Expected estado 'aprobado', got '{estado}'")
        return False
    
    log_pass(f"Manager approved. Final estado: {estado}")
    return True

def step_7_rejection_flow():
    """Step 7: Test rejection flow - create expense as jelaje, reject as jullaguari"""
    global expense_id_2
    
    log_test("7", "Test rejection flow (create + reject)")
    
    # Login as jelaje
    token_jelaje = login("jelaje")
    if not token_jelaje:
        return False
    
    # Get meta
    resp = make_request("GET", "/expenses/meta", token=token_jelaje)
    if not resp or resp.status_code != 200:
        log_fail("GET /api/expenses/meta failed")
        return False
    
    meta = resp.json()
    cuenta_codigo = meta.get("accounts", [])[0].get("codigo")
    
    # Create expense
    resp = make_request("POST", "/expenses", token=token_jelaje, json_data={
        "cuenta_codigo": cuenta_codigo,
        "proveedor": "Prov Reject Test",
        "fecha": "2026-03-02",
        "monto": 500,
        "necesita_presupuesto": False,
        "url_cotizacion": "https://example.com/cot2.pdf",
        "descripcion": "test rejection"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"POST /api/expenses failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    expense = resp.json()
    expense_id_2 = expense.get("id")
    numero = expense.get("numero")
    log_pass(f"Expense created for rejection test: {numero} (id: {expense_id_2})")
    
    # Login as jullaguari
    token_coord = login("jullaguari")
    if not token_coord:
        return False
    
    # Reject
    resp = make_request("POST", f"/expenses/{expense_id_2}/coordinator-decision", token=token_coord, json_data={
        "decision": "rechazar",
        "comentario": "no"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"POST /api/expenses/{expense_id_2}/coordinator-decision failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    result = resp.json()
    estado = result.get("estado")
    
    if estado != "rechazado":
        log_fail(f"Expected estado 'rechazado', got '{estado}'")
        return False
    
    log_pass(f"Expense rejected successfully. Estado: {estado}")
    return True

def step_8_pdf_download():
    """Step 8: Test secure PDF download (authenticated and invalid token)"""
    log_test("8", "Test secure PDF download")
    
    # Login as admin
    token = login("admin")
    if not token:
        return False
    
    # Test authenticated PDF download
    resp = make_request("GET", f"/expenses/{expense_id_1}/pdf", token=token)
    
    if not resp or resp.status_code != 200:
        log_fail(f"GET /api/expenses/{expense_id_1}/pdf failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    content_type = resp.headers.get("Content-Type", "")
    if "application/pdf" not in content_type:
        log_fail(f"Expected Content-Type 'application/pdf', got '{content_type}'")
        return False
    
    pdf_size = len(resp.content)
    log_pass(f"Authenticated PDF download successful. Size: {pdf_size} bytes, Content-Type: {content_type}")
    
    # Test invalid token for public PDF endpoint
    resp = make_request("GET", "/expenses/pdf/download", params={"token": "BAD_TOKEN"})
    
    if resp is None:
        log_fail("Request to public PDF endpoint failed")
        return False
    
    if resp.status_code != 403:
        log_fail(f"Expected status 403 for invalid token, got {resp.status_code}")
        return False
    
    log_pass(f"Invalid token correctly rejected with status 403")
    return True

def main():
    """Run all tests"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}GASTOS MODULE - EMAIL NOTIFICATIONS REGRESSION TEST{RESET}")
    print(f"{BLUE}Base URL: {API_BASE}{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    tests = [
        ("1", "Create expense (jelaje)", step_1_create_expense),
        ("2", "Coordinator approve (jullaguari)", step_2_coordinator_approve),
        ("3", "Assign budget (memejia)", step_3_assign_budget),
        ("4", "Upload invoice (jelaje)", step_4_upload_invoice),
        ("5", "Coordinator final approve (jullaguari)", step_5_coordinator_final_approve),
        ("6", "Manager approve (gerente)", step_6_manager_approve),
        ("7", "Rejection flow", step_7_rejection_flow),
        ("8", "Secure PDF download", step_8_pdf_download),
    ]
    
    results = []
    for step_num, step_name, test_func in tests:
        try:
            result = test_func()
            results.append((step_num, step_name, result))
            if not result:
                log_fail(f"Step {step_num} failed. Stopping test execution.")
                break
        except Exception as e:
            log_fail(f"Step {step_num} crashed: {e}")
            import traceback
            traceback.print_exc()
            results.append((step_num, step_name, False))
            break
    
    # Summary
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    passed = sum(1 for _, _, result in results if result)
    total = len(results)
    
    for step_num, step_name, result in results:
        status = f"{GREEN}✓ PASS{RESET}" if result else f"{RED}✗ FAIL{RESET}"
        print(f"Step {step_num} ({step_name}): {status}")
    
    print(f"\n{BLUE}Total: {passed}/{total} steps passed{RESET}")
    
    if passed == total:
        print(f"{GREEN}{'='*80}{RESET}")
        print(f"{GREEN}ALL TESTS PASSED ✓{RESET}")
        print(f"{GREEN}{'='*80}{RESET}")
        return 0
    else:
        print(f"{RED}{'='*80}{RESET}")
        print(f"{RED}SOME TESTS FAILED ✗{RESET}")
        print(f"{RED}{'='*80}{RESET}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
