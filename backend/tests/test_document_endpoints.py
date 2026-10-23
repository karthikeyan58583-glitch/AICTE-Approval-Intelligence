"""End-to-End API and Integration Tests for AICTE Application Document Management (Module 4).

Validates:
- Strict authentication & authorization matrix across roles (applicants, reviewers, admins).
- PDF validation: 10 MiB limit, %PDF- magic signature bytes, structural parsing via pypdf, and SHA-256 calculation.
- Sanitized filenames and canonical storage paths.
- Application workflow state protection: modifications only permitted in 'draft' and 'deficiency_resolution'.
- Cross-institution isolation.
- Uploader ownership and deletion authorization with durable queue enqueuing.
- Reviewer non-repudiation: official determinations, mandatory deficiency remarks, and identity stamping.
- Statutory readiness checklist for application categories.
"""

import io
import jwt
import pytest
import hashlib
import pypdf
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.schemas.documents import (
    DocumentTypeEnum,
    DocumentVerificationStatusEnum,
)
from app.services.application_store import application_store
from app.services.document_service import document_store

client = TestClient(app)

TEST_JWT_SECRET = "super-secret-jwt-key-for-testing-purposes-32-chars-long!"


@pytest.fixture(autouse=True)
def configure_test_jwt(monkeypatch):
    """Configures JWT secret for test token creation."""
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", TEST_JWT_SECRET)


def create_sample_pdf(text: str = "AICTE Test Statutory Document") -> bytes:
    """Generates an authentic, syntactically valid PDF binary using pypdf."""
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=72, height=72)
    stream = io.BytesIO()
    writer.write(stream)
    return stream.getvalue()


def create_mock_token(
    sub: str,
    email: str,
    role: str = "applicant_institution_representative",
    full_name: str = "Dr. Test Principal",
    institution_name: str = "Delhi Institute of Technology & Advanced Studies",
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


@pytest.fixture
def applicant_token():
    return create_mock_token(
        sub="00000000-0000-0000-0000-000000000001",
        email="applicant1@delhi.edu.in",
        role="applicant_institution_representative",
        institution_name="Delhi Institute of Technology & Advanced Studies",
    )


@pytest.fixture
def other_institution_token():
    return create_mock_token(
        sub="00000000-0000-0000-0000-000000000002",
        email="applicant2@maharashtra.edu.in",
        role="applicant_institution_representative",
        institution_name="Maharashtra Institute of Technology & Management",
    )


@pytest.fixture
def reviewer_token():
    return create_mock_token(
        sub="00000000-0000-0000-0000-000000000099",
        email="officer@aicte-india.org",
        role="regional_scrutiny_officer",
        full_name="Regional Scrutiny Officer",
    )


@pytest.fixture
def admin_token():
    return create_mock_token(
        sub="00000000-0000-0000-0000-000000000000",
        email="admin@aicte-india.org",
        role="aicte_executive_admin",
        full_name="Executive Administrator",
    )


@pytest.fixture
def test_application_id(applicant_token):
    """Creates a fresh test application draft for testing."""
    headers = {"Authorization": f"Bearer {applicant_token}"}
    payload = {
        "institution_name": "Delhi Institute of Technology & Advanced Studies",
        "institution_type": "engineering_technology",
        "application_type": "new_institute",
        "academic_year": "2026-2027",
    }
    resp = client.post("/api/v1/applications/draft", json=payload, headers=headers)
    assert resp.status_code == 201, f"Failed to create draft: {resp.text}"
    return resp.json()["id"]


# --------------------------------------------------------------------------
# 1. ANONYMOUS ACCESS RESTRICTIONS
# --------------------------------------------------------------------------

def test_anonymous_document_endpoints_denied(test_application_id):
    fake_doc_id = "00000000-0000-0000-0000-000000000123"

    # POST upload
    pdf_bytes = create_sample_pdf()
    files = {"file": ("test.pdf", pdf_bytes, "application/pdf")}
    data = {"document_type": "land_ownership_deed"}
    r = client.post(f"/api/v1/applications/{test_application_id}/documents", data=data, files=files)
    assert r.status_code == 401

    # GET list
    r = client.get(f"/api/v1/applications/{test_application_id}/documents")
    assert r.status_code == 401

    # GET checklist
    r = client.get(f"/api/v1/applications/{test_application_id}/documents/checklist")
    assert r.status_code == 401

    # GET metadata
    r = client.get(f"/api/v1/documents/{fake_doc_id}")
    assert r.status_code == 401

    # GET download
    r = client.get(f"/api/v1/documents/{fake_doc_id}/download")
    assert r.status_code == 401

    # DELETE
    r = client.delete(f"/api/v1/documents/{fake_doc_id}")
    assert r.status_code == 401

    # PATCH review
    r = client.patch(f"/api/v1/documents/{fake_doc_id}/review", json={"verification_status": "verified_valid"})
    assert r.status_code == 401


# --------------------------------------------------------------------------
# 2. DOCUMENT UPLOAD & VALIDATION TESTS
# --------------------------------------------------------------------------

def test_upload_valid_pdf_success(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}
    pdf_bytes = create_sample_pdf("Valid AICTE Land Title Deed")
    expected_hash = hashlib.sha256(pdf_bytes).hexdigest()

    files = {"file": ("land_title_deed.pdf", pdf_bytes, "application/pdf")}
    data = {"document_type": "land_ownership_deed"}

    resp = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data=data,
        files=files,
        headers=headers,
    )
    assert resp.status_code == 201
    doc = resp.json()
    assert doc["application_id"] == test_application_id
    assert doc["document_type"] == "land_ownership_deed"
    assert doc["original_filename"] == "land_title_deed.pdf"
    assert doc["storage_bucket"] == "aip-application-documents"
    assert doc["storage_path"].startswith(f"{test_application_id}/")
    assert doc["mime_type"] == "application/pdf"
    assert doc["file_size_bytes"] == len(pdf_bytes)
    assert doc["file_hash_sha256"] == expected_hash
    assert doc["verification_status"] == "pending_review"
    assert doc["reviewed_by"] is None
    assert doc["reviewed_at"] is None


