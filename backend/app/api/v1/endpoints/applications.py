"""FastAPI endpoints for AICTE Statutory Application Intake and Workflow State Machine."""

from typing import List
from fastapi import APIRouter, Depends, status
from app.core.security import get_current_user
from app.schemas.auth import UserAuthPayload
from app.schemas.applications import (
    DraftCreateRequest,
    DraftUpdateRequest,
    ApplicationSubmitRequest,
    WorkflowTransitionRequest,
    ApplicationResponse,
    ApplicationListResponse,
    WorkflowTimelineEntry,
)
from app.services.application_store import application_store

router = APIRouter()


@router.get(
    "",
    response_model=ApplicationListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Authorized Applications",
    description="Returns applications strictly scoped to the caller's institution or regulatory officer jurisdiction.",
)
async def list_applications(
    current_user: UserAuthPayload = Depends(get_current_user),
) -> ApplicationListResponse:
    items = application_store.list_applications(current_user)
    return ApplicationListResponse(items=items, total=len(items))


@router.post(
    "/draft",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Application Draft",
    description="Initializes a new draft for the applicant's institution. Sets statutory status to 'draft'.",
)
async def create_draft(
    draft_req: DraftCreateRequest,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> ApplicationResponse:
    return application_store.create_draft(user=current_user, req=draft_req)


@router.get(
    "/{application_id}",
    response_model=ApplicationResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Application Details",
    description="Fetches full application details, form data, and permitted next statutory transitions for the caller.",
)
async def get_application(
    application_id: str,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> ApplicationResponse:
    return application_store.get_application(user=current_user, app_id=application_id)


@router.put(
    "/{application_id}/draft",
    response_model=ApplicationResponse,
    status_code=status.HTTP_200_OK,
    summary="Update Application Draft",
    description="Saves partial or complete draft updates. Only permitted while in 'draft' or 'deficiency_resolution' status.",
)
async def update_draft(
    application_id: str,
    update_req: DraftUpdateRequest,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> ApplicationResponse:
    return application_store.update_draft(user=current_user, app_id=application_id, req=update_req)


@router.post(
    "/{application_id}/submit",
    response_model=ApplicationResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit Statutory Application",
    description="Executes authoritative server-side validation, generates official reference number, and moves status to 'submitted'.",
)
async def submit_application(
    application_id: str,
    submit_req: ApplicationSubmitRequest,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> ApplicationResponse:
    return application_store.submit_application(user=current_user, app_id=application_id, req=submit_req)


@router.get(
    "/{application_id}/history",
    response_model=List[WorkflowTimelineEntry],
    status_code=status.HTTP_200_OK,
    summary="Retrieve Workflow Timeline",
    description="Returns chronological, append-only audit trail of all statutory state transitions for the application.",
)
async def get_workflow_timeline(
    application_id: str,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> List[WorkflowTimelineEntry]:
    return application_store.get_timeline(user=current_user, app_id=application_id)


@router.post(
    "/{application_id}/transition",
    response_model=ApplicationResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute Statutory State Transition",
    description="Performs an authorized regulatory workflow transition (e.g. Scrutiny, EVC, SAC, Approval, Rejection).",
)
async def transition_application(
    application_id: str,
    transition_req: WorkflowTransitionRequest,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> ApplicationResponse:
    return application_store.transition_application(user=current_user, app_id=application_id, req=transition_req)
