"""FastAPI router for AICTE Statutory Document Management and Verification (Module 4).

Exposes secure, authenticated REST endpoints for:
- Document upload with PDF structural validation and SHA-256 verification.
- Document listing and statutory checklist evaluation.
- Secure binary streaming/download with strict permission enforcement.
- Uploader document deletion with durable outbox cleanup enqueuing.
- Regulatory scrutiny officer document evaluation and deficiency tracking.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Form, File, UploadFile, status, Response
from app.core.security import get_current_user
from app.schemas.auth import UserAuthPayload
from app.schemas.documents import (
    DocumentTypeEnum,
    DocumentResponse,
    DocumentListResponse,
    DocumentChecklistResponse,
    DocumentDeleteResponse,
    DocumentReviewRequest,
)
from app.services.document_service import document_store, MAX_FILE_SIZE_BYTES

router = APIRouter()


@router.post(
    "/applications/{application_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Statutory Application Document",
    description="Validates PDF signature and structural integrity, stores binary in private storage, and records authoritative metadata.",
)
async def upload_document(
    application_id: str,
    document_type: DocumentTypeEnum = Form(..., description="Statutory document classification"),
    file: UploadFile = File(..., description="PDF document file (max 10 MiB)"),
    current_user: UserAuthPayload = Depends(get_current_user),
) -> DocumentResponse:
    # Read file content safely within size bounds
    content = await file.read(MAX_FILE_SIZE_BYTES + 1)
    return document_store.upload_document(
        user=current_user,
        app_id=application_id,
        document_type=document_type,
        filename=file.filename or "document.pdf",
        content=content,
    )


@router.get(
    "/applications/{application_id}/documents",
    response_model=DocumentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Authorized Application Documents",
    description="Returns metadata for documents associated with the application, enforcing application-level permissions.",
)
async def list_documents(
    application_id: str,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> DocumentListResponse:
    items = document_store.list_documents(user=current_user, app_id=application_id)
    return DocumentListResponse(items=items, total_count=len(items))


@router.get(
    "/applications/{application_id}/documents/checklist",
    response_model=DocumentChecklistResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Statutory Document Readiness Checklist",
    description="Evaluates mandatory and optional statutory document categories according to application type.",
)
async def get_document_checklist(
    application_id: str,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> DocumentChecklistResponse:
    return document_store.get_checklist(user=current_user, app_id=application_id)


@router.get(
    "/documents/{document_id}",
    response_model=DocumentResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Document Metadata",
    description="Fetches metadata record for a single document, enforcing application read authorization.",
)
async def get_document_metadata(
    document_id: str,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> DocumentResponse:
    return document_store.get_document(user=current_user, document_id=document_id)


@router.get(
    "/documents/{document_id}/download",
    status_code=status.HTTP_200_OK,
    summary="Secure Document Download / View",
    description="Streams authorized PDF binary with secure content disposition headers.",
)
async def download_document(
    document_id: str,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> Response:
    content, filename = document_store.download_document(user=current_user, document_id=document_id)
    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
    }
    return Response(
        content=content,
        media_type="application/pdf",
        headers=headers,
    )


@router.delete(
    "/documents/{document_id}",
    response_model=DocumentDeleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete Document",
    description="Deletes document metadata and enqueues binary cleanup via the durable outbox queue. Only permitted for uploader while in draft/deficiency resolution.",
)
async def delete_document(
    document_id: str,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> DocumentDeleteResponse:
    return document_store.delete_document(user=current_user, document_id=document_id)


@router.patch(
    "/documents/{document_id}/review",
    response_model=DocumentResponse,
    status_code=status.HTTP_200_OK,
    summary="Review Document Evaluation",
    description="Records regulatory scrutiny officer verification, deficiency flagging, or rejection with mandatory comments.",
)
async def review_document(
    document_id: str,
    review_req: DocumentReviewRequest,
    current_user: UserAuthPayload = Depends(get_current_user),
) -> DocumentResponse:
    return document_store.review_document(
        user=current_user,
        document_id=document_id,
        status_val=review_req.verification_status,
        comments=review_req.review_comments,
    )
