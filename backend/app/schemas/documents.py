"""Pydantic schemas for AICTE Application Document Management (Module 4 Phase 1).

Authoritative models defining document types, verification statuses, metadata registration,
and regulatory review payloads.
"""

from enum import Enum
from typing import Optional, List, Any, Dict
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class DocumentTypeEnum(str, Enum):
    """Statutory document classifications prescribed by AICTE Approval Process Handbook (APH)."""
    LAND_OWNERSHIP_DEED = "land_ownership_deed"
    LAND_USE_CERTIFICATE = "land_use_certificate"
    BUILDING_PLAN_APPROVAL = "building_plan_approval"
    FIRE_SAFETY_CERTIFICATE = "fire_safety_certificate"
    STRUCTURAL_STABILITY_CERTIFICATE = "structural_stability_certificate"
    ARCHITECT_CERTIFICATE = "architect_certificate"
    FDR_GUARANTEE = "fdr_guarantee"
    AICTE_AFFIDAVIT = "aicte_affidavit"
    SOCIETY_TRUST_DEED = "society_trust_deed"
    OTHER_STATUTORY = "other_statutory"


class DocumentVerificationStatusEnum(str, Enum):
    """Lifecycle verification states for statutory application documents."""
    PENDING_REVIEW = "pending_review"
    VERIFIED_VALID = "verified_valid"
    DEFICIENCY_FLAGGED = "deficiency_flagged"
    REJECTED = "rejected"


class DocumentMetadataCreate(BaseModel):
    """Payload to register document metadata in PostgreSQL after uploading to Supabase Storage."""
    application_id: UUID = Field(..., description="Target application UUID")
    document_type: DocumentTypeEnum = Field(..., description="Statutory category of the document")
    original_filename: str = Field(..., min_length=1, max_length=255, description="Original filename with extension")
    storage_bucket: str = Field("aip-application-documents", description="Dedicated private Supabase Storage bucket")
    storage_path: str = Field(..., min_length=3, description="Canonical path in storage: {application_id}/{filename}")
    mime_type: str = Field("application/pdf", description="MIME type (must be application/pdf)")
    file_size_bytes: int = Field(..., gt=0, le=10485760, description="File size in bytes (max 10 MiB)")
    file_hash_sha256: Optional[str] = Field(None, max_length=64, description="Optional SHA-256 integrity hash")

    @field_validator("mime_type")
    @classmethod
    def validate_mime_type(cls, v: str) -> str:
        allowed = {"application/pdf"}
        if v not in allowed:
            raise ValueError(f"Disallowed MIME type '{v}'. Permitted MIME types: {', '.join(allowed)}.")
        return v

    @field_validator("storage_bucket")
    @classmethod
    def validate_storage_bucket(cls, v: str) -> str:
        if v != "aip-application-documents":
            raise ValueError("Storage bucket must be 'aip-application-documents'.")
        return v

    @field_validator("storage_path")
    @classmethod
    def validate_storage_path(cls, v: str) -> str:
        v = v.strip()
        parts = v.split("/", 1)
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ValueError("Storage path must be formatted as '{application_id}/{filename}'.")
        return v


class DocumentReviewRequest(BaseModel):
    """Payload submitted by a regulatory reviewer or administrator to evaluate a document."""
    verification_status: DocumentVerificationStatusEnum = Field(..., description="Evaluation determination")
    review_comments: Optional[str] = Field(None, max_length=2000, description="Official scrutiny observations")

    @field_validator("verification_status")
    @classmethod
    def validate_non_pending(cls, v: DocumentVerificationStatusEnum) -> DocumentVerificationStatusEnum:
        if v == DocumentVerificationStatusEnum.PENDING_REVIEW:
            raise ValueError("Review evaluation must set status to verified_valid, deficiency_flagged, or rejected.")
        return v


