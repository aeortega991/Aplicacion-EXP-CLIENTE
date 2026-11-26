#!/usr/bin/env python3
"""
Backend API Tests for Expenses Module
Tests ONLY the expenses module endpoints
"""
import requests
import json
from datetime import datetime

# Base URL from frontend/.env
BASE_URL = "https://kickoff-now-12--1vypaz70.preview.emergentagent.com/api"

# Test credentials
USERS = {
    "admin": {"username": "aeortega", "password": "admin123"},
    "lider_r1_jelaje": {"username": "jelaje", "password": "indurama123"},
    "lider_r1_tgranda": {"username": "tgranda", "password": "indurama123"},
    "lider_r2_ambato": {"username": "ambato", "password": "indurama123"},
    "lider_r2_pmarin": {"username": "pmarin", "password": "indurama123"},
    "coordinador_r1": {"username": "jullaguari", "password": "indurama123"},
    "coordinador_r2": {"username": "tarias", "password": "indurama123"},
    "tesorero": {"username": "memejia", "password": "indurama123"},
    "gerente": {"username": "gerente", "password": "indurama123"},
}

# Store tokens and expense IDs for testing
tokens = {}
expense_ids = {}

def login(user_key):
    """Login and return token"""
    if user_key in tokens:
        return tokens[user_key]
    
    creds = USERS[user_key]
    resp = requests.post(f"{BASE_URL}/auth/login", json=creds)
    if resp.status_code != 200:
        print(f"❌ Login failed for {user_key}: {resp.status_code} - {resp.text}")
        return None
    
    data = resp.json()
    token = data.get("token")
    tokens[user_key] = token
    print(f"✅ Login successful for {user_key}")
    return token

def headers(user_key):
    """Get authorization headers"""
    token = login(user_key)
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}

def print_test(name):
    """Print test name"""
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def test_1_meta():
    """Test 1: GET /api/expenses/meta"""
    print_test("1. GET /api/expenses/meta - Metadata endpoint")
    
    resp = requests.get(f"{BASE_URL}/expenses/meta", headers=headers("lider_r1_jelaje"))
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    
    # Check accounts
    accounts = data.get("accounts", [])
    if len(accounts) != 33:
        print(f"❌ FAILED: Expected 33 accounts, got {len(accounts)}")
        return False
    
    # Check regions
    regions = data.get("regions", {})
    if "R1" not in regions or "R2" not in regions:
        print(f"❌ FAILED: Expected regions R1 and R2, got {list(regions.keys())}")
        return False
    
    # Check cities
    cities = data.get("cities", [])
    if not cities:
        print(f"❌ FAILED: Expected cities list, got empty")
        return False
    
    # Check estados
    estados = data.get("estados", {})
    if not estados:
        print(f"❌ FAILED: Expected estados dict, got empty")
        return False
    
    print(f"✅ PASSED: Meta endpoint returns {len(accounts)} accounts, regions {list(regions.keys())}, {len(cities)} cities, {len(estados)} estados")
    return True

def test_2_create_expense():
    """Test 2: Create expense as líder jelaje (R1)"""
    print_test("2. POST /api/expenses - Create expense as líder jelaje (R1)")
    
    # First get an account code
    meta_resp = requests.get(f"{BASE_URL}/expenses/meta", headers=headers("lider_r1_jelaje"))
    accounts = meta_resp.json().get("accounts", [])
    if not accounts:
        print("❌ FAILED: No accounts available")
        return False
    
    account_code = accounts[0]["codigo"]
    
    payload = {
        "cuenta_codigo": account_code,
        "proveedor": "Proveedor Test SA",
        "fecha": "2025-01-15",
        "monto": 1500.50,
        "necesita_presupuesto": True,
        "url_cotizacion": "https://example.com/cotizacion.pdf",
        "descripcion": "Compra de materiales para proyecto"
    }
    
    resp = requests.post(f"{BASE_URL}/expenses", json=payload, headers=headers("lider_r1_jelaje"))
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    
    # Verify response
    if data.get("estado") != "pend_coordinador":
        print(f"❌ FAILED: Expected estado 'pend_coordinador', got {data.get('estado')}")
        return False
    
    if not data.get("numero", "").startswith("SG-"):
        print(f"❌ FAILED: Expected numero starting with 'SG-', got {data.get('numero')}")
        return False
    
    if data.get("region") != "R1":
        print(f"❌ FAILED: Expected region 'R1', got {data.get('region')}")
        return False
    
    expense_ids["with_budget"] = data.get("id")
    print(f"✅ PASSED: Expense created with numero {data.get('numero')}, estado {data.get('estado')}, region {data.get('region')}")
    return True

