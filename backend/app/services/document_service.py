"""Authoritative Document Service for AICTE Approval Intelligence Platform (Module 4).

Manages statutory application document uploads, PDF signature & structural validation,
safe storage path generation, metadata persistence, regulatory reviews, download authorization,
and deletion outbox queue coordination.
"""

import io
import re
import uuid
import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from uuid import UUID

import httpx
import pypdf
from pypdf.errors import PdfReadError
from fastapi import HTTPException, status, UploadFile
from fastapi.responses import Response

from app.core.config import settings
from app.schemas.auth import UserAuthPayload
from app.schemas.documents import (
    DocumentTypeEnum,
    DocumentVerificationStatusEnum,
    DocumentResponse,
    DocumentListResponse,
    DocumentChecklistItem,
    DocumentChecklistResponse,
    DocumentDeleteResponse,
    DOCUMENT_TYPE_METADATA,
)
from app.services.application_store import application_store

logger = logging.getLogger("aicte.document_service")

# Storage constants
DOCUMENT_STORAGE_BUCKET = "aip-application-documents"
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MiB limit
ALLOWED_MIME_TYPES = {"application/pdf"}
EDITABLE_APPLICATION_STATUSES = {"draft", "deficiency_resolution"}
REGULATORY_REVIEWER_ROLES = {
    "regional_scrutiny_officer",
    "evc_evaluator",
    "shc_member",
    "aicte_executive_admin",
}


def sanitize_filename(name: str) -> str:
    """Strips path traversal elements, control characters, and normalizes display filename."""
    if not name:
        return "document.pdf"
    clean = re.sub(r"[\\/]", "_", name.strip())
    clean = re.sub(r"\.\.+", "_", clean)
    clean = re.sub(r"[^\w\.\-\s]", "_", clean)
    if not clean.lower().endswith(".pdf"):
        clean += ".pdf"
    return clean[:255]


def validate_pdf_content(content: bytes, original_filename: str) -> str:
    """Validates file size, PDF magic signature bytes, and structural integrity via pypdf.

    Returns the calculated SHA-256 hex digest.
    Raises HTTPException(400) if corrupt, oversized, or invalid.
    """
    if not content or len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum permitted limit of 10 MiB ({len(content)} bytes uploaded).",
        )

    # 1. Check PDF Magic Bytes (%PDF-)
    if not content.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file signature. File header does not match standard PDF (%PDF-).",
        )

    # 2. Structural validation via pypdf
    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        if len(reader.pages) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Malformed PDF: The document contains 0 pages.",
            )
    except PdfReadError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Corrupt or unreadable PDF document: {str(e)}",
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse and validate PDF structure: {str(e)}",
        )

    # 3. Calculate SHA-256 Checksum
    return hashlib.sha256(content).hexdigest()


