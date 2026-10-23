"""Tests for AICTE Application Intake, Draft Persistence & Statutory Workflow State Machine."""

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


def create_mock_token(
    sub: str,
    email: str,
    role: str = "applicant_institution_representative",
    full_name: str = "Dr. Test Principal",
    institution_name: str = "Test Engineering College",
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


def test_anonymous_access_to_applications_is_denied():
    """Verify anonymous access is rejected with 401 Unauthorized."""
    resp = client.get("/api/v1/applications")
    assert resp.status_code == 401
    assert "Missing Authorization header" in resp.json()["detail"]


def test_create_application_draft_and_list():
    """Verify applicant can create a draft and it appears in their application list."""
    token = create_mock_token(
        sub="applicant-user-1",
        email="applicant1@college.edu.in",
        role="applicant_institution_representative",
        institution_name="National Institute of Technology Delhi",
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Create draft
    draft_payload = {
        "application_type": "new_institute",
        "academic_year": "2026-2027",
        "form_data": {
            "institution_name": "National Institute of Technology Delhi",
            "institution_type": "engineering_technology",
            "state": "Delhi",
            "district": "New Delhi",
            "address": "Sector 9, Rohini, Institutional Area",
            "pincode": "110085",
            "head_of_institution": "Prof. S. K. Sharma",
            "contact_email": "principal@nitdelhi.ac.in",
            "contact_phone": "9876543210",
        },
    }
    create_resp = client.post("/api/v1/applications/draft", json=draft_payload, headers=headers)
    assert create_resp.status_code == 201
    data = create_resp.json()
    assert data["current_status"] == "draft"
    assert data["application_type"] == "new_institute"
    assert data["application_number"] is None
    app_id = data["id"]

    # List applications
    list_resp = client.get("/api/v1/applications", headers=headers)
    assert list_resp.status_code == 200
    apps = list_resp.json()["items"]
    assert any(a["id"] == app_id for a in apps)


def test_draft_update_persistence():
    """Verify draft form data can be updated and persisted."""
    token = create_mock_token(
        sub="applicant-user-2",
        email="applicant2@college.edu.in",
        role="applicant_institution_representative",
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Initialize draft
    init_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "extension_of_approval", "academic_year": "2026-2027"},
        headers=headers,
    )
    app_id = init_resp.json()["id"]

    # Update draft
    update_payload = {
        "form_data": {
            "institution_name": "Mumbai Institute of Management",
            "institution_type": "management",
            "state": "Maharashtra",
            "district": "Mumbai",
            "address": "Bandra Kurla Complex",
            "pincode": "400051",
            "head_of_institution": "Dr. R. V. Patil",
            "contact_email": "director@mim.edu.in",
            "contact_phone": "9823456789",
            "eoa_details": {
                "permanent_id": "1-5829104",
                "nba_accredited": True,
                "naac_score": 3.42,
                "faculty_cadre_ratio": "1:2:6",
            },
        }
    }
    put_resp = client.put(f"/api/v1/applications/{app_id}/draft", json=update_payload, headers=headers)
    assert put_resp.status_code == 200
    saved = put_resp.json()
    assert saved["form_data"]["head_of_institution"] == "Dr. R. V. Patil"
    assert saved["form_data"]["eoa_details"]["permanent_id"] == "1-5829104"

    # Fetch to verify persistence
    get_resp = client.get(f"/api/v1/applications/{app_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["form_data"]["eoa_details"]["nba_accredited"] is True


def test_submission_rejects_incomplete_payload():
    """Verify server-side validation blocks submission of incomplete drafts."""
    token = create_mock_token(
        sub="applicant-user-3",
        email="applicant3@college.edu.in",
        role="applicant_institution_representative",
    )
    headers = {"Authorization": f"Bearer {token}"}

    init_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "new_institute", "academic_year": "2026-2027"},
        headers=headers,
    )
    app_id = init_resp.json()["id"]

    # Attempt to submit empty draft
    sub_resp = client.post(
        f"/api/v1/applications/{app_id}/submit",
        json={"declaration_confirmed": True},
        headers=headers,
    )
    assert sub_resp.status_code == 422
    assert "Server validation failed" in sub_resp.json()["detail"]


