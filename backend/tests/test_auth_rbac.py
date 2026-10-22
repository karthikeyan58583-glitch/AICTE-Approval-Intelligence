"""Automated tests for FastAPI authentication, token verification, and Role-Based Access Control (RBAC)."""

import time
import jwt
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)

TEST_JWT_SECRET = "super-secret-jwt-key-for-local-testing-purposes-12345"


@pytest.fixture(autouse=True)
def configure_test_jwt_secret(monkeypatch):
    """Ensure the backend is configured with a deterministic secret for token testing."""
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", TEST_JWT_SECRET)


def create_test_token(role: str, user_id: str = "test-user-uuid-101", email: str = "test@aicte-india.org", expires_in: int = 3600) -> str:
    """Helper to generate cryptographically signed test Supabase JWT tokens."""
    payload = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "exp": int(time.time()) + expires_in,
        "iat": int(time.time()),
        "user_metadata": {
            "full_name": "Test Representative",
            "role": role,
            "institution_name": "AICTE Testing Institute",
        },
        "app_metadata": {
            "role": role,
        },
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


def test_public_health_endpoint_requires_no_authentication():
    """Ensure GET /api/health remains publicly accessible without any credentials."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "aicte-approval-intelligence-backend"


def test_protected_endpoint_rejects_missing_token():
    """Ensure calling /api/v1/auth/me without an Authorization header returns 401 Unauthorized."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "Missing Authorization header" in response.json()["detail"]


def test_protected_endpoint_rejects_malformed_token():
    """Ensure an unverified, invalid token returns 401 Unauthorized."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.malformed.token"},
    )
    assert response.status_code == 401
    assert "verification failed" in response.json()["detail"].lower()


def test_protected_endpoint_rejects_expired_token():
    """Ensure an expired token is rejected with 401."""
    expired_token = create_test_token("applicant_institution_representative", expires_in=-100)
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


def test_authenticated_user_can_access_me_endpoint():
    """Ensure a valid token allows any authorized persona to inspect their profile."""
    token = create_test_token(
        role="applicant_institution_representative",
        user_id="user-applicant-999",
        email="applicant@college.edu",
    )
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "authenticated"
    assert data["user"]["id"] == "user-applicant-999"
    assert data["user"]["email"] == "applicant@college.edu"
    assert data["user"]["role"] == "applicant_institution_representative"


def test_applicant_role_is_forbidden_from_admin_dossier():
    """Ensure an applicant representative CANNOT access the admin dossier (403 Forbidden)."""
    token = create_test_token(role="applicant_institution_representative")
    response = client.get(
        "/api/v1/auth/admin-dossier",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    assert "Access Denied" in response.json()["detail"]


def test_scrutiny_officer_is_forbidden_from_admin_dossier():
    """Ensure a regional scrutiny officer CANNOT access the executive admin dossier (403 Forbidden)."""
    token = create_test_token(role="regional_scrutiny_officer")
    response = client.get(
        "/api/v1/auth/admin-dossier",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_executive_admin_can_access_admin_dossier():
    """Ensure an AICTE executive admin successfully accesses the admin audit dossier (200 OK)."""
    token = create_test_token(role="aicte_executive_admin")
    response = client.get(
        "/api/v1/auth/admin-dossier",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "authorized"
    assert data["accessed_by_role"] == "aicte_executive_admin"


def test_scrutiny_queue_rbac_permits_officer_and_admin_only():
    """Ensure scrutiny queue permits officer and admin, but strictly rejects applicant."""
    applicant_token = create_test_token(role="applicant_institution_representative")
    officer_token = create_test_token(role="regional_scrutiny_officer")
    admin_token = create_test_token(role="aicte_executive_admin")

    # 1. Applicant must be rejected
    app_res = client.get("/api/v1/auth/scrutiny-queue", headers={"Authorization": f"Bearer {applicant_token}"})
    assert app_res.status_code == 403

    # 2. Officer must be permitted
    off_res = client.get("/api/v1/auth/scrutiny-queue", headers={"Authorization": f"Bearer {officer_token}"})
    assert off_res.status_code == 200
    assert off_res.json()["accessed_by_role"] == "regional_scrutiny_officer"

    # 3. Admin must be permitted
    adm_res = client.get("/api/v1/auth/scrutiny-queue", headers={"Authorization": f"Bearer {admin_token}"})
    assert adm_res.status_code == 200