def test_upload_rejects_empty_file(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}
    files = {"file": ("empty.pdf", b"", "application/pdf")}
    data = {"document_type": "land_ownership_deed"}

    resp = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data=data,
        files=files,
        headers=headers,
    )
    assert resp.status_code == 400
    assert "Uploaded file is empty" in resp.json()["detail"]


def test_upload_rejects_invalid_magic_signature(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}
    fake_bytes = b"Hello world, I am not a valid PDF file content!"
    files = {"file": ("fake.pdf", fake_bytes, "application/pdf")}
    data = {"document_type": "building_plan_approval"}

    resp = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data=data,
        files=files,
        headers=headers,
    )
    assert resp.status_code == 400
    assert "Invalid file signature" in resp.json()["detail"]


def test_upload_rejects_corrupted_pdf_structure(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}
    # Has magic bytes, but truncated/broken syntax
    broken_pdf = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
    files = {"file": ("corrupt.pdf", broken_pdf, "application/pdf")}
    data = {"document_type": "structural_stability_certificate"}

    resp = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data=data,
        files=files,
        headers=headers,
    )
    assert resp.status_code == 400
    assert "PDF" in resp.json()["detail"]


def test_upload_rejects_oversized_file(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}
    # 10 MiB + 100 bytes
    oversized = b"%PDF-1.7\n" + (b"A" * (10 * 1024 * 1024 + 100))
    files = {"file": ("huge.pdf", oversized, "application/pdf")}
    data = {"document_type": "aicte_affidavit"}

    resp = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data=data,
        files=files,
        headers=headers,
    )
    assert resp.status_code == 400
    assert "maximum permitted limit of 10 MiB" in resp.json()["detail"]


def test_filename_sanitization_removes_path_traversal(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}
    pdf_bytes = create_sample_pdf("Safe content")
    # Path traversal in original filename
    files = {"file": ("../../../../etc/passwd_deed.pdf", pdf_bytes, "application/pdf")}
    data = {"document_type": "land_use_certificate"}

    resp = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data=data,
        files=files,
        headers=headers,
    )
    assert resp.status_code == 201
    doc = resp.json()
    assert ".." not in doc["original_filename"]
    assert "/" not in doc["original_filename"]
    assert "\\" not in doc["original_filename"]


# --------------------------------------------------------------------------
# 3. APPLICATION WORKFLOW STATE PROTECTION
# --------------------------------------------------------------------------

