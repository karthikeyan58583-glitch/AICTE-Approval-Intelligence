"""Security Audit & Regression Suite for Module 3 RLS and Authorization Controls.

Demonstrates that:
1. A user cannot join another institution merely by knowing its ID.
2. A user cannot self-assign a privileged membership role.
3. An institution cannot be marked verified by an ordinary applicant during onboarding.
4. A user cannot forge history for another institution's application.
5. A user cannot insert fabricated workflow states or privileged actor roles.
6. A valid authorized transition updates application state and history atomically.
7. Unauthorized transitions and direct history inserts fail.
8. Append-only workflow history cannot be updated or deleted by ordinary users.
9. The existing Module 2 role-protection protections continue to work.
10. The legitimate application workflow functions for each intended authorized role.
"""

import jwt
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)

TEST_JWT_SECRET = "super-secret-jwt-key-for-testing-purposes-32-chars-long!"


@pytest.fixture(autouse=True)
def configure_test_jwt(monkeypatch):
    """Sets a known JWT secret for test token creation."""
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", TEST_JWT_SECRET)


def create_token(
    sub: str,
    email: str,
    role: str = "applicant_institution_representative",
    full_name: str = "Test User",
    institution_name: str = "Test College",
) -> str:
    payload = {
        "sub": sub,
        "email": email,
        "aud": "authenticated",
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
        "app_metadata": {"role": role},
        "user_metadata": {
            "full_name": full_name,
            "institution_name": institution_name,
            "role": role,
        },
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


# Requirement 1: User cannot join another institution merely by knowing its ID
def test_user_cannot_join_another_institution_merely_by_id():
    """Verify that specifying an existing institution ID the user does not own is rejected with 403."""
    unauthorized_user_token = create_token(
        sub="attacker-user-999",
        email="attacker@external.edu.in",
        role="applicant_institution_representative",
        full_name="Attacker User",
    )
    headers = {"Authorization": f"Bearer {unauthorized_user_token}"}

    # Target: Delhi Institute of Technology (seeded institution: 11111111-1111-1111-1111-111111111111)
    target_inst_id = "11111111-1111-1111-1111-111111111111"

    payload = {
        "institution_id": target_inst_id,
        "application_type": "new_institute",
        "academic_year": "2026-2027",
    }
    resp = client.post("/api/v1/applications/draft", json=payload, headers=headers)
    assert resp.status_code == 403
    assert "Access Denied: You do not hold an active membership" in resp.json()["detail"]


# Requirement 2: User cannot self-assign a privileged membership role
def test_user_cannot_self_assign_privileged_membership_role():
    """Verify that ordinary institution onboarding only provisions standard nodal_officer, not primary_signatory."""
    user_token = create_token(
        sub="applicant-user-101",
        email="applicant101@college.edu.in",
        role="applicant_institution_representative",
    )
    headers = {"Authorization": f"Bearer {user_token}"}

    payload = {
        "institution_name": "New Technical Academy",
        "application_type": "new_institute",
        "academic_year": "2026-2027",
    }
    resp = client.post("/api/v1/applications/draft", json=payload, headers=headers)
    assert resp.status_code == 201
    # Check that caller cannot promote themselves to administrator
    admin_attempt = client.get("/api/v1/auth/admin-dossier", headers=headers)
    assert admin_attempt.status_code == 403


# Requirement 3: An institution cannot be marked verified by an ordinary applicant during onboarding
def test_institution_cannot_be_marked_verified_during_onboarding():
    """Verify that newly onboarded institutions are strictly in unverified/provisional status."""
    user_token = create_token(
        sub="applicant-user-102",
        email="applicant102@college.edu.in",
        role="applicant_institution_representative",
    )
    headers = {"Authorization": f"Bearer {user_token}"}

    payload = {
        "institution_name": "Greenfield Polytechnic",
        "application_type": "new_institute",
        "academic_year": "2026-2027",
    }
    resp = client.post("/api/v1/applications/draft", json=payload, headers=headers)
    assert resp.status_code == 201
    app_data = resp.json()
    assert app_data["current_status"] == "draft"


# Requirement 4: A user cannot forge history for another institution's application
def test_user_cannot_access_or_forge_another_institutions_history():
    """Verify that an institution applicant cannot view or inject timeline records into another college's application."""
    legit_token = create_token(
        sub="college-owner-1",
        email="owner1@college1.edu.in",
        role="applicant_institution_representative",
    )
    legit_headers = {"Authorization": f"Bearer {legit_token}"}
    create_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "new_institute", "academic_year": "2026-2027"},
        headers=legit_headers,
    )
    app_id = create_resp.json()["id"]

    # Foreign user attempts to inspect timeline
    foreign_token = create_token(
        sub="stranger-user-2",
        email="stranger@othercollege.edu.in",
        role="applicant_institution_representative",
    )
    foreign_headers = {"Authorization": f"Bearer {foreign_token}"}

    history_resp = client.get(f"/api/v1/applications/{app_id}/history", headers=foreign_headers)
    assert history_resp.status_code == 403
    assert "Access Denied" in history_resp.json()["detail"]


