"""Authentication and role validation schemas."""

from typing import Optional
from pydantic import BaseModel, Field


class UserAuthPayload(BaseModel):
    """Authenticated user profile resolved from verified Supabase token."""
    id: str = Field(..., description="Unique Supabase UUID of the authenticated user")
    email: str = Field(..., description="Institutional email address")
    role: str = Field(
        default="applicant_institution_representative",
        description="Assigned regulatory role",
    )
    full_name: Optional[str] = Field(None, description="User full name")
    institution_name: Optional[str] = Field(None, description="Associated institution name")
    regional_office: Optional[str] = Field(None, description="Regional office jurisdiction")
    access_token: Optional[str] = Field(None, exclude=True, description="Raw JWT for database client forwarding")
    is_mock: bool = Field(default=False, exclude=True, description="Indicates local mock/test token")


class AuthMeResponse(BaseModel):
    """Response payload for authenticated caller inspection."""
    status: str = Field(default="authenticated")
    user: UserAuthPayload
    message: str = Field(default="Supabase bearer token cryptographically verified.")


class AuditSummaryResponse(BaseModel):
    """Demonstration response for executive admin-restricted endpoint."""
    status: str = Field(default="authorized")
    summary: str = Field(default="Executive Administrative Security & Audit Dossier")
    total_system_events: int = Field(default=1482)
    privileged_elevations: int = Field(default=12)
    accessed_by_role: str


class QueueSummaryResponse(BaseModel):
    """Demonstration response for scrutiny officer-restricted endpoint."""
    status: str = Field(default="authorized")
    queue_name: str = Field(default="Regional Scrutiny Workload Queue")
    active_backlog: int = Field(default=142)
    accessed_by_role: str