def test_document_upload_denied_when_application_submitted(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}

    # 1. Complete statutory intake requirements
    valid_intake = {
        "institution_name": "Delhi Institute of Technology & Advanced Studies",
        "institution_type": "engineering_technology",
        "head_of_institution": "Dr. Submitter",
        "contact_email": "submitter@delhi.edu.in",
        "contact_phone": "9876543210",
        "address": "Sector 14 Dwarka",
        "district": "New Delhi",
        "state": "Delhi",
        "pincode": "110078",
        "programs_courses": [
            {
                "course_name": "Computer Science & Engineering",
                "level": "UG",
                "intake_capacity": 60,
                "duration_years": 4,
                "faculty_count": 4,
            }
        ],
        "infrastructure": {
            "land_area_acres": 5.5,
            "built_up_area_sqm": 8500.0,
            "instructional_area_sqm": 4500.0,
            "administrative_area_sqm": 1500.0,
            "amenities_area_sqm": 1000.0,
        },
    }

    # 2. Submit application -> moves to 'submitted'
    sub_resp = client.post(
        f"/api/v1/applications/{test_application_id}/submit",
        json={"form_data": valid_intake, "declaration_confirmed": True},
        headers=headers,
    )
    assert sub_resp.status_code == 200
    assert sub_resp.json()["current_status"] == "submitted"

    # 3. Attempt document upload on submitted application
    pdf_bytes = create_sample_pdf()
    files = {"file": ("late_submission.pdf", pdf_bytes, "application/pdf")}
    data = {"document_type": "fdr_guarantee"}

    resp = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data=data,
        files=files,
        headers=headers,
    )
    assert resp.status_code == 403
    assert "Document uploads are not permitted while application is in 'submitted' status" in resp.json()["detail"]


# --------------------------------------------------------------------------
# 4. CROSS-INSTITUTION ISOLATION & AUTHORIZATION
# --------------------------------------------------------------------------

def test_cross_institution_isolation(applicant_token, other_institution_token, test_application_id):
    # Applicant 1 uploads document
    headers_app1 = {"Authorization": f"Bearer {applicant_token}"}
    pdf_bytes = create_sample_pdf()
    files = {"file": ("private_trust.pdf", pdf_bytes, "application/pdf")}
    data = {"document_type": "society_trust_deed"}

    upload_res = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data=data,
        files=files,
        headers=headers_app1,
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # Applicant 2 (Other institution) attempts to list documents
    headers_app2 = {"Authorization": f"Bearer {other_institution_token}"}
    list_res = client.get(f"/api/v1/applications/{test_application_id}/documents", headers=headers_app2)
    assert list_res.status_code in (403, 404)

    # Applicant 2 attempts to get document metadata
    meta_res = client.get(f"/api/v1/documents/{doc_id}", headers=headers_app2)
    assert meta_res.status_code in (403, 404)

    # Applicant 2 attempts to download document
    down_res = client.get(f"/api/v1/documents/{doc_id}/download", headers=headers_app2)
    assert down_res.status_code in (403, 404)

    # Applicant 2 attempts to delete document
    del_res = client.delete(f"/api/v1/documents/{doc_id}", headers=headers_app2)
    assert del_res.status_code in (403, 404)


# --------------------------------------------------------------------------
# 5. DOCUMENT LISTING, CHECKLIST & DOWNLOAD
# --------------------------------------------------------------------------

def test_list_documents_and_checklist(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}

    # Upload two documents
    pdf1 = create_sample_pdf("Deed")
    client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data={"document_type": "land_ownership_deed"},
        files={"file": ("deed.pdf", pdf1, "application/pdf")},
        headers=headers,
    )
    pdf2 = create_sample_pdf("Fire NOC")
    client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data={"document_type": "fire_safety_certificate"},
        files={"file": ("fire_noc.pdf", pdf2, "application/pdf")},
        headers=headers,
    )

    # List documents
    list_res = client.get(f"/api/v1/applications/{test_application_id}/documents", headers=headers)
    assert list_res.status_code == 200
    data = list_res.json()
    assert data["total_count"] == 2
    types = [d["document_type"] for d in data["items"]]
    assert "land_ownership_deed" in types
    assert "fire_safety_certificate" in types

    # Check checklist
    chk_res = client.get(f"/api/v1/applications/{test_application_id}/documents/checklist", headers=headers)
    assert chk_res.status_code == 200
    chk_data = chk_res.json()
    assert chk_data["application_id"] == test_application_id
    assert chk_data["is_complete"] is False  # New institute requires 9 documents
    assert chk_data["uploaded_mandatory_count"] >= 2