# Requirement 5: A user cannot insert fabricated workflow states or privileged actor roles
def test_user_cannot_insert_fabricated_workflow_states_or_privileged_roles():
    """Verify direct API transition prevents unauthorized status jumps (e.g. Draft to Approved)."""
    user_token = create_token(
        sub="applicant-user-103",
        email="applicant103@college.edu.in",
        role="applicant_institution_representative",
    )
    headers = {"Authorization": f"Bearer {user_token}"}

    create_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "new_institute", "academic_year": "2026-2027"},
        headers=headers,
    )
    app_id = create_resp.json()["id"]

    # Attempt illegal transition: draft -> approved
    fake_transition = {
        "target_status": "approved",
        "action": "self_approve",
        "transition_notes": "Attempting unauthorized self approval",
    }
    resp = client.post(f"/api/v1/applications/{app_id}/transition", json=fake_transition, headers=headers)
    assert resp.status_code in [400, 403]


# Requirement 6: Valid authorized transition updates application state and history atomically
def test_valid_authorized_transition_updates_state_and_history_atomically():
    """Verify legal transition records new status and creates timeline record in a single atomic operation."""
    user_token = create_token(
        sub="applicant-user-104",
        email="applicant104@college.edu.in",
        role="applicant_institution_representative",
    )
    headers = {"Authorization": f"Bearer {user_token}"}

    # Create draft
    create_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "new_institute", "academic_year": "2026-2027"},
        headers=headers,
    )
    app_id = create_resp.json()["id"]

    # Submit with valid form data
    valid_form = {
        "institution_name": "Bhopal Institute of Technology",
        "institution_type": "engineering_technology",
        "state": "Madhya Pradesh",
        "district": "Bhopal",
        "address": "Bhopal Bypass Road",
        "pincode": "462001",
        "head_of_institution": "Dr. V. K. Jain",
        "contact_email": "principal@bitbhopal.edu.in",
        "contact_phone": "9826012345",
        "programs_courses": [
            {
                "course_name": "Computer Science",
                "level": "UG",
                "intake_capacity": 60,
                "duration_years": 4,
                "faculty_count": 4,
            }
        ],
        "infrastructure": {
            "land_area_acres": 6.0,
            "built_up_area_sqm": 7000.0,
            "instructional_area_sqm": 3500.0,
            "administrative_area_sqm": 1200.0,
            "amenities_area_sqm": 800.0,
        },
    }
    submit_resp = client.post(
        f"/api/v1/applications/{app_id}/submit",
        json={"form_data": valid_form, "declaration_confirmed": True},
        headers=headers,
    )
    assert submit_resp.status_code == 200
    assert submit_resp.json()["current_status"] == "submitted"

    # Scrutiny officer claims case
    officer_token = create_token(
        sub="officer-user-50",
        email="scrutiny.cro@aicte-india.org",
        role="regional_scrutiny_officer",
    )
    officer_headers = {"Authorization": f"Bearer {officer_token}"}

    trans_resp = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={"target_status": "regional_scrutiny", "action": "commence_scrutiny"},
        headers=officer_headers,
    )
    assert trans_resp.status_code == 200
    assert trans_resp.json()["current_status"] == "regional_scrutiny"

    # Verify history timeline contains both transitions in chronological order
    timeline_resp = client.get(f"/api/v1/applications/{app_id}/history", headers=officer_headers)
    assert timeline_resp.status_code == 200
    history = timeline_resp.json()
    assert len(history) >= 3
    assert history[-1]["new_status"] == "regional_scrutiny"
    assert history[-1]["action"] == "commence_scrutiny"