def test_3_full_flow_with_budget():
    """Test 3: Full flow WITH budget"""
    print_test("3. Full flow WITH budget (coordinador -> tesorero -> líder -> coordinador -> gerente)")
    
    expense_id = expense_ids.get("with_budget")
    if not expense_id:
        print("❌ FAILED: No expense ID from test 2")
        return False
    
    # Step 1: Coordinador R1 approves
    print("\n  Step 1: Coordinador R1 (jullaguari) approves...")
    resp = requests.post(
        f"{BASE_URL}/expenses/{expense_id}/coordinator-decision",
        json={"decision": "aprobar", "comentario": "Aprobado por coordinador"},
        headers=headers("coordinador_r1")
    )
    
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    if data.get("estado") != "pend_presupuesto":
        print(f"  ❌ FAILED: Expected estado 'pend_presupuesto', got {data.get('estado')}")
        return False
    print(f"  ✅ Coordinador approved, estado: {data.get('estado')}")
    
    # Step 2: Tesorero assigns budget
    print("\n  Step 2: Tesorero (memejia) assigns budget...")
    resp = requests.post(
        f"{BASE_URL}/expenses/{expense_id}/assign-budget",
        json={"monto_presupuesto": 1600.00, "comentario": "Presupuesto asignado"},
        headers=headers("tesorero")
    )
    
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    if data.get("estado") != "pend_factura":
        print(f"  ❌ FAILED: Expected estado 'pend_factura', got {data.get('estado')}")
        return False
    print(f"  ✅ Budget assigned, estado: {data.get('estado')}")
    
    # Step 3: Líder uploads invoice
    print("\n  Step 3: Líder (jelaje) uploads invoice...")
    resp = requests.post(
        f"{BASE_URL}/expenses/{expense_id}/invoice",
        json={
            "url_factura": "https://example.com/factura.pdf",
            "numero_solped": "SOLPED-001",
            "fecha_gasto": "2025-01-20",
            "monto_factura": 1550.00
        },
        headers=headers("lider_r1_jelaje")
    )
    
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    if data.get("estado") != "pend_aprob_coordinador":
        print(f"  ❌ FAILED: Expected estado 'pend_aprob_coordinador', got {data.get('estado')}")
        return False
    print(f"  ✅ Invoice uploaded, estado: {data.get('estado')}")
    
    # Step 4: Coordinador final approval
    print("\n  Step 4: Coordinador R1 (jullaguari) final approval...")
    resp = requests.post(
        f"{BASE_URL}/expenses/{expense_id}/coordinator-final",
        json={"decision": "aprobar", "comentario": "Factura correcta"},
        headers=headers("coordinador_r1")
    )
    
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    if data.get("estado") != "pend_aprob_gerencia":
        print(f"  ❌ FAILED: Expected estado 'pend_aprob_gerencia', got {data.get('estado')}")
        return False
    print(f"  ✅ Coordinador final approved, estado: {data.get('estado')}")
    
    # Step 5: Gerente final approval
    print("\n  Step 5: Gerente approves...")
    resp = requests.post(
        f"{BASE_URL}/expenses/{expense_id}/manager-decision",
        json={"decision": "aprobar", "comentario": "Aprobado por gerencia"},
        headers=headers("gerente")
    )
    
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    if data.get("estado") != "aprobado":
        print(f"  ❌ FAILED: Expected estado 'aprobado', got {data.get('estado')}")
        return False
    print(f"  ✅ Gerente approved, estado: {data.get('estado')}")
    
    print("\n✅ PASSED: Full flow with budget completed successfully")
    return True