class DocumentResponse(BaseModel):
    """Authoritative document metadata record returned by API."""
    id: UUID
    application_id: UUID
    document_type: DocumentTypeEnum
    original_filename: str
    storage_bucket: str
    storage_path: str
    mime_type: str
    file_size_bytes: int
    file_hash_sha256: Optional[str] = None
    uploaded_by: UUID
    uploaded_at: datetime
    verification_status: DocumentVerificationStatusEnum
    reviewed_by: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    review_comments: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DocumentListResponse(BaseModel):
    """Paginated or filtered list of application documents."""
    items: List[DocumentResponse]
    total_count: int


class DocumentChecklistItem(BaseModel):
    """Checklist item showing statutory requirement status for a document category."""
    document_type: DocumentTypeEnum
    title: str
    description: str
    is_mandatory: bool
    status: str = Field(..., description="'missing', 'pending_review', 'verified_valid', 'deficiency_flagged', 'rejected'")
    document: Optional[DocumentResponse] = None


class DocumentChecklistResponse(BaseModel):
    """Statutory document readiness checklist for an application."""
    application_id: UUID
    application_type: str
    is_complete: bool
    mandatory_count: int
    uploaded_mandatory_count: int
    items: List[DocumentChecklistItem]


class DocumentDeleteResponse(BaseModel):
    """Response returned upon successful document metadata deletion."""
    message: str
    document_id: UUID
    storage_path: str
    queued_for_cleanup: bool = True


# Canonical metadata labels and statutory necessity mappings from AICTE Approval Process Handbook (APH)
DOCUMENT_TYPE_METADATA: dict[DocumentTypeEnum, dict[str, Any]] = {
    DocumentTypeEnum.LAND_OWNERSHIP_DEED: {
        "title": "Registered Land Deed / Ownership Title",
        "description": "Registered Sale Deed, Gift Deed, or Government Allotment Order showing unencumbered possession.",
        "required_for": ["new_institute"],
    },
    DocumentTypeEnum.LAND_USE_CERTIFICATE: {
        "title": "Land Use Certificate / Conversion Order",
        "description": "Statutory certificate from Competent Revenue Authority permitting educational institutional use.",
        "required_for": ["new_institute"],
    },
    DocumentTypeEnum.BUILDING_PLAN_APPROVAL: {
        "title": "Approved Building Plan Blueprint",
        "description": "Sanctioned master building plan and floor diagrams endorsed by Municipal/Town Planning authority.",
        "required_for": ["new_institute", "course_addition"],
    },
    DocumentTypeEnum.FIRE_SAFETY_CERTIFICATE: {
        "title": "Fire Safety NOC / Certificate",
        "description": "Valid compliance certificate from State Fire Services Department.",
        "required_for": ["new_institute", "extension_of_approval", "course_addition"],
    },
    DocumentTypeEnum.STRUCTURAL_STABILITY_CERTIFICATE: {
        "title": "Structural Stability Certificate",
        "description": "Certification issued by registered structural engineer confirming earthquake and load compliance.",
        "required_for": ["new_institute"],
    },
    DocumentTypeEnum.ARCHITECT_CERTIFICATE: {
        "title": "Architect Completion & Area Certificate",
        "description": "Affirmed carpet area, barrier-free access, and disabled-friendly provisions certificate.",
        "required_for": ["new_institute", "course_addition"],
    },
    DocumentTypeEnum.FDR_GUARANTEE: {
        "title": "Fixed Deposit Receipt / Joint Guarantee",
        "description": "Joint FDR pledged with Regional Officer AICTE towards corpus security fund.",
        "required_for": ["new_institute"],
    },
    DocumentTypeEnum.AICTE_AFFIDAVIT: {
        "title": "AICTE Mandatory Statutory Affidavit",
        "description": "Notarized affidavit on non-judicial stamp paper strictly following APH prescribed format.",
        "required_for": ["new_institute", "extension_of_approval", "course_addition"],
    },
    DocumentTypeEnum.SOCIETY_TRUST_DEED: {
        "title": "Society / Trust Registration Deed",
        "description": "Certificate of registration and memorandum of association of the promoting trust/society.",
        "required_for": ["new_institute"],
    },
    DocumentTypeEnum.OTHER_STATUTORY: {
        "title": "Supplementary Statutory Proof",
        "description": "Any additional government order, university affiliation, or regulatory approval order.",
        "required_for": [],
    },
}