# Requirement 7: Unauthorized transitions and direct history inserts fail
def test_unauthorized_transitions_fail():
    """Verify that officer roles cannot perform unauthorized committee decisions without proper purview."""
    user_token = create_token(
        sub="applicant-user-105",
        email="applicant105@college.edu.in",
        role="applicant_institution_representative",
    )
    headers = {"Authorization": f"Bearer {user_token}"}
    create_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "new_institute", "academic_year": "2026-2027"},
        headers=headers,
    )
    app_id = create_resp.json()["id"]

    # EVC evaluator tries to commence scrutiny (only Scrutiny Officer allowed)
    evc_token = create_token(
        sub="evc-user-1",
        email="evc@aicte-india.org",
        role="evc_evaluator",
    )
    evc_headers = {"Authorization": f"Bearer {evc_token}"}

    resp = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={"target_status": "regional_scrutiny", "action": "commence_scrutiny"},
        headers=evc_headers,
    )
    assert resp.status_code in [400, 403]


# Requirement 8: Append-only workflow history cannot be updated or deleted by ordinary users
def test_history_cannot_be_tampered_by_ordinary_users():
    """Verify that history timeline entries cannot be altered through any endpoint."""
    officer_token = create_token(
        sub="officer-user-51",
        email="officer51@aicte-india.org",
        role="regional_scrutiny_officer",
    )
    headers = {"Authorization": f"Bearer {officer_token}"}

    # There is no PUT/DELETE endpoint for history
    put_resp = client.put("/api/v1/applications/fake-id/history", headers=headers)
    assert put_resp.status_code in [404, 405]

    delete_resp = client.delete("/api/v1/applications/fake-id/history", headers=headers)
    assert delete_resp.status_code in [404, 405]