def test_4_flow_without_budget():
    """Test 4: Flow WITHOUT budget (skip tesorero)"""
    print_test("4. Flow WITHOUT budget - should skip tesorero")
    
    # Create expense without budget requirement
    meta_resp = requests.get(f"{BASE_URL}/expenses/meta", headers=headers("lider_r1_jelaje"))
    accounts = meta_resp.json().get("accounts", [])
    account_code = accounts[1]["codigo"] if len(accounts) > 1 else accounts[0]["codigo"]
    
    payload = {
        "cuenta_codigo": account_code,
        "proveedor": "Proveedor Sin Presupuesto SA",
        "fecha": "2025-01-16",
        "monto": 500.00,
        "necesita_presupuesto": False,
        "url_cotizacion": "https://example.com/cotizacion2.pdf",
        "descripcion": "Compra menor sin presupuesto"
    }
    
    resp = requests.post(f"{BASE_URL}/expenses", json=payload, headers=headers("lider_r1_jelaje"))
    if resp.status_code != 200:
        print(f"❌ FAILED: Could not create expense - {resp.status_code}")
        return False
    
    expense_id = resp.json().get("id")
    expense_ids["without_budget"] = expense_id
    
    # Coordinador approves - should go directly to pend_factura
    print("\n  Coordinador R1 (jullaguari) approves...")
    resp = requests.post(
        f"{BASE_URL}/expenses/{expense_id}/coordinator-decision",
        json={"decision": "aprobar", "comentario": "Aprobado sin presupuesto"},
        headers=headers("coordinador_r1")
    )
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    if data.get("estado") != "pend_factura":
        print(f"❌ FAILED: Expected estado 'pend_factura' (skipping tesorero), got {data.get('estado')}")
        return False
    
    print(f"✅ PASSED: Flow without budget skips tesorero, goes directly to pend_factura")
    return True

def test_5_rejection():
    """Test 5: Rejection flow"""
    print_test("5. Rejection flow - coordinador rejects")
    
    # Create another expense
    meta_resp = requests.get(f"{BASE_URL}/expenses/meta", headers=headers("lider_r1_jelaje"))
    accounts = meta_resp.json().get("accounts", [])
    account_code = accounts[2]["codigo"] if len(accounts) > 2 else accounts[0]["codigo"]
    
    payload = {
        "cuenta_codigo": account_code,
        "proveedor": "Proveedor Rechazado SA",
        "fecha": "2025-01-17",
        "monto": 2000.00,
        "necesita_presupuesto": True,
        "url_cotizacion": "https://example.com/cotizacion3.pdf",
        "descripcion": "Solicitud que será rechazada"
    }
    
    resp = requests.post(f"{BASE_URL}/expenses", json=payload, headers=headers("lider_r1_jelaje"))
    if resp.status_code != 200:
        print(f"❌ FAILED: Could not create expense - {resp.status_code}")
        return False
    
    expense_id = resp.json().get("id")
    expense_ids["rejected"] = expense_id
    
    # Coordinador rejects
    print("\n  Coordinador R1 (jullaguari) rejects...")
    resp = requests.post(
        f"{BASE_URL}/expenses/{expense_id}/coordinator-decision",
        json={"decision": "rechazar", "comentario": "Monto muy alto, no aprobado"},
        headers=headers("coordinador_r1")
    )
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    if data.get("estado") != "rechazado":
        print(f"❌ FAILED: Expected estado 'rechazado', got {data.get('estado')}")
        return False
    
    # Verify rejection details by getting the expense
    resp = requests.get(f"{BASE_URL}/expenses/{expense_id}", headers=headers("lider_r1_jelaje"))
    if resp.status_code == 200:
        exp_data = resp.json()
        if exp_data.get("rechazado_etapa"):
            print(f"  ✅ Rejection details: etapa={exp_data.get('rechazado_etapa')}, motivo={exp_data.get('rechazo_motivo')}")
    
    print(f"✅ PASSED: Expense rejected successfully")
    return True

