"""Demonstration endpoints for Supabase token verification and RBAC enforcement."""

from fastapi import APIRouter, Depends, status
from app.core.security import get_current_user, require_roles
from app.schemas.auth import (
    UserAuthPayload,
    AuthMeResponse,
    AuditSummaryResponse,
    QueueSummaryResponse,
)

router = APIRouter()


@router.get(
    "/me",
    response_model=AuthMeResponse,
    status_code=status.HTTP_200_OK,
    summary="Inspect Authenticated Caller",
    description="Validates the caller's Supabase access token and returns trusted identity details and assigned role.",
)
async def get_me(
    current_user: UserAuthPayload = Depends(get_current_user),
) -> AuthMeResponse:
    """Returns authenticated user profile payload."""
    return AuthMeResponse(
        status="authenticated",
        user=current_user,
        message="Supabase bearer token successfully verified.",
    )


@router.get(
    "/admin-dossier",
    response_model=AuditSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Executive Administrative Audit Dossier (Admin Only)",
    description="Restricted strictly to the 'aicte_executive_admin' role.",
)
async def get_admin_audit_summary(
    admin_user: UserAuthPayload = Depends(require_roles(["aicte_executive_admin"])),
) -> AuditSummaryResponse:
    """Returns sensitive administrative metrics, accessible only to executive admins."""
    return AuditSummaryResponse(
        status="authorized",
        summary="Executive Administrative Security & Audit Dossier",
        total_system_events=1482,
        privileged_elevations=12,
        accessed_by_role=admin_user.role,
    )


@router.get(
    "/scrutiny-queue",
    response_model=QueueSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Regional Scrutiny Queue Telemetry",
    description="Accessible to 'regional_scrutiny_officer' and 'aicte_executive_admin' roles.",
)
async def get_scrutiny_queue_summary(
    officer_user: UserAuthPayload = Depends(
        require_roles(["regional_scrutiny_officer", "aicte_executive_admin"])
    ),
) -> QueueSummaryResponse:
    """Returns regional scrutiny telemetry, accessible to scrutiny officers and admins."""
    return QueueSummaryResponse(
        status="authorized",
        queue_name="Regional Scrutiny Workload Queue",
        active_backlog=142,
        accessed_by_role=officer_user.role,
    )