class InMemoryDocumentStore:
    """In-memory store for unit testing, offline development, and AST simulation."""

    def __init__(self):
        self._documents: Dict[str, Dict[str, Any]] = {}
        self._binaries: Dict[Tuple[str, str], bytes] = {}

    def upload_document(
        self,
        user: UserAuthPayload,
        app_id: str,
        document_type: DocumentTypeEnum,
        filename: str,
        content: bytes,
    ) -> DocumentResponse:
        app = application_store.get_application(user, app_id)
        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{app_id}' not found.",
            )

        # Check editable status
        is_admin = user.role == "aicte_executive_admin"
        if not is_admin and app.current_status not in EDITABLE_APPLICATION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Document uploads are not permitted while application is in '{app.current_status}' status.",
            )

        safe_name = sanitize_filename(filename)
        sha256_hash = validate_pdf_content(content, safe_name)

        doc_id = str(uuid.uuid4())
        unique_obj_name = f"{doc_id}.pdf"
        storage_path = f"{app_id}/{unique_obj_name}"
        now = datetime.now(timezone.utc)

        doc_record = {
            "id": doc_id,
            "application_id": app_id,
            "document_type": document_type.value,
            "original_filename": safe_name,
            "storage_bucket": DOCUMENT_STORAGE_BUCKET,
            "storage_path": storage_path,
            "mime_type": "application/pdf",
            "file_size_bytes": len(content),
            "file_hash_sha256": sha256_hash,
            "uploaded_by": user.id,
            "uploaded_at": now.isoformat(),
            "verification_status": DocumentVerificationStatusEnum.PENDING_REVIEW.value,
            "reviewed_by": None,
            "reviewed_at": None,
            "review_comments": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }

        self._documents[doc_id] = doc_record
        self._binaries[(DOCUMENT_STORAGE_BUCKET, storage_path)] = content

        return DocumentResponse(**doc_record)

    def list_documents(self, user: UserAuthPayload, app_id: str) -> List[DocumentResponse]:
        # Validate caller access to application
        application_store.get_application(user, app_id)

        matching = [
            DocumentResponse(**doc)
            for doc in self._documents.values()
            if doc["application_id"] == app_id
        ]
        matching.sort(key=lambda d: d.created_at, reverse=True)
        return matching

    def get_document(self, user: UserAuthPayload, document_id: str) -> DocumentResponse:
        doc = self._documents.get(document_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document with ID '{document_id}' not found.",
            )
        # Authorize via application
        application_store.get_application(user, doc["application_id"])
        return DocumentResponse(**doc)

    def download_document(self, user: UserAuthPayload, document_id: str) -> Tuple[bytes, str]:
        doc = self.get_document(user, document_id)
        key = (doc.storage_bucket, doc.storage_path)
        content = self._binaries.get(key)
        if content is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Storage binary for document not found.",
            )
        return content, doc.original_filename

    def delete_document(self, user: UserAuthPayload, document_id: str) -> DocumentDeleteResponse:
        doc = self._documents.get(document_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document with ID '{document_id}' not found.",
            )

        app = application_store.get_application(user, doc["application_id"])
        is_admin = user.role == "aicte_executive_admin"

        if not is_admin:
            if doc["uploaded_by"] != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access Denied: You can only delete documents that you uploaded.",
                )
            if app.current_status not in EDITABLE_APPLICATION_STATUSES:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Document deletion is not permitted while application is in '{app.current_status}' status.",
                )

        storage_path = doc["storage_path"]
        del self._documents[document_id]
        self._binaries.pop((DOCUMENT_STORAGE_BUCKET, storage_path), None)

        return DocumentDeleteResponse(
            message="Document metadata successfully deleted. Storage binary cleanup enqueued.",
            document_id=UUID(document_id),
            storage_path=storage_path,
            queued_for_cleanup=True,
        )

    def review_document(
        self,
        user: UserAuthPayload,
        document_id: str,
        status_val: DocumentVerificationStatusEnum,
        comments: Optional[str],
    ) -> DocumentResponse:
        if user.role not in REGULATORY_REVIEWER_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: Only regulatory scrutiny officers and administrators may evaluate documents.",
            )

        if status_val == DocumentVerificationStatusEnum.PENDING_REVIEW:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Review outcome must be 'verified_valid', 'deficiency_flagged', or 'rejected'.",
            )

        if status_val in (DocumentVerificationStatusEnum.DEFICIENCY_FLAGGED, DocumentVerificationStatusEnum.REJECTED):
            if not comments or not comments.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Review remarks are mandatory when flagging a deficiency or rejecting a document.",
                )

        doc = self._documents.get(document_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document with ID '{document_id}' not found.",
            )

        # Authorize reviewer to access application
        application_store.get_application(user, doc["application_id"])

        now = datetime.now(timezone.utc)
        doc["verification_status"] = status_val.value
        doc["reviewed_by"] = user.id
        doc["reviewed_at"] = now.isoformat()
        doc["review_comments"] = comments.strip() if comments else None
        doc["updated_at"] = now.isoformat()

        return DocumentResponse(**doc)

    def get_checklist(self, user: UserAuthPayload, app_id: str) -> DocumentChecklistResponse:
        app = application_store.get_application(user, app_id)
        docs = self.list_documents(user, app_id)

        docs_by_type: Dict[DocumentTypeEnum, DocumentResponse] = {}
        for d in docs:
            # Pick latest document for type
            if d.document_type not in docs_by_type:
                docs_by_type[d.document_type] = d

        checklist_items: List[DocumentChecklistItem] = []
        mandatory_count = 0
        uploaded_mandatory_count = 0

        for doc_type, meta in DOCUMENT_TYPE_METADATA.items():
            is_mand = app.application_type in meta.get("required_for", [])
            doc_present = docs_by_type.get(doc_type)

            if is_mand:
                mandatory_count += 1
                if doc_present:
                    uploaded_mandatory_count += 1

            status_str = "missing"
            if doc_present:
                status_str = doc_present.verification_status.value

            checklist_items.append(
                DocumentChecklistItem(
                    document_type=doc_type,
                    title=meta["title"],
                    description=meta["description"],
                    is_mandatory=is_mand,
                    status=status_str,
                    document=doc_present,
                )
            )

        is_complete = (mandatory_count > 0) and (uploaded_mandatory_count == mandatory_count)

        return DocumentChecklistResponse(
            application_id=UUID(app_id),
            application_type=app.application_type,
            is_complete=is_complete,
            mandatory_count=mandatory_count,
            uploaded_mandatory_count=uploaded_mandatory_count,
            items=checklist_items,
        )