def test_6_region_scope():
    """Test 6: Region scope restrictions"""
    print_test("6. Region scope - R2 coordinador should NOT see R1 expenses")
    
    # Get R1 expense ID
    r1_expense_id = expense_ids.get("with_budget")
    if not r1_expense_id:
        print("❌ FAILED: No R1 expense ID available")
        return False
    
    # Test 6a: Coordinador R2 lists expenses - should NOT include R1 expenses
    print("\n  Test 6a: Coordinador R2 (tarias) lists expenses...")
    resp = requests.get(f"{BASE_URL}/expenses", headers=headers("coordinador_r2"))
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code}")
        return False
    
    expenses = resp.json()
    r1_found = any(e.get("id") == r1_expense_id for e in expenses)
    if r1_found:
        print(f"  ❌ FAILED: Coordinador R2 can see R1 expense (should be filtered)")
        return False
    print(f"  ✅ Coordinador R2 cannot see R1 expenses (correct)")
    
    # Test 6b: Coordinador R2 tries to act on R1 expense - should get 403
    print("\n  Test 6b: Coordinador R2 (tarias) tries to approve R1 expense...")
    resp = requests.post(
        f"{BASE_URL}/expenses/{r1_expense_id}/coordinator-decision",
        json={"decision": "aprobar", "comentario": "Intento de aprobación cross-region"},
        headers=headers("coordinador_r2")
    )
    
    if resp.status_code != 403:
        print(f"  ❌ FAILED: Expected 403, got {resp.status_code}")
        return False
    print(f"  ✅ Coordinador R2 gets 403 when trying to act on R1 expense (correct)")
    
    # Test 6c: Líder jelaje lists expenses - should only see own
    print("\n  Test 6c: Líder jelaje lists expenses (should only see own)...")
    resp = requests.get(f"{BASE_URL}/expenses", headers=headers("lider_r1_jelaje"))
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code}")
        return False
    
    expenses = resp.json()
    # All expenses should be from jelaje
    non_own = [e for e in expenses if e.get("solicitante_username") != "jelaje"]
    if non_own:
        print(f"  ❌ FAILED: Líder jelaje can see other users' expenses")
        return False
    print(f"  ✅ Líder jelaje only sees own expenses (correct)")
    
    # Test 6d: Líder tgranda tries to access jelaje's expense - should get 403
    print("\n  Test 6d: Líder tgranda tries to access jelaje's expense...")
    resp = requests.get(f"{BASE_URL}/expenses/{r1_expense_id}", headers=headers("lider_r1_tgranda"))
    
    if resp.status_code != 403:
        print(f"  ❌ FAILED: Expected 403, got {resp.status_code}")
        return False
    print(f"  ✅ Líder tgranda gets 403 when accessing jelaje's expense (correct)")
    
    print("\n✅ PASSED: All region scope tests passed")
    return True

def test_7_role_restrictions():
    """Test 7: Role restrictions"""
    print_test("7. Role restrictions - verify 403 for unauthorized actions")
    
    r1_expense_id = expense_ids.get("without_budget")
    if not r1_expense_id:
        print("❌ FAILED: No expense ID available")
        return False
    
    # Test 7a: Líder tries to approve (coordinator action) - should get 403
    print("\n  Test 7a: Líder jelaje tries to approve (coordinator action)...")
    resp = requests.post(
        f"{BASE_URL}/expenses/{r1_expense_id}/coordinator-decision",
        json={"decision": "aprobar", "comentario": "Intento de líder"},
        headers=headers("lider_r1_jelaje")
    )
    
    if resp.status_code != 403:
        print(f"  ❌ FAILED: Expected 403, got {resp.status_code}")
        return False
    print(f"  ✅ Líder gets 403 when trying coordinator action (correct)")
    
    # Test 7b: Tesorero tries to create expense - should get 403
    print("\n  Test 7b: Tesorero tries to create expense...")
    meta_resp = requests.get(f"{BASE_URL}/expenses/meta", headers=headers("tesorero"))
    accounts = meta_resp.json().get("accounts", [])
    account_code = accounts[0]["codigo"]
    
    payload = {
        "cuenta_codigo": account_code,
        "proveedor": "Test",
        "fecha": "2025-01-18",
        "monto": 100.00,
        "necesita_presupuesto": False
    }
    
    resp = requests.post(f"{BASE_URL}/expenses", json=payload, headers=headers("tesorero"))
    
    if resp.status_code != 403:
        print(f"  ❌ FAILED: Expected 403, got {resp.status_code}")
        return False
    print(f"  ✅ Tesorero gets 403 when trying to create expense (correct)")
    
    # Test 7c: Gerente tries to assign budget (tesorero action) - should get 403
    print("\n  Test 7c: Gerente tries to assign budget (tesorero action)...")
    # First create an expense that needs budget
    payload = {
        "cuenta_codigo": account_code,
        "proveedor": "Test Budget",
        "fecha": "2025-01-19",
        "monto": 300.00,
        "necesita_presupuesto": True
    }
    
    resp = requests.post(f"{BASE_URL}/expenses", json=payload, headers=headers("lider_r1_jelaje"))
    if resp.status_code == 200:
        test_expense_id = resp.json().get("id")
        
        # Coordinador approves to move to pend_presupuesto
        requests.post(
            f"{BASE_URL}/expenses/{test_expense_id}/coordinator-decision",
            json={"decision": "aprobar"},
            headers=headers("coordinador_r1")
        )
        
        # Gerente tries to assign budget
        resp = requests.post(
            f"{BASE_URL}/expenses/{test_expense_id}/assign-budget",
            json={"monto_presupuesto": 350.00},
            headers=headers("gerente")
        )
        
        if resp.status_code != 403:
            print(f"  ❌ FAILED: Expected 403, got {resp.status_code}")
            return False
        print(f"  ✅ Gerente gets 403 when trying to assign budget (correct)")
    
    print("\n✅ PASSED: All role restriction tests passed")
    return True