def test_successful_submission_generates_reference_and_history():
    """Verify complete application submission assigns AICTE reference and moves state to submitted."""
    token = create_mock_token(
        sub="applicant-user-4",
        email="applicant4@college.edu.in",
        role="applicant_institution_representative",
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Create draft
    init_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "new_institute", "academic_year": "2026-2027"},
        headers=headers,
    )
    app_id = init_resp.json()["id"]

    valid_intake = {
        "institution_name": "Bengaluru Academy of Technology",
        "institution_type": "engineering_technology",
        "state": "Karnataka",
        "district": "Bengaluru Urban",
        "address": "Whitefield ITPL Main Road",
        "pincode": "560066",
        "head_of_institution": "Dr. Ramesh Babu",
        "contact_email": "principal@bat.edu.in",
        "contact_phone": "9945678901",
        "programs_courses": [
            {
                "course_name": "Computer Science and Engineering",
                "level": "UG",
                "intake_capacity": 120,
                "duration_years": 4,
                "faculty_count": 8,
            }
        ],
        "infrastructure": {
            "land_area_acres": 5.2,
            "built_up_area_sqm": 8500.0,
            "instructional_area_sqm": 4200.0,
            "administrative_area_sqm": 1200.0,
            "amenities_area_sqm": 800.0,
            "title_deed_number": "KA-BLR-2026-REG-4891",
        },
    }

    sub_resp = client.post(
        f"/api/v1/applications/{app_id}/submit",
        json={"form_data": valid_intake, "declaration_confirmed": True},
        headers=headers,
    )
    assert sub_resp.status_code == 200
    res = sub_resp.json()
    assert res["current_status"] == "submitted"
    assert res["application_number"].startswith("AICTE-2026-NEW-")

    # Verify timeline history
    hist_resp = client.get(f"/api/v1/applications/{app_id}/history", headers=headers)
    assert hist_resp.status_code == 200
    timeline = hist_resp.json()
    assert len(timeline) >= 2
    assert timeline[-1]["action"] == "submit_application"
    assert timeline[-1]["new_status"] == "submitted"


def test_applicant_cannot_promote_to_officer_states():
    """Verify that an applicant cannot unilaterally approve or transition their own application."""
    applicant_token = create_mock_token(
        sub="applicant-user-5",
        email="applicant5@college.edu.in",
        role="applicant_institution_representative",
    )
    applicant_headers = {"Authorization": f"Bearer {applicant_token}"}

    # Submit an application
    init_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "course_addition", "academic_year": "2026-2027"},
        headers=applicant_headers,
    )
    app_id = init_resp.json()["id"]

    course_data = {
        "institution_name": "Chennai Polytechnic Institute",
        "institution_type": "engineering_technology",
        "state": "Tamil Nadu",
        "district": "Chennai",
        "address": "Guindy Industrial Estate",
        "pincode": "600032",
        "head_of_institution": "Prof. K. Venkatesh",
        "contact_email": "principal@cpi.ac.in",
        "contact_phone": "9840123456",
        "course_addition_details": {
            "permanent_id": "1-3948102",
            "new_course_name": "Robotics and Automation",
            "level": "UG",
            "proposed_intake": 60,
            "labs_ready": True,
            "faculty_recruited": 4,
        },
    }
    client.post(
        f"/api/v1/applications/{app_id}/submit",
        json={"form_data": course_data, "declaration_confirmed": True},
        headers=applicant_headers,
    )

    # Applicant attempts to jump to approved
    illegal_resp = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={"target_status": "approved", "action": "grant_approval"},
        headers=applicant_headers,
    )
    assert illegal_resp.status_code in [400, 403]
    assert "not authorized" in illegal_resp.json()["detail"].lower() or "illegal workflow transition" in illegal_resp.json()["detail"].lower()