class SupabaseDocumentStore:
    """Authoritative Supabase PostgreSQL & Storage-backed document service with RLS."""

    def __init__(self, supabase_url: str, supabase_key: str):
        self._url = supabase_url.rstrip("/")
        self._anon_key = supabase_key
        self._service_key = settings.SUPABASE_SERVICE_ROLE_KEY or supabase_key

    def _user_headers(self, user: UserAuthPayload) -> Dict[str, str]:
        token = user.access_token or self._anon_key
        return {
            "apikey": self._anon_key,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def _service_headers(self) -> Dict[str, str]:
        return {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
        }

    def upload_document(
        self,
        user: UserAuthPayload,
        app_id: str,
        document_type: DocumentTypeEnum,
        filename: str,
        content: bytes,
    ) -> DocumentResponse:
        # 1. Authorize application access and editable status
        app = application_store.get_application(user, app_id)
        is_admin = user.role == "aicte_executive_admin"
        if not is_admin and app.current_status not in EDITABLE_APPLICATION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Document uploads are not permitted while application is in '{app.current_status}' status.",
            )

        # 2. Sanitize and validate PDF
        safe_name = sanitize_filename(filename)
        sha256_hash = validate_pdf_content(content, safe_name)

        doc_id = str(uuid.uuid4())
        unique_obj_name = f"{doc_id}.pdf"
        storage_path = f"{app_id}/{unique_obj_name}"

        # 3. Upload binary to Supabase Storage via user token (enforces storage.objects INSERT RLS)
        storage_url = f"{self._url}/storage/v1/object/{DOCUMENT_STORAGE_BUCKET}/{storage_path}"
        user_headers = {
            "apikey": self._anon_key,
            "Authorization": f"Bearer {user.access_token or self._anon_key}",
            "Content-Type": "application/pdf",
        }

        try:
            with httpx.Client(timeout=30.0) as client:
                upload_res = client.post(storage_url, headers=user_headers, content=content)
        except Exception as e:
            logger.error("Storage upload network failure: %s", str(e))
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Storage upload connection failed: {str(e)}",
            )

        if upload_res.status_code not in (200, 201):
            err_text = upload_res.text[:300]
            logger.error("Storage upload failed (HTTP %d): %s", upload_res.status_code, err_text)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Storage rejected document upload: {err_text}",
            )

        # 4. Insert authoritative PostgreSQL metadata row
        db_url = f"{self._url}/rest/v1/application_documents"
        doc_payload = {
            "id": doc_id,
            "application_id": app_id,
            "document_type": document_type.value,
            "original_filename": safe_name,
            "storage_bucket": DOCUMENT_STORAGE_BUCKET,
            "storage_path": storage_path,
            "mime_type": "application/pdf",
            "file_size_bytes": len(content),
            "file_hash_sha256": sha256_hash,
            "uploaded_by": user.id,
            "verification_status": DocumentVerificationStatusEnum.PENDING_REVIEW.value,
        }

        db_headers = {
            **self._user_headers(user),
            "Prefer": "return=representation",
        }

        try:
            with httpx.Client(timeout=15.0) as client:
                db_res = client.post(db_url, headers=db_headers, json=doc_payload)
        except Exception as e:
            # COMPENSATING CLEANUP: Remove binary from storage to avoid orphan
            self._compensating_delete(storage_path)
            logger.error("Database insert failed, issued compensating storage delete: %s", str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to record document metadata: {str(e)}",
            )

        if db_res.status_code not in (200, 201):
            # COMPENSATING CLEANUP
            self._compensating_delete(storage_path)
            err_text = db_res.text[:300]
            logger.error("Metadata insert rejected, issued compensating storage delete: %s", err_text)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Database rejected document registration: {err_text}",
            )

        rows = db_res.json()
        return DocumentResponse(**rows[0])

    def _compensating_delete(self, storage_path: str):
        """Immediately cleans up storage object if metadata registration failed."""
        try:
            del_url = f"{self._url}/storage/v1/object/{DOCUMENT_STORAGE_BUCKET}/{storage_path}"
            with httpx.Client(timeout=10.0) as client:
                client.delete(del_url, headers=self._service_headers())
        except Exception as e:
            logger.error("Compensating storage delete failed for %s: %s", storage_path, str(e))

    def list_documents(self, user: UserAuthPayload, app_id: str) -> List[DocumentResponse]:
        # Validate application access
        application_store.get_application(user, app_id)

        url = f"{self._url}/rest/v1/application_documents?application_id=eq.{app_id}&order=created_at.desc"
        headers = self._user_headers(user)
        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.get(url, headers=headers)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database connection error: {str(e)}",
            )

        if res.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to query documents: {res.text[:300]}",
            )

        return [DocumentResponse(**row) for row in res.json()]

    def get_document(self, user: UserAuthPayload, document_id: str) -> DocumentResponse:
        url = f"{self._url}/rest/v1/application_documents?id=eq.{document_id}"
        headers = self._user_headers(user)
        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.get(url, headers=headers)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database connection error: {str(e)}",
            )

        if res.status_code != 200 or not res.json():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document '{document_id}' not found or access denied.",
            )

        return DocumentResponse(**res.json()[0])

    def download_document(self, user: UserAuthPayload, document_id: str) -> Tuple[bytes, str]:
        # Verify access via RLS metadata check
        doc = self.get_document(user, document_id)

        # Retrieve binary from private storage using authorized service context
        download_url = f"{self._url}/storage/v1/object/authenticated/{doc.storage_bucket}/{doc.storage_path}"
        headers = self._service_headers()

        try:
            with httpx.Client(timeout=30.0) as client:
                res = client.get(download_url, headers=headers)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Storage download connection failed: {str(e)}",
            )

        if res.status_code != 200:
            logger.error("Storage download failed (HTTP %d): %s", res.status_code, res.text[:300])
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document file content not found in storage.",
            )

        return res.content, doc.original_filename

    def delete_document(self, user: UserAuthPayload, document_id: str) -> DocumentDeleteResponse:
        doc = self.get_document(user, document_id)
        app = application_store.get_application(user, str(doc.application_id))

        is_admin = user.role == "aicte_executive_admin"
        if not is_admin:
            if str(doc.uploaded_by) != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access Denied: You can only delete documents that you uploaded.",
                )
            if app.current_status not in EDITABLE_APPLICATION_STATUSES:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Document deletion is not permitted while application is in '{app.current_status}' status.",
                )

        # Execute DELETE on metadata table.
        # The deployed trigger `tr_enqueue_document_storage_deletion` automatically
        # enqueues the storage path into `document_storage_deletion_queue`!
        url = f"{self._url}/rest/v1/application_documents?id=eq.{document_id}"
        headers = {
            **self._user_headers(user),
            "Prefer": "return=minimal",
        }

        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.delete(url, headers=headers)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database connection error: {str(e)}",
            )

        if res.status_code not in (200, 204):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to delete document: {res.text[:300]}",
            )

        return DocumentDeleteResponse(
            message="Document metadata deleted. Storage binary cleanup enqueued via durable outbox.",
            document_id=doc.id,
            storage_path=doc.storage_path,
            queued_for_cleanup=True,
        )

    def review_document(
        self,
        user: UserAuthPayload,
        document_id: str,
        status_val: DocumentVerificationStatusEnum,
        comments: Optional[str],
    ) -> DocumentResponse:
        if user.role not in REGULATORY_REVIEWER_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: Only regulatory scrutiny officers and administrators may evaluate documents.",
            )

        if status_val == DocumentVerificationStatusEnum.PENDING_REVIEW:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Review outcome must be 'verified_valid', 'deficiency_flagged', or 'rejected'.",
            )

        if status_val in (DocumentVerificationStatusEnum.DEFICIENCY_FLAGGED, DocumentVerificationStatusEnum.REJECTED):
            if not comments or not comments.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Review remarks are mandatory when flagging a deficiency or rejecting a document.",
                )

        doc = self.get_document(user, document_id)

        # Trigger `tr_protect_document_metadata_mutation` automatically stamps reviewed_by and reviewed_at
        update_payload = {
            "verification_status": status_val.value,
            "review_comments": comments.strip() if comments else None,
        }

        url = f"{self._url}/rest/v1/application_documents?id=eq.{document_id}"
        headers = {
            **self._user_headers(user),
            "Prefer": "return=representation",
        }

        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.patch(url, headers=headers, json=update_payload)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database connection error: {str(e)}",
            )

        if res.status_code not in (200, 204) or not res.json():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to record review determination: {res.text[:300]}",
            )

        return DocumentResponse(**res.json()[0])

    def get_checklist(self, user: UserAuthPayload, app_id: str) -> DocumentChecklistResponse:
        app = application_store.get_application(user, app_id)
        docs = self.list_documents(user, app_id)

        docs_by_type: Dict[DocumentTypeEnum, DocumentResponse] = {}
        for d in docs:
            if d.document_type not in docs_by_type:
                docs_by_type[d.document_type] = d

        checklist_items: List[DocumentChecklistItem] = []
        mandatory_count = 0
        uploaded_mandatory_count = 0

        for doc_type, meta in DOCUMENT_TYPE_METADATA.items():
            is_mand = app.application_type in meta.get("required_for", [])
            doc_present = docs_by_type.get(doc_type)

            if is_mand:
                mandatory_count += 1
                if doc_present:
                    uploaded_mandatory_count += 1

            status_str = "missing"
            if doc_present:
                status_str = doc_present.verification_status.value

            checklist_items.append(
                DocumentChecklistItem(
                    document_type=doc_type,
                    title=meta["title"],
                    description=meta["description"],
                    is_mandatory=is_mand,
                    status=status_str,
                    document=doc_present,
                )
            )

        is_complete = (mandatory_count > 0) and (uploaded_mandatory_count == mandatory_count)

        return DocumentChecklistResponse(
            application_id=UUID(app_id),
            application_type=app.application_type,
            is_complete=is_complete,
            mandatory_count=mandatory_count,
            uploaded_mandatory_count=uploaded_mandatory_count,
            items=checklist_items,
        )