def test_8_pdf_generation():
    """Test 8: PDF generation"""
    print_test("8. GET /api/expenses/{id}/pdf - PDF generation")
    
    expense_id = expense_ids.get("with_budget")
    if not expense_id:
        print("❌ FAILED: No expense ID available")
        return False
    
    resp = requests.get(f"{BASE_URL}/expenses/{expense_id}/pdf", headers=headers("coordinador_r1"))
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    if resp.headers.get("content-type") != "application/pdf":
        print(f"❌ FAILED: Expected content-type 'application/pdf', got {resp.headers.get('content-type')}")
        return False
    
    pdf_size = len(resp.content)
    if pdf_size < 100:
        print(f"❌ FAILED: PDF too small ({pdf_size} bytes), likely not a valid PDF")
        return False
    
    print(f"✅ PASSED: PDF generated successfully ({pdf_size} bytes)")
    return True

def test_9_dashboard():
    """Test 9: Dashboard with filters"""
    print_test("9. GET /api/expenses/dashboard - Dashboard with filters")
    
    # Test without filters
    print("\n  Test 9a: Dashboard without filters...")
    resp = requests.get(f"{BASE_URL}/expenses/dashboard", headers=headers("admin"))
    
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"  Response: {resp.text}")
        return False
    
    data = resp.json()
    
    # Verify structure
    if "kpis" not in data:
        print(f"  ❌ FAILED: Missing 'kpis' in response")
        return False
    
    kpis = data["kpis"]
    required_kpis = ["total", "monto_total", "monto_aprobado", "aprobados", "rechazados", "pendientes"]
    for key in required_kpis:
        if key not in kpis:
            print(f"  ❌ FAILED: Missing '{key}' in kpis")
            return False
    
    if "por_categoria" not in data:
        print(f"  ❌ FAILED: Missing 'por_categoria' in response")
        return False
    
    if "por_ciudad" not in data:
        print(f"  ❌ FAILED: Missing 'por_ciudad' in response")
        return False
    
    if "tiempos_etapa" not in data:
        print(f"  ❌ FAILED: Missing 'tiempos_etapa' in response")
        return False
    
    print(f"  ✅ Dashboard structure correct: {kpis['total']} total, {kpis['aprobados']} aprobados, {kpis['rechazados']} rechazados, {kpis['pendientes']} pendientes")
    
    # Test with filters
    print("\n  Test 9b: Dashboard with date filters...")
    resp = requests.get(
        f"{BASE_URL}/expenses/dashboard",
        params={"desde": "2025-01-01", "hasta": "2025-12-31"},
        headers=headers("admin")
    )
    
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code}")
        return False
    
    print(f"  ✅ Dashboard with date filters works")
    
    # Test with ciudad filter
    print("\n  Test 9c: Dashboard with ciudad filter...")
    resp = requests.get(
        f"{BASE_URL}/expenses/dashboard",
        params={"ciudad": "QUITO"},
        headers=headers("admin")
    )
    
    if resp.status_code != 200:
        print(f"  ❌ FAILED: Expected 200, got {resp.status_code}")
        return False
    
    print(f"  ✅ Dashboard with ciudad filter works")
    
    print("\n✅ PASSED: All dashboard tests passed")
    return True

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("EXPENSES MODULE BACKEND API TESTS")
    print("="*80)
    
    tests = [
        test_1_meta,
        test_2_create_expense,
        test_3_full_flow_with_budget,
        test_4_flow_without_budget,
        test_5_rejection,
        test_6_region_scope,
        test_7_role_restrictions,
        test_8_pdf_generation,
        test_9_dashboard,
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append((test.__name__, result))
        except Exception as e:
            print(f"\n❌ EXCEPTION in {test.__name__}: {e}")
            import traceback
            traceback.print_exc()
            results.append((test.__name__, False))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\n{passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    exit(main())
