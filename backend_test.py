#!/usr/bin/env python3
"""
Backend API Testing - Technician Unification Refactor
Tests the unified user/technician system with documento-based login
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

# Test credentials
ADMIN_USER = "aeortega"
ADMIN_PASS = "admin123"

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def log_test(test_num: str, description: str):
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST {test_num}: {description}{RESET}")
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

# Global variables to store test data
admin_token = None
test_tecnico_id = None
test_lider_id = None
test_tool_id = None
test_warehouse_id = None

def test_0_admin_login():
    """Test 0: Admin login with aeortega/admin123"""
    global admin_token
    
    log_test("0", "Admin Login (aeortega/admin123)")
    
    resp = make_request("POST", "/auth/login", json_data={
        "username": ADMIN_USER,
        "password": ADMIN_PASS
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"Login failed with status {resp.status_code if resp else 'N/A'}")
        return False
    
    data = resp.json()
    if "token" not in data:
        log_fail("No token in response")
        return False
    
    admin_token = data["token"]
    user_data = data.get("user", {})
    
    if user_data.get("role") != "admin":
        log_fail(f"Expected role 'admin', got '{user_data.get('role')}'")
        return False
    
    log_pass(f"Admin login successful. Token received. Role: {user_data.get('role')}")
    return True

def test_1_get_tecnicos():
    """Test 1: GET /api/modules/tecnicos returns list of tecnico users (~52)"""
    log_test("1", "GET /api/modules/tecnicos (expect ~52 tecnico users)")
    
    resp = make_request("GET", "/modules/tecnicos", token=admin_token)
    
    if not resp or resp.status_code != 200:
        log_fail(f"GET /api/modules/tecnicos failed with status {resp.status_code if resp else 'N/A'}")
        return False
    
    tecnicos = resp.json()
    count = len(tecnicos)
    
    log_pass(f"GET /api/modules/tecnicos returned {count} tecnico users")
    
    # Verify structure
    if tecnicos:
        sample = tecnicos[0]
        required_fields = ["id", "nombre", "documento", "ciudad"]
        for field in required_fields:
            if field not in sample:
                log_fail(f"Missing required field '{field}' in tecnico object")
                return False
        log_pass(f"Tecnico structure verified: {required_fields}")
    
    if count < 40:
        log_fail(f"Expected ~52 tecnicos, got {count}")
        return False
    
    return True

def test_2_get_technicians():
    """Test 2: GET /api/tools/technicians returns technicians (~52)"""
    log_test("2", "GET /api/tools/technicians (expect ~52 technicians)")
    
    resp = make_request("GET", "/tools/technicians", token=admin_token)
    
    if not resp or resp.status_code != 200:
        log_fail(f"GET /api/tools/technicians failed with status {resp.status_code if resp else 'N/A'}")
        return False
    
    technicians = resp.json()
    count = len(technicians)
    
    log_pass(f"GET /api/tools/technicians returned {count} technicians")
    
    # Verify structure
    if technicians:
        sample = technicians[0]
        required_fields = ["id", "codigo", "nombre", "apellido", "ciudad"]
        for field in required_fields:
            if field not in sample:
                log_fail(f"Missing required field '{field}' in technician object")
                return False
        log_pass(f"Technician structure verified: {required_fields}")
    
    if count < 40:
        log_fail(f"Expected ~52 technicians, got {count}")
        return False
    
    return True

def test_3_create_tecnico():
    """Test 3: Create tecnico user with documento TEST99999"""
    global test_tecnico_id
    
    log_test("3", "Create Tecnico User (documento: TEST99999)")
    
    # Create user
    resp = make_request("POST", "/users", token=admin_token, json_data={
        "documento": "TEST99999",
        "name": "Tecnico Prueba",
        "role": "tecnico",
        "ciudad": "QUITO",
        "password": "clave123"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"User creation failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    user_data = resp.json()
    test_tecnico_id = user_data.get("id")
    log_pass(f"User created with id: {test_tecnico_id}")
    
    # Verify in /api/tools/technicians
    resp = make_request("GET", "/tools/technicians", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get technicians list")
        return False
    
    technicians = resp.json()
    found_in_tools = False
    for tech in technicians:
        if tech.get("id") == test_tecnico_id:
            found_in_tools = True
            log_pass(f"Technician found in /api/tools/technicians: {tech.get('nombre')} (codigo: {tech.get('codigo')})")
            break
    
    if not found_in_tools:
        log_fail("Technician NOT found in /api/tools/technicians")
        return False
    
    # Verify in /api/modules/tecnicos
    resp = make_request("GET", "/modules/tecnicos", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get tecnicos module")
        return False
    
    tecnicos = resp.json()
    found_in_module = False
    for tec in tecnicos:
        if tec.get("documento") == "TEST99999":
            found_in_module = True
            log_pass(f"Tecnico found in /api/modules/tecnicos: {tec.get('nombre')} (documento: {tec.get('documento')})")
            break
    
    if not found_in_module:
        log_fail("Tecnico NOT found in /api/modules/tecnicos")
        return False
    
    # Test login with documento
    resp = make_request("POST", "/auth/login", json_data={
        "username": "TEST99999",
        "password": "clave123"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"Login with username 'TEST99999' failed")
        return False
    
    login_data = resp.json()
    if login_data.get("user", {}).get("role") != "tecnico":
        log_fail(f"Expected role 'tecnico', got '{login_data.get('user', {}).get('role')}'")
        return False
    
    log_pass(f"Login successful with username 'TEST99999' (role: tecnico)")
    
    return True

def test_4_edit_tecnico():
    """Test 4: Edit tecnico user and verify changes in /api/tools/technicians"""
    log_test("4", "Edit Tecnico User (update name and ciudad to CUENCA)")
    
    if not test_tecnico_id:
        log_fail("No tecnico ID available from previous test")
        return False
    
    # Edit user
    resp = make_request("PATCH", f"/users/{test_tecnico_id}", token=admin_token, json_data={
        "name": "Tecnico Editado",
        "ciudad": "CUENCA"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"User update failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    log_pass("User updated successfully")
    
    # Verify changes in /api/tools/technicians
    resp = make_request("GET", "/tools/technicians", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get technicians list")
        return False
    
    technicians = resp.json()
    found = False
    for tech in technicians:
        if tech.get("id") == test_tecnico_id:
            found = True
            nombre = tech.get("nombre", "")
            apellido = tech.get("apellido", "")
            ciudad = tech.get("ciudad", "")
            full_name = f"{nombre} {apellido}".strip()
            
            # The sync function splits name into nombre (first word) and apellido (rest)
            # So "Tecnico Editado" becomes nombre="Tecnico", apellido="Editado"
            if "Editado" in full_name or "Editado" in apellido:
                log_pass(f"Updated name reflected in technician: {full_name}")
            else:
                log_fail(f"Name not updated correctly. Expected 'Editado' in name, got: {full_name}")
                return False
            
            if ciudad == "CUENCA":
                log_pass(f"Updated ciudad found in technician: {ciudad}")
            else:
                log_fail(f"Ciudad not updated correctly. Expected 'CUENCA', got: {ciudad}")
                return False
            break
    
    if not found:
        log_fail(f"Technician with id {test_tecnico_id} not found in /api/tools/technicians")
        return False
    
    return True

def test_6_create_lider():
    """Test 6: Create lider user with documento LID12345 and verify it does NOT appear in /api/tools/technicians"""
    global test_lider_id
    
    log_test("6", "Create Lider User (documento: LID12345) - should NOT appear in technicians")
    
    # Create user
    resp = make_request("POST", "/users", token=admin_token, json_data={
        "documento": "LID12345",
        "name": "Lider Doc",
        "role": "lider",
        "region": "R1",
        "ciudad": "AMBATO",
        "password": "clave123"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"User creation failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    user_data = resp.json()
    test_lider_id = user_data.get("id")
    log_pass(f"Lider user created with id: {test_lider_id}")
    
    # Test login with documento
    resp = make_request("POST", "/auth/login", json_data={
        "username": "LID12345",
        "password": "clave123"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"Login with LID12345 failed")
        return False
    
    login_data = resp.json()
    if login_data.get("user", {}).get("role") != "lider":
        log_fail(f"Expected role 'lider', got '{login_data.get('user', {}).get('role')}'")
        return False
    
    log_pass(f"Login successful with username 'LID12345' (role: lider)")
    
    # Verify it does NOT appear in /api/tools/technicians
    resp = make_request("GET", "/tools/technicians", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get technicians list")
        return False
    
    technicians = resp.json()
    found = False
    for tech in technicians:
        if tech.get("id") == test_lider_id or tech.get("codigo") == "LID12345":
            found = True
            break
    
    if found:
        log_fail("Lider user incorrectly appears in /api/tools/technicians")
        return False
    
    log_pass("Lider user correctly does NOT appear in /api/tools/technicians")
    return True

def test_8_tool_assignment_technician():
    """Test 8: Assign tool to technician"""
    global test_tool_id
    
    log_test("8", "Tool Assignment to Technician")
    
    # Get a real technician from /api/tools/technicians
    resp = make_request("GET", "/tools/technicians", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get technicians list")
        return False
    
    technicians = resp.json()
    if not technicians:
        log_fail("No technicians available")
        return False
    
    # Use the first technician
    tech_id = technicians[0].get("id")
    tech_name = technicians[0].get("nombre")
    log_info(f"Using technician: {tech_name} (id: {tech_id})")
    
    # Get existing tools
    resp = make_request("GET", "/tools/tools", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get tools list")
        return False
    
    tools = resp.json()
    active_tools = [t for t in tools if t.get("estado") == "Activa"]
    
    # If no active tools, create one
    if not active_tools:
        log_info("No active tools found, creating one...")
        resp = make_request("POST", "/tools/tools", token=admin_token, json_data={
            "marca": "Taladro Test",
            "modelo": "TD-2000",
            "fecha_compra": "2026-01-10",
            "valor": 150.00
        })
        
        if not resp or resp.status_code != 200:
            log_fail("Failed to create tool")
            return False
        
        tool_data = resp.json()
        test_tool_id = tool_data.get("id")
        log_pass(f"Tool created with id: {test_tool_id}")
    else:
        # Find an unassigned tool
        test_tool_id = None
        for tool in active_tools:
            # Check if tool is already assigned
            resp = make_request("GET", "/tools/assignments", token=admin_token)
            if resp and resp.status_code == 200:
                assignments = resp.json()
                assigned_tool_ids = [a.get("tool_id") for a in assignments if a.get("estado") == "Vigente"]
                if tool.get("id") not in assigned_tool_ids:
                    test_tool_id = tool.get("id")
                    break
        
        if not test_tool_id:
            # All tools are assigned, create a new one
            log_info("All tools are assigned, creating a new one...")
            resp = make_request("POST", "/tools/tools", token=admin_token, json_data={
                "marca": "Taladro Test",
                "modelo": "TD-2000",
                "fecha_compra": "2026-01-10",
                "valor": 150.00
            })
            
            if not resp or resp.status_code != 200:
                log_fail("Failed to create tool")
                return False
            
            tool_data = resp.json()
            test_tool_id = tool_data.get("id")
            log_pass(f"Tool created with id: {test_tool_id}")
        else:
            log_info(f"Using existing unassigned tool with id: {test_tool_id}")
    
    # Assign tool to technician
    resp = make_request("POST", "/tools/assignments/batch", token=admin_token, json_data={
        "destination_type": "technician",
        "technician_id": tech_id,
        "tool_ids": [test_tool_id]
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"Tool assignment failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    assignment_data = resp.json()
    batch_id = assignment_data.get("batch_id")
    log_pass(f"Tool assigned successfully. Batch ID: {batch_id}")
    log_info(f"Total herramientas: {assignment_data.get('total_herramientas')}")
    log_info(f"Valor total: ${assignment_data.get('valor_total')}")
    
    # Verify assignment shows technician_nombre
    resp = make_request("GET", "/tools/reports/current", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get current assignments report")
        return False
    
    assignments = resp.json()
    found = False
    for assignment in assignments:
        if assignment.get("tool_id") == test_tool_id:
            found = True
            tech_nombre = assignment.get("technician_nombre")
            if tech_nombre:
                log_pass(f"Assignment found with technician_nombre: {tech_nombre}")
            else:
                log_fail("Assignment found but technician_nombre is missing")
                return False
            break
    
    if not found:
        log_fail("Assignment not found in current report")
        return False
    
    return True

def test_9_tool_assignment_warehouse():
    """Test 9: Assign tool to warehouse"""
    global test_warehouse_id
    
    log_test("9", "Tool Assignment to Warehouse")
    
    # Get warehouses
    resp = make_request("GET", "/tools/warehouses", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get warehouses list")
        return False
    
    warehouses = resp.json()
    if not warehouses:
        log_fail("No warehouses available")
        return False
    
    test_warehouse_id = warehouses[0].get("id")
    log_info(f"Using warehouse: {warehouses[0].get('nombre')} (id: {test_warehouse_id})")
    
    # Create another tool for warehouse assignment
    resp = make_request("POST", "/tools/tools", token=admin_token, json_data={
        "marca": "Martillo Test",
        "modelo": "MT-500",
        "fecha_compra": "2026-01-10",
        "valor": 75.00
    })
    
    if not resp or resp.status_code != 200:
        log_fail("Failed to create tool for warehouse")
        return False
    
    warehouse_tool_id = resp.json().get("id")
    log_pass(f"Tool created for warehouse with id: {warehouse_tool_id}")
    
    # Assign tool to warehouse
    resp = make_request("POST", "/tools/assignments/batch", token=admin_token, json_data={
        "destination_type": "warehouse",
        "warehouse_id": test_warehouse_id,
        "tool_ids": [warehouse_tool_id]
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"Warehouse assignment failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    assignment_data = resp.json()
    batch_id = assignment_data.get("batch_id")
    log_pass(f"Tool assigned to warehouse successfully. Batch ID: {batch_id}")
    log_info(f"Total herramientas: {assignment_data.get('total_herramientas')}")
    log_info(f"Valor total: ${assignment_data.get('valor_total')}")
    
    return True

def test_5_delete_tecnico():
    """Test 5: Delete tecnico user and verify removal from /api/tools/technicians"""
    log_test("5", "Delete Tecnico User (TEST99999)")
    
    if not test_tecnico_id:
        log_fail("No tecnico ID available")
        return False
    
    # Delete user
    resp = make_request("DELETE", f"/users/{test_tecnico_id}", token=admin_token)
    
    if not resp or resp.status_code != 200:
        log_fail(f"User deletion failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    log_pass("User deleted successfully")
    
    # Verify removal from /api/tools/technicians
    resp = make_request("GET", "/tools/technicians", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get technicians list")
        return False
    
    technicians = resp.json()
    found = False
    for tech in technicians:
        if tech.get("id") == test_tecnico_id or tech.get("codigo") == "TEST99999":
            found = True
            break
    
    if found:
        log_fail("Technician still present in /api/tools/technicians after deletion")
        return False
    
    log_pass("Technician successfully removed from /api/tools/technicians")
    return True

def test_7_migrated_tecnico_login():
    """Test 7: Login with migrated tecnico using indurama123 password"""
    log_test("7", "Migrated Tecnico Login (indurama123)")
    
    # Get a migrated tecnico from /api/modules/tecnicos
    resp = make_request("GET", "/modules/tecnicos", token=admin_token)
    if not resp or resp.status_code != 200:
        log_fail("Failed to get tecnicos module")
        return False
    
    tecnicos = resp.json()
    if not tecnicos:
        log_fail("No tecnicos available for testing")
        return False
    
    # Pick the first tecnico
    test_tecnico = tecnicos[0]
    documento = test_tecnico.get("documento")
    
    if not documento:
        log_fail("Tecnico has no documento")
        return False
    
    log_info(f"Testing login with migrated tecnico: {test_tecnico.get('nombre')} (documento: {documento})")
    
    # Try login with indurama123
    resp = make_request("POST", "/auth/login", json_data={
        "username": documento,
        "password": "indurama123"
    })
    
    if not resp or resp.status_code != 200:
        log_fail(f"Login failed with status {resp.status_code if resp else 'N/A'}")
        if resp:
            log_info(f"Response: {resp.text}")
        return False
    
    login_data = resp.json()
    if login_data.get("user", {}).get("role") != "tecnico":
        log_fail(f"Expected role 'tecnico', got '{login_data.get('user', {}).get('role')}'")
        return False
    
    log_pass(f"Migrated tecnico login successful with documento '{documento}' and password 'indurama123' (role: tecnico)")
    return True

def cleanup():
    """Cleanup: Delete test users created during testing"""
    log_test("CLEANUP", "Deleting test users")
    
    # Delete lider if created
    if test_lider_id:
        resp = make_request("DELETE", f"/users/{test_lider_id}", token=admin_token)
        if resp and resp.status_code == 200:
            log_pass(f"Deleted lider user (LID12345)")
        else:
            log_info(f"Could not delete lider user (may have been deleted already)")
    
    log_info("Cleanup completed")

def main():
    """Run all tests"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}BACKEND API TESTING - TECHNICIAN UNIFICATION REFACTOR{RESET}")
    print(f"{BLUE}Base URL: {API_BASE}{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    tests = [
        ("0", "Admin Login", test_0_admin_login),
        ("1", "GET /api/modules/tecnicos", test_1_get_tecnicos),
        ("2", "GET /api/tools/technicians", test_2_get_technicians),
        ("3", "Create Tecnico User", test_3_create_tecnico),
        ("4", "Edit Tecnico User", test_4_edit_tecnico),
        ("5", "Delete Tecnico User", test_5_delete_tecnico),
        ("6", "Create Lider User (NOT in technicians)", test_6_create_lider),
        ("7", "Migrated Tecnico Login", test_7_migrated_tecnico_login),
        ("8", "Tool Assignment to Technician", test_8_tool_assignment_technician),
        ("9", "Tool Assignment to Warehouse", test_9_tool_assignment_warehouse),
    ]
    
    results = []
    for test_num, test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_num, test_name, result))
        except Exception as e:
            log_fail(f"Test {test_num} crashed: {e}")
            results.append((test_num, test_name, False))
    
    # Cleanup
    try:
        cleanup()
    except Exception as e:
        log_info(f"Cleanup failed: {e}")
    
    # Summary
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    passed = sum(1 for _, _, result in results if result)
    total = len(results)
    
    for test_num, test_name, result in results:
        status = f"{GREEN}✓ PASS{RESET}" if result else f"{RED}✗ FAIL{RESET}"
        print(f"Test {test_num} ({test_name}): {status}")
    
    print(f"\n{BLUE}Total: {passed}/{total} tests passed{RESET}")
    
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