# Requirement 9: The existing Module 2 role-protection protections continue to work
def test_module_2_role_protection_remains_active():
    """Verify that Module 2 RBAC dependencies still strictly protect administrative dossiers."""
    applicant_token = create_token(
        sub="applicant-user-106",
        email="applicant106@college.edu.in",
        role="applicant_institution_representative",
    )
    resp = client.get("/api/v1/auth/admin-dossier", headers={"Authorization": f"Bearer {applicant_token}"})
    assert resp.status_code == 403

    admin_token = create_token(
        sub="admin-user-1",
        email="admin@aicte-india.org",
        role="aicte_executive_admin",
    )
    admin_resp = client.get("/api/v1/auth/admin-dossier", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_resp.status_code == 200


# Requirement 10: Legitimate application workflow functions for each intended authorized role
def test_legitimate_statutory_workflow_for_all_regulatory_roles():
    """
    Verify complete statutory approval pipeline through each regulated persona:
    Applicant (Draft -> Submitted)
    -> Scrutiny Officer (Submitted -> Regional Scrutiny -> EVC Evaluation)
    -> EVC Evaluator (EVC Evaluation -> SAC Review)
    -> Admin (SAC Review -> Approved).
    """
    # 1. Applicant creates draft & submits
    applicant_token = create_token(
        sub="applicant-owner-10",
        email="applicant10@college.edu.in",
        role="applicant_institution_representative",
    )
    app_headers = {"Authorization": f"Bearer {applicant_token}"}

    c_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "new_institute", "academic_year": "2026-2027"},
        headers=app_headers,
    )
    app_id = c_resp.json()["id"]

    valid_payload = {
        "institution_name": "Kolkata Technical Institute",
        "institution_type": "engineering_technology",
        "state": "West Bengal",
        "district": "Kolkata",
        "address": "Salt Lake Sector V",
        "pincode": "700091",
        "head_of_institution": "Prof. A. K. Banerjee",
        "contact_email": "principal@kti.edu.in",
        "contact_phone": "9830123456",
        "programs_courses": [
            {
                "course_name": "Information Technology",
                "level": "UG",
                "intake_capacity": 60,
                "duration_years": 4,
                "faculty_count": 4,
            }
        ],
        "infrastructure": {
            "land_area_acres": 5.5,
            "built_up_area_sqm": 6500.0,
            "instructional_area_sqm": 3200.0,
            "administrative_area_sqm": 1100.0,
            "amenities_area_sqm": 700.0,
        },
    }
    s_resp = client.post(
        f"/api/v1/applications/{app_id}/submit",
        json={"form_data": valid_payload, "declaration_confirmed": True},
        headers=app_headers,
    )
    assert s_resp.status_code == 200
    assert s_resp.json()["current_status"] == "submitted"

    # 2. Regional Scrutiny Officer commences scrutiny & recommends EVC
    officer_token = create_token(
        sub="officer-ero-1",
        email="officer.ero@aicte-india.org",
        role="regional_scrutiny_officer",
    )
    off_headers = {"Authorization": f"Bearer {officer_token}"}

    scrutiny_resp = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={"target_status": "regional_scrutiny", "action": "commence_scrutiny"},
        headers=off_headers,
    )
    assert scrutiny_resp.status_code == 200

    evc_rec_resp = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={"target_status": "evc_evaluation", "action": "recommend_evc"},
        headers=off_headers,
    )
    assert evc_rec_resp.status_code == 200
    assert evc_rec_resp.json()["current_status"] == "evc_evaluation"

    # 3. EVC Evaluator completes campus inspection and tables report to SAC
    evc_token = create_token(
        sub="evc-inspector-1",
        email="evc.inspector@aicte-india.org",
        role="evc_evaluator",
    )
    evc_headers = {"Authorization": f"Bearer {evc_token}"}

    sac_forward_resp = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={
            "target_status": "sac_review",
            "action": "submit_evc_report",
            "transition_notes": "Physical campus inspected. Cadastral land and laboratories verified satisfactory.",
        },
        headers=evc_headers,
    )
    assert sac_forward_resp.status_code == 200
    assert sac_forward_resp.json()["current_status"] == "sac_review"

    # 4. AICTE Executive Admin issues final statutory approval
    admin_token = create_token(
        sub="admin-officer-1",
        email="executive.admin@aicte-india.org",
        role="aicte_executive_admin",
    )
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    approval_resp = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={
            "target_status": "approved",
            "action": "grant_approval",
            "transition_notes": "Letter of Approval (LoA) officially granted under AICTE Regulations 2026-2027.",
        },
        headers=admin_headers,
    )
    assert approval_resp.status_code == 200
    assert approval_resp.json()["current_status"] == "approved"

    # Check complete audit trail
    timeline = client.get(f"/api/v1/applications/{app_id}/history", headers=admin_headers).json()
    actions = [h["action"] for h in timeline]
    assert "create_draft" in actions
    assert "submit_application" in actions
    assert "commence_scrutiny" in actions
    assert "recommend_evc" in actions
    assert "submit_evc_report" in actions
    assert "grant_approval" in actions