class HybridDocumentStore:
    """Dispatches document operations based on runtime configuration and JWT authenticity."""

    def __init__(self):
        self._mock_store = InMemoryDocumentStore()

    def _get_store(self, user: UserAuthPayload):
        url = settings.supabase_url
        key = settings.supabase_key

        if (
            url
            and key
            and user.access_token
            and not getattr(user, "is_mock", False)
            and not getattr(settings, "MOCK_PERSISTENCE", False)
        ):
            return SupabaseDocumentStore(supabase_url=url, supabase_key=key)

        return self._mock_store

    def upload_document(
        self,
        user: UserAuthPayload,
        app_id: str,
        document_type: DocumentTypeEnum,
        filename: str,
        content: bytes,
    ) -> DocumentResponse:
        return self._get_store(user).upload_document(user, app_id, document_type, filename, content)

    def list_documents(self, user: UserAuthPayload, app_id: str) -> List[DocumentResponse]:
        return self._get_store(user).list_documents(user, app_id)

    def get_document(self, user: UserAuthPayload, document_id: str) -> DocumentResponse:
        return self._get_store(user).get_document(user, document_id)

    def download_document(self, user: UserAuthPayload, document_id: str) -> Tuple[bytes, str]:
        return self._get_store(user).download_document(user, document_id)

    def delete_document(self, user: UserAuthPayload, document_id: str) -> DocumentDeleteResponse:
        return self._get_store(user).delete_document(user, document_id)

    def review_document(
        self,
        user: UserAuthPayload,
        document_id: str,
        status_val: DocumentVerificationStatusEnum,
        comments: Optional[str],
    ) -> DocumentResponse:
        return self._get_store(user).review_document(user, document_id, status_val, comments)

    def get_checklist(self, user: UserAuthPayload, app_id: str) -> DocumentChecklistResponse:
        return self._get_store(user).get_checklist(user, app_id)


# Primary document store singleton
document_store = HybridDocumentStore()
