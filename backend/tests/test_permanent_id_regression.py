"""Regression tests for AICTE Permanent ID (PID) preservation and validation during intake and submission."""

import jwt
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.workflow import validate_form_data_for_submission
from app.schemas.applications import ApplicationFormData, ApplicationTypeEnum

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
    institution_name: str = "Thiagarajar College of Engineering",
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


def test_schema_cleans_empty_eoa_details_when_applying_for_course_addition():
    """Exact bug reproduction: When user selects course_addition, formData previously

    contained a dummy eoa_details: {'permanent_id': ''}. This must not trigger Pydantic min_length
    error on eoa_details.permanent_id.
    """
    raw_payload = {
        "institution_name": "Thiagarajar College of Engineering",
        "institution_type": "engineering_technology",
        "state": "Tamil Nadu",
        "district": "Madurai",
        "address": "Tiruparankundram, Madurai",
        "pincode": "625015",
        "head_of_institution": "Dr. M. Palaninatha Raja",
        "contact_email": "principal@tce.edu",
        "contact_phone": "9876543210",
        "declaration_confirmed": True,
        "permanent_id": "1-12345678",
        # Stale dummy sub-object from unselected category
        "eoa_details": {
            "permanent_id": "",
            "naac_score": 0.0,
            "nba_accredited": False,
        },
        "course_addition_details": {
            "permanent_id": "1-12345678",
            "new_course_name": "Artificial Intelligence & Data Science",
            "proposed_intake": 60,
            "faculty_allocated": 4,
        },
    }

    # Should parse without Pydantic string_too_short validation error
    parsed = ApplicationFormData(**raw_payload)
    assert parsed.permanent_id == "1-12345678"
    # Canonical PID should propagate to course_addition_details
    assert parsed.course_addition_details.permanent_id == "1-12345678"
    assert parsed.course_addition_details.faculty_recruited == 4
    # eoa_details was empty, so it should be cleaned to None
    assert parsed.eoa_details is None


def test_workflow_validator_course_addition_success():
    """A valid Course Addition request passes statutory validation."""
    data = {
        "institution_name": "Thiagarajar College of Engineering",
        "institution_type": "engineering_technology",
        "state": "Tamil Nadu",
        "district": "Madurai",
        "address": "Tiruparankundram, Madurai",
        "pincode": "625015",
        "head_of_institution": "Dr. M. Palaninatha Raja",
        "contact_email": "principal@tce.edu",
        "contact_phone": "9876543210",
        "declaration_confirmed": True,
        "permanent_id": "1-12345678",
        "course_addition_details": {
            "permanent_id": "1-12345678",
            "new_course_name": "Computer Science & Business Systems",
            "proposed_intake": 60,
            "faculty_allocated": 4,
        },
    }
    is_valid, err, validated = validate_form_data_for_submission(ApplicationTypeEnum.COURSE_ADDITION, data)
    assert is_valid is True, f"Unexpected error: {err}"
    assert err is None
    assert validated.permanent_id == "1-12345678"
    assert validated.course_addition_details.permanent_id == "1-12345678"
    assert validated.course_addition_details.new_course_name == "Computer Science & Business Systems"


def test_workflow_validator_course_addition_missing_pid_rejected():
    """An empty or missing Permanent ID for Course Addition must be rejected with a useful error."""
    data = {
        "institution_name": "Thiagarajar College of Engineering",
        "institution_type": "engineering_technology",
        "state": "Tamil Nadu",
        "district": "Madurai",
        "address": "Tiruparankundram, Madurai",
        "pincode": "625015",
        "head_of_institution": "Dr. M. Palaninatha Raja",
        "contact_email": "principal@tce.edu",
        "contact_phone": "9876543210",
        "declaration_confirmed": True,
        "course_addition_details": {
            "permanent_id": "",
            "new_course_name": "Computer Science & Business Systems",
            "proposed_intake": 60,
            "faculty_allocated": 4,
        },
    }
    is_valid, err, validated = validate_form_data_for_submission(ApplicationTypeEnum.COURSE_ADDITION, data)
    assert is_valid is False
    assert "Permanent ID (minimum 4 characters) is mandatory" in err