def test_regulatory_officer_transition_lifecycle():
    """Verify authorized regional scrutiny officer can commence scrutiny and raise deficiencies."""
    applicant_token = create_mock_token(
        sub="applicant-user-6",
        email="applicant6@college.edu.in",
        role="applicant_institution_representative",
    )
    applicant_headers = {"Authorization": f"Bearer {applicant_token}"}

    # Create & submit
    init_resp = client.post(
        "/api/v1/applications/draft",
        json={"application_type": "extension_of_approval", "academic_year": "2026-2027"},
        headers=applicant_headers,
    )
    app_id = init_resp.json()["id"]

    eoa_data = {
        "institution_name": "Jaipur Engineering Academy",
        "institution_type": "engineering_technology",
        "state": "Rajasthan",
        "district": "Jaipur",
        "address": "Sitapura Industrial Area",
        "pincode": "302022",
        "head_of_institution": "Dr. M. S. Rathore",
        "contact_email": "info@jea.ac.in",
        "contact_phone": "9414012345",
        "eoa_details": {
            "permanent_id": "1-9988112",
            "nba_accredited": False,
            "faculty_cadre_ratio": "1:2:6",
            "compliance_declaration": True,
        },
    }
    client.post(
        f"/api/v1/applications/{app_id}/submit",
        json={"form_data": eoa_data, "declaration_confirmed": True},
        headers=applicant_headers,
    )

    # Officer tokens
    officer_token = create_mock_token(
        sub="officer-user-1",
        email="officer.nro@aicte-india.org",
        role="regional_scrutiny_officer",
        full_name="Regional Scrutiny Officer (NRO)",
    )
    officer_headers = {"Authorization": f"Bearer {officer_token}"}

    # Step 1: Officer claims case -> regional_scrutiny
    scrutiny_resp = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={"target_status": "regional_scrutiny", "action": "commence_scrutiny"},
        headers=officer_headers,
    )
    assert scrutiny_resp.status_code == 200
    assert scrutiny_resp.json()["current_status"] == "regional_scrutiny"

    # Step 2: Officer raises deficiency -> deficiency_resolution (requires notes)
    deficiency_resp = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={
            "target_status": "deficiency_resolution",
            "action": "raise_deficiency",
            "transition_notes": "Land registry deed missing certified surveyor endorsement. Please rectify within 7 days.",
        },
        headers=officer_headers,
    )
    assert deficiency_resp.status_code == 200
    assert deficiency_resp.json()["current_status"] == "deficiency_resolution"

    # Step 3: Applicant rectifies and resubmits
    applicant_resubmit = client.post(
        f"/api/v1/applications/{app_id}/transition",
        json={
            "target_status": "regional_scrutiny",
            "action": "resubmit_rectification",
            "transition_notes": "Uploaded certified surveyor endorsement deed copy Annexure IV.",
        },
        headers=applicant_headers,
    )
    assert applicant_resubmit.status_code == 200
    assert applicant_resubmit.json()["current_status"] == "regional_scrutiny"

    # Check timeline contains all records
    hist_resp = client.get(f"/api/v1/applications/{app_id}/history", headers=officer_headers)
    assert hist_resp.status_code == 200
    actions = [h["action"] for h in hist_resp.json()]
    assert "create_draft" in actions
    assert "submit_application" in actions
    assert "commence_scrutiny" in actions
    assert "raise_deficiency" in actions
    assert "resubmit_rectification" in actions