def test_download_document_success(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}
    pdf_bytes = create_sample_pdf("Original bytes to download")

    upload_res = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data={"document_type": "architect_certificate"},
        files={"file": ("architect_certificate.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # Download
    down_res = client.get(f"/api/v1/documents/{doc_id}/download", headers=headers)
    assert down_res.status_code == 200
    assert down_res.headers["content-type"] == "application/pdf"
    assert "inline" in down_res.headers["content-disposition"]
    assert down_res.content == pdf_bytes


# --------------------------------------------------------------------------
# 6. DOCUMENT DELETION & WORKER ENQUEUE
# --------------------------------------------------------------------------

def test_delete_document_success(applicant_token, test_application_id):
    headers = {"Authorization": f"Bearer {applicant_token}"}
    pdf_bytes = create_sample_pdf("File to delete")

    upload_res = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data={"document_type": "other_statutory"},
        files={"file": ("to_delete.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # Delete
    del_res = client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert del_data["document_id"] == doc_id
    assert del_data["queued_for_cleanup"] is True

    # Document should not appear in list anymore
    get_res = client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert get_res.status_code == 404


# --------------------------------------------------------------------------
# 7. REGULATORY SCRUTINY & REVIEW DETERMINATION
# --------------------------------------------------------------------------

def test_reviewer_can_evaluate_document(applicant_token, reviewer_token, test_application_id):
    # Applicant uploads
    headers_app = {"Authorization": f"Bearer {applicant_token}"}
    pdf_bytes = create_sample_pdf("Structural Certificate")
    upload_res = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data={"document_type": "structural_stability_certificate"},
        files={"file": ("structural.pdf", pdf_bytes, "application/pdf")},
        headers=headers_app,
    )
    doc_id = upload_res.json()["id"]

    # Reviewer verifies valid
    headers_rev = {"Authorization": f"Bearer {reviewer_token}"}
    rev_payload = {
        "verification_status": "verified_valid",
        "review_comments": "Verified against state registered structural engineer registry.",
    }
    review_res = client.patch(f"/api/v1/documents/{doc_id}/review", json=rev_payload, headers=headers_rev)
    assert review_res.status_code == 200
    doc = review_res.json()
    assert doc["verification_status"] == "verified_valid"
    assert doc["review_comments"] == rev_payload["review_comments"]
    assert doc["reviewed_by"] is not None
    assert doc["reviewed_at"] is not None


def test_reviewer_deficiency_requires_remarks(applicant_token, reviewer_token, test_application_id):
    headers_app = {"Authorization": f"Bearer {applicant_token}"}
    pdf_bytes = create_sample_pdf("Affidavit")
    upload_res = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data={"document_type": "aicte_affidavit"},
        files={"file": ("affidavit.pdf", pdf_bytes, "application/pdf")},
        headers=headers_app,
    )
    doc_id = upload_res.json()["id"]

    headers_rev = {"Authorization": f"Bearer {reviewer_token}"}
    # Flag deficiency without remarks -> should fail
    bad_payload = {"verification_status": "deficiency_flagged", "review_comments": ""}
    r1 = client.patch(f"/api/v1/documents/{doc_id}/review", json=bad_payload, headers=headers_rev)
    assert r1.status_code == 400
    assert "mandatory" in r1.json()["detail"]

    # With remarks -> should succeed
    good_payload = {
        "verification_status": "deficiency_flagged",
        "review_comments": "Stamp paper is not of required INR 100 denomination per APH Clause 3.2.",
    }
    r2 = client.patch(f"/api/v1/documents/{doc_id}/review", json=good_payload, headers=headers_rev)
    assert r2.status_code == 200
    assert r2.json()["verification_status"] == "deficiency_flagged"


def test_applicant_cannot_review_documents(applicant_token, test_application_id):
    headers_app = {"Authorization": f"Bearer {applicant_token}"}
    pdf_bytes = create_sample_pdf("Affidavit")
    upload_res = client.post(
        f"/api/v1/applications/{test_application_id}/documents",
        data={"document_type": "fire_safety_certificate"},
        files={"file": ("fire.pdf", pdf_bytes, "application/pdf")},
        headers=headers_app,
    )
    doc_id = upload_res.json()["id"]

    # Applicant attempts to mark own document as verified
    fake_review = {"verification_status": "verified_valid"}
    res = client.patch(f"/api/v1/documents/{doc_id}/review", json=fake_review, headers=headers_app)
    assert res.status_code == 403
    assert "Only regulatory scrutiny officers" in res.json()["detail"]