def test_workflow_validator_new_institute_does_not_require_pid():
    """New Institute applications must NOT require an existing Permanent ID."""
    data = {
        "institution_name": "Apex Institute of Emerging Technologies",
        "institution_type": "engineering_technology",
        "state": "Maharashtra",
        "district": "Pune",
        "address": "Hinjawadi Phase 3, Pune",
        "pincode": "411057",
        "head_of_institution": "Dr. A. K. Joshi",
        "contact_email": "principal@apexinstitute.ac.in",
        "contact_phone": "9876543210",
        "declaration_confirmed": True,
        "programs_courses": [
            {
                "course_name": "Computer Engineering",
                "level": "UG",
                "intake_capacity": 60,
                "duration_years": 4,
                "faculty_count": 4,
            }
        ],
        "infrastructure": {
            "land_area_acres": 5.0,
            "built_up_area_sqm": 2500.0,
            "instructional_area_sqm": 1200.0,
            "administrative_area_sqm": 400.0,
            "amenities_area_sqm": 200.0,
            "title_deed_number": "TD-PUN-2026-99",
        },
    }
    is_valid, err, validated = validate_form_data_for_submission(ApplicationTypeEnum.NEW_INSTITUTE, data)
    assert is_valid is True, f"Unexpected error: {err}"
    assert err is None
    assert validated.institution_name == "Apex Institute of Emerging Technologies"
    assert validated.permanent_id is None


def test_end_to_end_api_submission_with_permanent_id():
    """Full API test: Draft creation, draft update, and final submission with PID."""
    token = create_mock_token(
        sub="tce-rep-user-42",
        email="principal@tce.edu",
        role="applicant_institution_representative",
        institution_name="Thiagarajar College of Engineering",
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Step 1 & 2: Create initial draft
    draft_init = {
        "application_type": "course_addition",
        "academic_year": "2026-2027",
        "form_data": {
            "institution_name": "Thiagarajar College of Engineering",
            "institution_type": "engineering_technology",
            "state": "Tamil Nadu",
            "district": "Madurai",
            "address": "Tiruparankundram, Madurai",
            "pincode": "625015",
            "head_of_institution": "Dr. M. Palaninatha Raja",
            "contact_email": "principal@tce.edu",
            "contact_phone": "9876543210",
            "permanent_id": "1-43219876",
        },
    }
    create_resp = client.post("/api/v1/applications/draft", json=draft_init, headers=headers)
    assert create_resp.status_code == 201
    app_record = create_resp.json()
    app_id = app_record["id"]
    assert app_record["form_data"]["permanent_id"] == "1-43219876"

    # Step 3 & 4: Update draft (simulating navigation between wizard steps)
    draft_update = {
        "form_data": {
            "institution_name": "Thiagarajar College of Engineering",
            "institution_type": "engineering_technology",
            "state": "Tamil Nadu",
            "district": "Madurai",
            "address": "Tiruparankundram, Madurai",
            "pincode": "625015",
            "head_of_institution": "Dr. M. Palaninatha Raja",
            "contact_email": "principal@tce.edu",
            "contact_phone": "9876543210",
            "permanent_id": "1-43219876",
            "course_addition_details": {
                "permanent_id": "1-43219876",
                "new_course_name": "Mechatronics and Automation",
                "proposed_intake": 60,
                "faculty_allocated": 4,
            },
            # Emulate browser sending empty unselected sub-object
            "eoa_details": {
                "permanent_id": "",
                "naac_score": 0.0,
                "nba_accredited": False,
            },
        }
    }
    put_resp = client.put(f"/api/v1/applications/{app_id}/draft", json=draft_update, headers=headers)
    assert put_resp.status_code == 200
    updated_record = put_resp.json()
    assert updated_record["form_data"]["permanent_id"] == "1-43219876"

    # Step 5: Final Submission
    submit_payload = {
        "institution_name": "Thiagarajar College of Engineering",
        "institution_type": "engineering_technology",
        "state": "Tamil Nadu",
        "district": "Madurai",
        "address": "Tiruparankundram, Madurai",
        "pincode": "625015",
        "head_of_institution": "Dr. M. Palaninatha Raja",
        "contact_email": "principal@tce.edu",
        "contact_phone": "9876543210",
        "declaration_confirmed": True,
        "permanent_id": "1-43219876",
        "course_addition_details": {
            "permanent_id": "1-43219876",
            "new_course_name": "Mechatronics and Automation",
            "proposed_intake": 60,
            "faculty_allocated": 4,
        },
        # Simulate browser submitting with empty eoa_details
        "eoa_details": {
            "permanent_id": "",
            "naac_score": 0.0,
            "nba_accredited": False,
        },
    }
    submit_resp = client.post(f"/api/v1/applications/{app_id}/submit", json=submit_payload, headers=headers)
    assert submit_resp.status_code == 200, submit_resp.text
    submitted_data = submit_resp.json()
    assert submitted_data["current_status"] == "submitted"
    assert submitted_data["application_number"].startswith("AICTE-2026-")
    assert submitted_data["form_data"]["permanent_id"] == "1-43219876"
    assert submitted_data["form_data"]["course_addition_details"]["permanent_id"] == "1-43219876"
    assert "eoa_details" not in submitted_data["form_data"] or submitted_data["form_data"]["eoa_details"] is None
