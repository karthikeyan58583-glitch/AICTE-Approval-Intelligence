"""Application and Statutory Workflow Pydantic Schemas for AIP Module 3."""

from enum import Enum
from typing import List, Optional, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator


class ApplicationTypeEnum(str, Enum):
    NEW_INSTITUTE = "new_institute"
    EXTENSION_OF_APPROVAL = "extension_of_approval"
    COURSE_ADDITION = "course_addition"


class WorkflowStatusEnum(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    REGIONAL_SCRUTINY = "regional_scrutiny"
    DEFICIENCY_RESOLUTION = "deficiency_resolution"
    EVC_EVALUATION = "evc_evaluation"
    SAC_REVIEW = "sac_review"
    SHC_HEARING = "shc_hearing"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class InstitutionTypeEnum(str, Enum):
    ENGINEERING_TECHNOLOGY = "engineering_technology"
    MANAGEMENT = "management"
    PHARMACY = "pharmacy"
    ARCHITECTURE_PLANNING = "architecture_planning"
    APPLIED_ARTS_CRAFTS = "applied_arts_crafts"
    HOTEL_MANAGEMENT_CATERING = "hotel_management_catering"


class ProgramCourseItem(BaseModel):
    """Specific course/program proposed or active in the institution."""
    course_name: str = Field(..., min_length=2, max_length=150, description="Course / Degree name")
    level: str = Field("UG", description="Level: UG, PG, or Diploma")
    intake_capacity: int = Field(..., ge=10, le=1000, description="Intake capacity per batch")
    duration_years: int = Field(4, ge=1, le=6, description="Course duration in academic years")
    faculty_count: int = Field(..., ge=1, description="Assigned dedicated faculty count")


class InfrastructureDetails(BaseModel):
    """Cadastral and built-up land metrics required for statutory compliance."""
    land_area_acres: float = Field(..., ge=0.5, description="Contiguous land area in acres")
    built_up_area_sqm: float = Field(..., ge=500.0, description="Total sanctioned built-up area (sqm)")
    instructional_area_sqm: float = Field(..., ge=250.0, description="Classrooms and laboratories area (sqm)")
    administrative_area_sqm: float = Field(..., ge=100.0, description="Office and principal room area (sqm)")
    amenities_area_sqm: float = Field(..., ge=50.0, description="Cafeteria, restrooms, sports area (sqm)")
    title_deed_number: Optional[str] = Field(None, description="Land ownership / leased deed reference")


class EoADetails(BaseModel):
    """Extension of Approval specific compliance declarations."""
    permanent_id: str = Field(..., min_length=4, max_length=50, description="Existing AICTE Permanent ID")
    nba_accredited: bool = Field(default=False, description="Whether any eligible courses are NBA accredited")
    naac_score: Optional[float] = Field(None, ge=0.0, le=4.0, description="NAAC CGPA score if accredited")
    faculty_cadre_ratio: str = Field("1:2:6", description="Professor:Associate:Assistant ratio")
    compliance_declaration: bool = Field(True, description="Statutory compliance declaration")


class CourseAdditionDetails(BaseModel):
    """Course addition specific infrastructure readiness."""
    permanent_id: str = Field(..., min_length=4, max_length=50, description="Existing AICTE Permanent ID")
    new_course_name: str = Field(..., min_length=2, max_length=150, description="Name of new course")
    level: str = Field("UG", description="Course level")
    proposed_intake: int = Field(60, ge=10, le=300, description="Proposed new intake")
    labs_ready: bool = Field(True, description="Specialized laboratories ready for inspection")
    faculty_recruited: int = Field(default=4, ge=1, description="Faculty recruited for the new course")

    @model_validator(mode="before")
    @classmethod
    def populate_field_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            cleaned = dict(data)
            if "faculty_allocated" in cleaned and "faculty_recruited" not in cleaned:
                cleaned["faculty_recruited"] = cleaned["faculty_allocated"]
            return cleaned
        return data


class ApplicationFormData(BaseModel):
    """
    Authoritative server-validated intake form payload.
    Contains core institutional metadata and modular type-specific sub-schemas.
    """
    academic_year: str = Field("2026-2027", description="Statutory academic session")
    institution_name: str = Field(..., min_length=3, max_length=255, description="Full institution name")
    institution_type: InstitutionTypeEnum = Field(..., description="Institutional discipline")
    state: str = Field(..., min_length=2, max_length=100, description="State / Union Territory")
    district: str = Field(..., min_length=2, max_length=100, description="District")
    address: str = Field(..., min_length=5, max_length=500, description="Complete postal address")
    pincode: str = Field(..., pattern=r"^[1-9][0-9]{5}$", description="Valid 6-digit Indian Postal PIN code")
    head_of_institution: str = Field(..., min_length=3, max_length=150, description="Director / Principal name")
    contact_email: EmailStr = Field(..., description="Official contact email")
    contact_phone: str = Field(..., pattern=r"^[6-9]\d{9}$", description="10-digit primary mobile contact")

    # Modular components
    permanent_id: Optional[str] = Field(None, description="Canonical AICTE Permanent ID for existing institutions")
    programs_courses: List[ProgramCourseItem] = Field(default_factory=list, description="Offered/proposed programs")
    infrastructure: Optional[InfrastructureDetails] = None
    eoa_details: Optional[EoADetails] = None
    course_addition_details: Optional[CourseAdditionDetails] = None
    declaration_confirmed: bool = Field(default=False, description="Statutory veracity declaration")

    @model_validator(mode="before")
    @classmethod
    def sanitize_modular_sub_schemas(cls, data: Any) -> Any:
        if isinstance(data, dict):
            cleaned = dict(data)
            # Propagate canonical permanent_id if present
            pid = (
                cleaned.get("permanent_id")
                or (cleaned.get("eoa_details") or {}).get("permanent_id")
                or (cleaned.get("course_addition_details") or {}).get("permanent_id")
            )
            if pid and isinstance(pid, str) and pid.strip():
                cleaned["permanent_id"] = pid.strip()

            # Clean eoa_details if empty or invalid
            if "eoa_details" in cleaned:
                eoa = cleaned["eoa_details"]
                if not eoa or not isinstance(eoa, dict) or not str(eoa.get("permanent_id") or "").strip():
                    cleaned["eoa_details"] = None

            # Clean course_addition_details if empty or invalid
            if "course_addition_details" in cleaned:
                cad = cleaned["course_addition_details"]
                if not cad or not isinstance(cad, dict) or not str(cad.get("permanent_id") or "").strip():
                    cleaned["course_addition_details"] = None

            # Clean infrastructure if empty
            if "infrastructure" in cleaned:
                inf = cleaned["infrastructure"]
                if not inf or not isinstance(inf, dict) or not inf.get("land_area_acres"):
                    cleaned["infrastructure"] = None

            return cleaned
        return data


class DraftCreateRequest(BaseModel):
    """Payload to initialize a new application draft."""
    institution_id: Optional[UUID] = Field(None, description="Optional existing institution UUID")
    institution_name: Optional[str] = Field(None, description="Optional institution name for onboarding")
    application_type: ApplicationTypeEnum = Field(..., description="Statutory application category")
    academic_year: str = Field("2026-2027", description="Academic session")
    form_data: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Initial draft field values")


class DraftUpdateRequest(BaseModel):
    """Payload to update an active draft."""
    form_data: Dict[str, Any] = Field(..., description="Partial or full draft payload")


class ApplicationSubmitRequest(BaseModel):
    """Payload for authoritative statutory submission."""
    form_data: Optional[Dict[str, Any]] = Field(None, description="Final form payload to validate and save")
    declaration_confirmed: bool = Field(..., description="Confirmation of veracity under AICTE Regulations")

    @field_validator("declaration_confirmed")
    @classmethod
    def validate_declaration(cls, v: bool) -> bool:
        if not v:
            raise ValueError("You must confirm the statutory declaration before submitting.")
        return v


class WorkflowTransitionRequest(BaseModel):
    """Request to transition an application along statutory stages."""
    target_status: WorkflowStatusEnum = Field(..., description="Target statutory status")
    action: str = Field(..., min_length=2, max_length=100, description="Action code or label")
    transition_notes: Optional[str] = Field(None, max_length=2000, description="Statutory scrutiny or deficiency notes")


class WorkflowTimelineEntry(BaseModel):
    """Single chronological workflow history record."""
    id: str
    application_id: str
    previous_status: Optional[str] = None
    new_status: str
    action: str
    transition_notes: Optional[str] = None
    actor_id: str
    actor_role: Optional[str] = None
    actor_name: Optional[str] = None
    created_at: str


class ApplicationResponse(BaseModel):
    """Authorized application detail response."""
    id: str
    application_number: Optional[str] = None
    institution_id: str
    institution_name: Optional[str] = None
    application_type: str
    academic_year: str
    current_status: str
    form_data: Dict[str, Any] = Field(default_factory=dict)
    created_by: str
    submitted_at: Optional[str] = None
    created_at: str
    updated_at: str
    allowed_transitions: List[str] = Field(default_factory=list)


class ApplicationListResponse(BaseModel):
    """Paginated or filtered list of authorized applications."""
    items: List[ApplicationResponse]
    total: int
