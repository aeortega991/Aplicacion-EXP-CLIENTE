#!/usr/bin/env python3
"""
Backend Regression Test Suite - Login Bug Fix Verification
Tests the fix for the 404 login bug caused by empty .env files
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Load the backend URL from frontend/.env
BACKEND_URL = "https://58c39cd6-0b33-4e91-bc94-1afa9fa18425.preview.emergentagent.com/api"

# Test credentials from test_credentials.md
ADMIN_USER = {"username": "aeortega", "password": "admin123"}
OPERATOR_USER = {"username": "operador", "password": "operador123"}

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_pass(self, test_name: str, details: str = ""):
        self.passed += 1
        self.tests.append({"name": test_name, "status": "PASS", "details": details})
        print(f"✅ PASS: {test_name}")
        if details:
            print(f"   {details}")
    
    def add_fail(self, test_name: str, details: str = ""):
        self.failed += 1
        self.tests.append({"name": test_name, "status": "FAIL", "details": details})
        print(f"❌ FAIL: {test_name}")
        if details:
            print(f"   {details}")
    
    def summary(self):
        total = self.passed + self.failed
        print("\n" + "="*80)
        print(f"TEST SUMMARY: {self.passed}/{total} passed, {self.failed}/{total} failed")
        print("="*80)
        return self.failed == 0

def test_admin_login(result: TestResult) -> Optional[str]:
    """Test 1: Admin login should return 200 with token and role=admin"""
    test_name = "Test 1: Admin Login (aeortega/admin123)"
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json=ADMIN_USER,
            timeout=10
        )
        
        status_code = response.status_code
        
        if status_code != 200:
            result.add_fail(
                test_name,
                f"Expected status 200, got {status_code}. Response: {response.text[:200]}"
            )
            return None
        
        data = response.json()
        
        # Check for token
        if "token" not in data:
            result.add_fail(test_name, "Response missing 'token' field")
            return None
        
        # Check for user object
        if "user" not in data:
            result.add_fail(test_name, "Response missing 'user' field")
            return None
        
        # Check role
        if data["user"].get("role") != "admin":
            result.add_fail(
                test_name,
                f"Expected role='admin', got role='{data['user'].get('role')}'"
            )
            return None
        
        result.add_pass(
            test_name,
            f"Status: {status_code}, Token: {data['token'][:20]}..., Role: {data['user']['role']}"
        )
        return data["token"]
        
    except Exception as e:
        result.add_fail(test_name, f"Exception: {str(e)}")
        return None

def test_operator_login(result: TestResult) -> Optional[str]:
    """Test 2: Operator login should return 200 with token and role=user"""
    test_name = "Test 2: Operator Login (operador/operador123)"
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json=OPERATOR_USER,
            timeout=10
        )
        
        status_code = response.status_code
        
        if status_code != 200:
            result.add_fail(
                test_name,
                f"Expected status 200, got {status_code}. Response: {response.text[:200]}"
            )
            return None
        
        data = response.json()
        
        # Check for token
        if "token" not in data:
            result.add_fail(test_name, "Response missing 'token' field")
            return None
        
        # Check for user object
        if "user" not in data:
            result.add_fail(test_name, "Response missing 'user' field")
            return None
        
        # Check role
        if data["user"].get("role") != "user":
            result.add_fail(
                test_name,
                f"Expected role='user', got role='{data['user'].get('role')}'"
            )
            return None
        
        result.add_pass(
            test_name,
            f"Status: {status_code}, Token: {data['token'][:20]}..., Role: {data['user']['role']}"
        )
        return data["token"]
        
    except Exception as e:
        result.add_fail(test_name, f"Exception: {str(e)}")
        return None

def test_auth_me(result: TestResult, token: str):
    """Test 3: GET /api/auth/me with admin token should return 200 with user data"""
    test_name = "Test 3: GET /api/auth/me (with admin token)"
    try:
        response = requests.get(
            f"{BACKEND_URL}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        status_code = response.status_code
        
        if status_code != 200:
            result.add_fail(
                test_name,
                f"Expected status 200, got {status_code}. Response: {response.text[:200]}"
            )
            return
        
        data = response.json()
        
        # Check for username
        if data.get("username") != "aeortega":
            result.add_fail(
                test_name,
                f"Expected username='aeortega', got username='{data.get('username')}'"
            )
            return
        
        # Check for role
        if data.get("role") != "admin":
            result.add_fail(
                test_name,
                f"Expected role='admin', got role='{data.get('role')}'"
            )
            return
        
        result.add_pass(
            test_name,
            f"Status: {status_code}, Username: {data.get('username')}, Role: {data.get('role')}"
        )
        
    except Exception as e:
        result.add_fail(test_name, f"Exception: {str(e)}")

def test_flota_module(result: TestResult, token: str):
    """Test 4: GET /api/modules/flota with admin token should return 200 with vehicle list"""
    test_name = "Test 4: GET /api/modules/flota (with admin token)"
    try:
        response = requests.get(
            f"{BACKEND_URL}/modules/flota",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        status_code = response.status_code
        
        if status_code != 200:
            result.add_fail(
                test_name,
                f"Expected status 200, got {status_code}. Response: {response.text[:200]}"
            )
            return
        
        data = response.json()
        
        # Check if it's a list
        if not isinstance(data, list):
            result.add_fail(test_name, f"Expected list response, got {type(data)}")
            return
        
        # Check vehicle count (should be around 78)
        vehicle_count = len(data)
        
        result.add_pass(
            test_name,
            f"Status: {status_code}, Vehicle count: {vehicle_count}"
        )
        
    except Exception as e:
        result.add_fail(test_name, f"Exception: {str(e)}")

def test_dashboard(result: TestResult, token: str):
    """Test 5: GET /api/dashboard with admin token should return 200"""
    test_name = "Test 5: GET /api/dashboard (with admin token)"
    try:
        response = requests.get(
            f"{BACKEND_URL}/dashboard",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        status_code = response.status_code
        
        if status_code != 200:
            result.add_fail(
                test_name,
                f"Expected status 200, got {status_code}. Response: {response.text[:200]}"
            )
            return
        
        data = response.json()
        
        result.add_pass(
            test_name,
            f"Status: {status_code}, Response keys: {list(data.keys()) if isinstance(data, dict) else 'list'}"
        )
        
    except Exception as e:
        result.add_fail(test_name, f"Exception: {str(e)}")

def test_wrong_password(result: TestResult):
    """Test 6: Login with wrong password should return 401 (NOT 404)"""
    test_name = "Test 6: Login with wrong password (expect 401, NOT 404)"
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"username": "aeortega", "password": "wrongpassword"},
            timeout=10
        )
        
        status_code = response.status_code
        
        if status_code == 404:
            result.add_fail(
                test_name,
                f"Got 404 (the bug is NOT fixed!). Response: {response.text[:200]}"
            )
            return
        
        if status_code != 401:
            result.add_fail(
                test_name,
                f"Expected status 401, got {status_code}. Response: {response.text[:200]}"
            )
            return
        
        result.add_pass(
            test_name,
            f"Status: {status_code} (correctly returns 401, not 404)"
        )
        
    except Exception as e:
        result.add_fail(test_name, f"Exception: {str(e)}")

def main():
    print("="*80)
    print("BACKEND REGRESSION TEST SUITE - Login Bug Fix Verification")
    print("="*80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Admin User: {ADMIN_USER['username']}")
    print(f"Operator User: {OPERATOR_USER['username']}")
    print("="*80)
    print()
    
    result = TestResult()
    
    # Test 1: Admin login
    admin_token = test_admin_login(result)
    print()
    
    # Test 2: Operator login
    operator_token = test_operator_login(result)
    print()
    
    # Test 3: Auth me (requires admin token)
    if admin_token:
        test_auth_me(result, admin_token)
    else:
        result.add_fail("Test 3: GET /api/auth/me", "Skipped - no admin token from Test 1")
    print()
    
    # Test 4: Flota module (requires admin token)
    if admin_token:
        test_flota_module(result, admin_token)
    else:
        result.add_fail("Test 4: GET /api/modules/flota", "Skipped - no admin token from Test 1")
    print()
    
    # Test 5: Dashboard (requires admin token)
    if admin_token:
        test_dashboard(result, admin_token)
    else:
        result.add_fail("Test 5: GET /api/dashboard", "Skipped - no admin token from Test 1")
    print()
    
    # Test 6: Wrong password
    test_wrong_password(result)
    print()
    
    # Summary
    success = result.summary()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