def test_cors_options_preflight_for_production_and_local_origins():
    """Verify CORS preflight succeeds for production Vercel origin and local Next.js ports without wildcards."""
    allowed_origins = [
        "https://aip-frontend-zeta.vercel.app",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    for origin in allowed_origins:
        # Preflight OPTIONS request
        resp = client.options(
            "/api/v1/applications/draft",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert resp.status_code == 200, f"Preflight failed for {origin}: {resp.text}"
        assert resp.headers.get("access-control-allow-origin") == origin
        assert resp.headers.get("access-control-allow-credentials") == "true"
        assert "POST" in resp.headers.get("access-control-allow-methods", "")

    # Untrusted origin must not be allowed
    untrusted_resp = client.options(
        "/api/v1/applications/draft",
        headers={
            "Origin": "http://untrusted-external-site.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert untrusted_resp.headers.get("access-control-allow-origin") is None or untrusted_resp.status_code >= 400


def test_step2_draft_creation_and_update_preserves_institution_profile():
    """Verify Step 2 profile, contact details, and permanent ID save and persist successfully."""
    token = create_mock_token(
        sub="step2-applicant-user",
        email="principal@tce.edu",
        role="applicant_institution_representative",
        institution_name="Thiagarajar College of Engineering",
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Origin": "http://localhost:3001",
    }

    # Step 2 formData as populated by the wizard
    step2_payload = {
        "application_type": "course_addition",
        "academic_year": "2026-2027",
        "institution_name": "Thiagarajar College of Engineering",
        "form_data": {
            "institution_name": "Thiagarajar College of Engineering",
            "institution_type": "engineering_technology",
            "permanent_id": "1-9318420191",
            "state": "Tamil Nadu",
            "district": "Madurai",
            "address": "Tiruparankundram, Madurai",
            "pincode": "625015",
            "head_of_institution": "Dr. V. Abhaikumar",
            "contact_email": "principal@tce.edu",
            "contact_phone": "9443312345",
            "course_addition_details": {
                "permanent_id": "1-9318420191",
                "new_course_name": "B.Tech Artificial Intelligence and Data Science",
                "level": "UG",
                "proposed_intake": 60,
                "labs_ready": True,
                "faculty_recruited": 4,
            },
        },
    }

    # Create draft
    create_resp = client.post("/api/v1/applications/draft", json=step2_payload, headers=headers)
    assert create_resp.status_code == 201
    draft_data = create_resp.json()
    app_id = draft_data["id"]
    assert draft_data["current_status"] == "draft"
    assert draft_data["form_data"]["permanent_id"] == "1-9318420191"
    assert draft_data["form_data"]["institution_name"] == "Thiagarajar College of Engineering"
    assert create_resp.headers.get("access-control-allow-origin") == "http://localhost:3001"

    # Update draft with further edits in Step 2
    update_payload = {
        "form_data": {
            **step2_payload["form_data"],
            "contact_phone": "9876543210",
        }
    }
    update_resp = client.put(f"/api/v1/applications/{app_id}/draft", json=update_payload, headers=headers)
    assert update_resp.status_code == 200
    updated_data = update_resp.json()
    assert updated_data["form_data"]["contact_phone"] == "9876543210"

    # Retrieve application and verify persisted values
    get_resp = client.get(f"/api/v1/applications/{app_id}", headers=headers)
    assert get_resp.status_code == 200
    fetched_data = get_resp.json()
    assert fetched_data["form_data"]["permanent_id"] == "1-9318420191"
    assert fetched_data["form_data"]["contact_phone"] == "9876543210"


def test_draft_endpoints_work_with_api_v1_and_api_prefixes():
    """Verify both canonical /api/v1/applications/draft and compat /api/applications/draft route successfully."""
    token = create_mock_token(
        sub="prefix-test-user",
        email="prefix@test.edu",
    )
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "application_type": "new_institute",
        "academic_year": "2026-2027",
        "form_data": {"institution_name": "Prefix Test Institute"},
    }

    resp1 = client.post("/api/v1/applications/draft", json=payload, headers=headers)
    assert resp1.status_code == 201

    resp2 = client.post("/api/applications/draft", json=payload, headers=headers)
    assert resp2.status_code == 201


def test_update_draft_nonexistent_returns_404_detail():
    """Verify updating a non-existent draft returns HTTP 404 with informative detail."""
    token = create_mock_token(sub="random-user-404", email="user404@test.edu")
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.put(
        "/api/v1/applications/non-existent-id/draft",
        json={"form_data": {"institution_name": "Ghost College"}},
        headers=headers,
    )
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


