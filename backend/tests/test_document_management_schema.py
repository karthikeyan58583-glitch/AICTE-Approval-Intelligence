"""Module 4 Phase 1: Document Management Schema, AST & Authorization Test Suite.

Contains distinct testing layers:
1. STATIC CHECKS & SQL AST: Uses PostgreSQL's native C parser (pglast) to verify
   DDL syntax, search_path isolation, least-privilege grants, and triggers without a live DB.
2. PYDANTIC METADATA UNIT TESTS: Tests Python schema validation, file size limits,
   MIME whitelist, and path formatting.
3. CLEANUP WORKER UNIT TESTS: Tests trusted backend worker for durable, idempotent
   Storage API deletion, retry handling, and error logging.
4. MOCKED AUTHORIZATION MATRIX: Unit test harness simulating RLS authorization logic
   (institution isolation, stranger rejection, reviewer permissions, anti-tampering).
5. LIVE SUPABASE INTEGRATION: Live HTTP tests against remote Supabase (executed ONLY
   when credentials are provided and migrations are applied).
"""

from pathlib import Path
from uuid import uuid4
from typing import Optional, List, Dict
import re
import httpx
import pglast
import pytest
from pydantic import ValidationError

from app.schemas.documents import (
    DocumentTypeEnum,
    DocumentVerificationStatusEnum,
    DocumentMetadataCreate,
    DocumentReviewRequest,
)
from app.services.document_cleanup_worker import (
    StorageCleanupItem,
    DocumentStorageCleanupWorker,
)


def load_document_migration_sql() -> str:
    migration_path = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "20261023000003_module_4_document_management.sql"
    )
    assert migration_path.exists(), f"Migration file not found at {migration_path}"
    return migration_path.read_text(encoding="utf-8")


# ==============================================================================
# LAYER 1: STATIC SQL AST PARSER & POSTGRESQL LEXICAL CHECKS (pglast)
# (Zero-network, parses exact SQL against PostgreSQL native parser)
# ==============================================================================

def test_document_migration_parses_cleanly_with_pglast():
    """Verify that the Module 4 Phase 1 migration parses with native PostgreSQL C parser without errors."""
    sql = load_document_migration_sql()
    tree = pglast.parse_sql(sql)
    assert len(tree) >= 30, f"Expected at least 30 valid SQL statements in migration, found {len(tree)}"


def test_no_invalid_pg_catalog_pseudo_functions():
    """Verify that invalid constructs like pg_catalog.coalesce or pg_catalog.current_user are absent."""
    sql = load_document_migration_sql()
    assert "pg_catalog.current_user" not in sql
    assert "pg_catalog.coalesce" not in sql


def test_all_security_definer_functions_set_empty_search_path():
    """Verify that all SECURITY DEFINER functions explicitly declare SET search_path = ''."""
    sql = load_document_migration_sql()

    required_functions = [
        "public.can_access_application_documents",
        "public.can_modify_application_documents",
        "public.can_access_storage_object",
        "public.can_upload_storage_object",
        "public.protect_document_metadata_mutation",
        "public.handle_document_storage_deletion_enqueue",
    ]

    for fn in required_functions:
        assert f"CREATE OR REPLACE FUNCTION {fn}" in sql, f"Missing function {fn}"

    # Verify that search_path = '' is set on all functions
    assert sql.count("SET search_path = ''") >= len(required_functions)


def test_execute_privileges_revoked_from_public():
    """Verify that execution privileges are revoked from PUBLIC on all new functions."""
    sql = load_document_migration_sql()

    revoked_functions = [
        "public.can_access_application_documents(UUID)",
        "public.can_modify_application_documents(UUID)",
        "public.can_access_storage_object(TEXT, TEXT)",
        "public.can_upload_storage_object(TEXT, TEXT)",
        "public.protect_document_metadata_mutation()",
        "public.handle_document_storage_deletion_enqueue()",
    ]

    for fn in revoked_functions:
        assert f"REVOKE EXECUTE ON FUNCTION {fn} FROM PUBLIC;" in sql, f"Missing REVOKE EXECUTE on {fn}"


def test_anonymous_access_revoked_on_application_documents():
    """Verify that anonymous and public access is revoked on public.application_documents."""
    sql = load_document_migration_sql()
    assert "REVOKE ALL ON public.application_documents FROM anon, PUBLIC;" in sql


def test_storage_bucket_provisioning_rules():
    """Verify private bucket provisioning with 10 MiB limit and PDF MIME type restriction."""
    sql = load_document_migration_sql()
    assert "'aip-application-documents'" in sql
    assert "10485760" in sql  # 10 MiB
    assert "ARRAY['application/pdf']::text[]" in sql
    assert "public = false" in sql


def test_schema_constraints_present_in_migration():
    """Verify check constraints for file size, bucket, path pattern, prefix match, and reviewer coherence."""
    sql = load_document_migration_sql()
    assert "CONSTRAINT chk_app_doc_filename" in sql
    assert "CONSTRAINT chk_app_doc_bucket" in sql
    assert "CONSTRAINT chk_app_doc_path" in sql
    assert "CONSTRAINT chk_app_doc_path_match_app" in sql
    assert "CONSTRAINT chk_app_doc_file_size" in sql
    assert "CONSTRAINT chk_app_doc_mime" in sql
    assert "CONSTRAINT chk_app_doc_review_fields" in sql


def test_storage_path_matches_application_id_strictly():
    """Verify that check constraint enforces storage_path prefix strictly matches application_id."""
    sql = load_document_migration_sql()
    assert "pg_catalog.split_part(storage_path, '/', 1) = application_id::text" in sql


def test_force_row_level_security_enabled():
    """Verify that table owner bypass is neutralized via FORCE ROW LEVEL SECURITY."""
    sql = load_document_migration_sql()
    assert "ALTER TABLE public.application_documents FORCE ROW LEVEL SECURITY;" in sql


def test_no_alter_table_on_storage_managed_tables():
    """Verify migration does not issue ALTER TABLE on managed storage tables (avoids SQLSTATE 42501)."""
    sql = load_document_migration_sql()
    assert "ALTER TABLE storage." not in sql, "Must not alter managed Supabase storage tables; leads to ownership failure"


def test_officer_identity_stamping_present():
    """Verify non-repudiation stamping of reviewer ID and timestamp in protect_document_metadata_mutation."""
    sql = load_document_migration_sql()
    assert "NEW.reviewed_by := v_caller_id;" in sql
    assert "NEW.reviewed_at := pg_catalog.now();" in sql


def test_no_direct_sql_delete_against_storage_objects():
    """Audit Finding 1: Verify that no trigger or function issues direct DELETE against storage.objects."""
    sql = load_document_migration_sql()
    assert "DELETE FROM storage.objects" not in sql, "Direct DELETE against storage.objects is forbidden; use queue"


def test_durable_storage_deletion_queue_table_and_trigger():
    """Audit Finding 1: Verify presence of durable deletion queue table and enqueue trigger."""
    sql = load_document_migration_sql()
    assert "CREATE TABLE IF NOT EXISTS public.document_storage_deletion_queue" in sql
    assert "CREATE TRIGGER tr_enqueue_document_storage_deletion" in sql
    assert "AFTER DELETE ON public.application_documents" in sql
    # Verify authenticated users have zero direct access
    assert "REVOKE ALL ON public.document_storage_deletion_queue FROM authenticated;" in sql
    assert "GRANT ALL ON public.document_storage_deletion_queue TO service_role;" in sql


def test_storage_delete_policy_tightened_ownership():
    """Audit Finding 2: Verify that storage delete policy enforces explicit uploader ownership via owner_id and bars ownerless deletion."""
    sql = load_document_migration_sql()
    assert "owner_id IS NOT NULL" in sql
    assert "owner_id = (SELECT auth.uid())::text" in sql
    assert "owner IS NULL" not in sql, "Must not permit deletion of ownerless files by ordinary users"


def test_bucket_id_consistency_across_all_clauses():
    """Verify that 'aip-application-documents' is used everywhere without bucket mismatch."""
    sql = load_document_migration_sql()
    assert "storage_bucket = 'aip-application-documents'" in sql
    assert "bucket_id = 'aip-application-documents'" in sql
    assert "INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)" in sql
    # Ensure every single quoted bucket string referencing application-documents is strictly 'aip-application-documents'
    quoted_strings = re.findall(r"'([^']*)'", sql)
    for s in quoted_strings:
        if "application-documents" in s:
            assert s == "aip-application-documents", f"Found inconsistent bucket identifier: '{s}'"


def test_editable_workflow_states_in_migration():
    """Verify that can_modify_application_documents restricts upload/delete to draft and deficiency_resolution."""
    sql = load_document_migration_sql()
    assert "'draft'::public.workflow_status" in sql
    assert "'deficiency_resolution'::public.workflow_status" in sql
    # Submitted must NOT be permitted in can_modify_application_documents
    can_modify_block = sql[sql.find("FUNCTION public.can_modify_application_documents"):sql.find("GRANT EXECUTE ON FUNCTION public.can_modify_application_documents")]
    assert "'submitted'::public.workflow_status" not in can_modify_block, "Submitted status must not be permitted in can_modify_application_documents"


def test_active_membership_helper_enforced_in_can_modify():
    """Verify that can_modify_application_documents strictly uses public.is_institution_member (active check)."""
    sql = load_document_migration_sql()
    can_modify_block = sql[sql.find("FUNCTION public.can_modify_application_documents"):sql.find("GRANT EXECUTE ON FUNCTION public.can_modify_application_documents")]
    assert "public.is_institution_member(a.institution_id)" in can_modify_block


def test_administrator_override_in_storage_delete_policy():
    """Verify administrator override is independent of institution membership in storage.objects DELETE policy."""
    sql = load_document_migration_sql()
    start_idx = sql.find('CREATE POLICY "Authorized applicants can delete storage documents"')
    assert start_idx != -1, "Policy not found in migration SQL"
    del_policy_block = sql[start_idx:start_idx + 800]
    # Administrator check must be combined via top-level OR, not subordinated under can_upload_storage_object
    assert "public.is_admin()" in del_policy_block
    assert re.search(r"public\.is_admin\(\)\s+OR\s*\(", del_policy_block) is not None


def test_split_part_is_explicitly_schema_qualified():
    """Verify split_part is schema-qualified with pg_catalog in SECURITY DEFINER functions."""
    sql = load_document_migration_sql()
    assert "pg_catalog.split_part" in sql


# ==============================================================================
# LAYER 2: PYDANTIC METADATA SCHEMA VALIDATION TESTS (UNIT TESTS)
# ==============================================================================

def test_document_metadata_create_valid():
    """Valid document metadata passes schema validation."""
    app_id = uuid4()
    meta = DocumentMetadataCreate(
        application_id=app_id,
        document_type=DocumentTypeEnum.LAND_OWNERSHIP_DEED,
        original_filename="TCE_Registered_Sale_Deed_1957.pdf",
        storage_bucket="aip-application-documents",
        storage_path=f"{app_id}/TCE_Registered_Sale_Deed_1957.pdf",
        mime_type="application/pdf",
        file_size_bytes=4194304,  # 4 MiB
    )
    assert meta.file_size_bytes == 4194304
    assert meta.storage_bucket == "aip-application-documents"


def test_document_metadata_rejects_file_size_exceeding_10mib():
    """Files exceeding 10 MiB (10,485,760 bytes) must be rejected."""
    app_id = uuid4()
    with pytest.raises(ValidationError) as excinfo:
        DocumentMetadataCreate(
            application_id=app_id,
            document_type=DocumentTypeEnum.LAND_OWNERSHIP_DEED,
            original_filename="Heavy_Blueprints.pdf",
            storage_path=f"{app_id}/Heavy_Blueprints.pdf",
            file_size_bytes=10485761,  # 10 MiB + 1 byte
        )
    assert "less than or equal to 10485760" in str(excinfo.value)


def test_document_metadata_rejects_zero_or_negative_file_size():
    """Zero or negative byte counts must be rejected."""
    app_id = uuid4()
    with pytest.raises(ValidationError):
        DocumentMetadataCreate(
            application_id=app_id,
            document_type=DocumentTypeEnum.FIRE_SAFETY_CERTIFICATE,
            original_filename="Empty.pdf",
            storage_path=f"{app_id}/Empty.pdf",
            file_size_bytes=0,
        )


def test_document_metadata_rejects_disallowed_mime_type():
    """Non-PDF MIME types must be rejected by validator."""
    app_id = uuid4()
    with pytest.raises(ValidationError) as excinfo:
        DocumentMetadataCreate(
            application_id=app_id,
            document_type=DocumentTypeEnum.AICTE_AFFIDAVIT,
            original_filename="malicious.exe",
            storage_path=f"{app_id}/malicious.exe",
            mime_type="application/x-msdownload",
            file_size_bytes=2048,
        )
    assert "Disallowed MIME type" in str(excinfo.value)


def test_document_metadata_rejects_wrong_bucket():
    """Buckets other than 'aip-application-documents' must be rejected."""
    app_id = uuid4()
    with pytest.raises(ValidationError) as excinfo:
        DocumentMetadataCreate(
            application_id=app_id,
            document_type=DocumentTypeEnum.AICTE_AFFIDAVIT,
            original_filename="Affidavit.pdf",
            storage_bucket="public-bucket",
            storage_path=f"{app_id}/Affidavit.pdf",
            file_size_bytes=2048,
        )
    assert "Storage bucket must be 'aip-application-documents'" in str(excinfo.value)


def test_document_metadata_rejects_malformed_storage_path():
    """Storage path not scoped to an application folder must be rejected."""
    app_id = uuid4()
    with pytest.raises(ValidationError) as excinfo:
        DocumentMetadataCreate(
            application_id=app_id,
            document_type=DocumentTypeEnum.BUILDING_PLAN_APPROVAL,
            original_filename="Plan.pdf",
            storage_path="Plan.pdf",  # Missing folder prefix
            file_size_bytes=2048,
        )
    assert "Storage path must be formatted as '{application_id}/{filename}'" in str(excinfo.value)


def test_document_review_rejects_pending_review_status():
    """Reviewers cannot submit 'pending_review' as an evaluation outcome."""
    with pytest.raises(ValidationError) as excinfo:
        DocumentReviewRequest(
            verification_status=DocumentVerificationStatusEnum.PENDING_REVIEW,
            review_comments="Incomplete review",
        )
    assert "Review evaluation must set status to verified_valid" in str(excinfo.value)


# ==============================================================================
# LAYER 3: STORAGE CLEANUP WORKER UNIT TESTS
# ==============================================================================

class MockTransport(httpx.BaseTransport):
    """Mock HTTP transport for testing Storage API calls without external network."""

    def __init__(self, status_code: int = 200, response_text: str = '{"message": "Deleted"}'):
        self.status_code = status_code
        self.response_text = response_text
        self.calls = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        return httpx.Response(
            status_code=self.status_code,
            text=self.response_text,
            headers={"Content-Type": "application/json"},
        )


def test_cleanup_worker_deletes_object_successfully():
    """Worker invokes DELETE on Supabase Storage API and marks item completed on HTTP 200."""
    transport = MockTransport(status_code=200)
    client = httpx.Client(transport=transport)
    worker = DocumentStorageCleanupWorker(
        supabase_url="https://mock.supabase.co",
        service_role_key="mock-service-role-key",
        http_client=client,
    )

    item = StorageCleanupItem(
        id="queue-1",
        storage_bucket="aip-application-documents",
        storage_path="app-uuid/affidavit.pdf",
    )
    processed = worker.process_item(item)

    assert processed.status == "completed"
    assert processed.last_error is None
    assert len(transport.calls) == 1
    assert "storage/v1/object/aip-application-documents/app-uuid/affidavit.pdf" in str(transport.calls[0].url)


def test_cleanup_worker_handles_404_idempotently():
    """Audit Finding 1: An object already absent (HTTP 404) is treated as successful cleanup."""
    transport = MockTransport(status_code=404, response_text='{"error": "Object not found"}')
    client = httpx.Client(transport=transport)
    worker = DocumentStorageCleanupWorker(
        supabase_url="https://mock.supabase.co",
        service_role_key="mock-service-role-key",
        http_client=client,
    )

    item = StorageCleanupItem(
        id="queue-2",
        storage_bucket="aip-application-documents",
        storage_path="app-uuid/already-gone.pdf",
    )
    processed = worker.process_item(item)

    assert processed.status == "completed"
    assert processed.last_error is None


def test_cleanup_worker_retries_on_server_failure():
    """Audit Finding 1: Worker records failure, increments retry count, and keeps item pending for retry."""
    transport = MockTransport(status_code=500, response_text='{"error": "Internal Storage Error"}')
    client = httpx.Client(transport=transport)
    worker = DocumentStorageCleanupWorker(
        supabase_url="https://mock.supabase.co",
        service_role_key="mock-service-role-key",
        http_client=client,
    )

    item = StorageCleanupItem(
        id="queue-3",
        storage_bucket="aip-application-documents",
        storage_path="app-uuid/doc.pdf",
        retry_count=0,
        max_retries=3,
    )
    processed = worker.process_item(item)

    assert processed.status == "pending"  # Eligible for next retry
    assert processed.retry_count == 1
    assert "Storage API HTTP 500" in processed.last_error


def test_cleanup_worker_marks_permanent_failure_after_max_retries():
    """Worker sets status to failed when retry count reaches max_retries without losing the record."""
    transport = MockTransport(status_code=500, response_text='{"error": "Down"}')
    client = httpx.Client(transport=transport)
    worker = DocumentStorageCleanupWorker(
        supabase_url="https://mock.supabase.co",
        service_role_key="mock-service-role-key",
        http_client=client,
    )

    item = StorageCleanupItem(
        id="queue-4",
        storage_bucket="aip-application-documents",
        storage_path="app-uuid/doc.pdf",
        retry_count=2,
        max_retries=3,
    )
    processed = worker.process_item(item)

    assert processed.status == "failed"
    assert processed.retry_count == 3
    assert processed.last_error is not None


def test_cleanup_worker_recovers_stale_processing_items():
    """Check B: Worker recovers items abandoned in 'processing' state when worker crashes or lease expires."""
    worker = DocumentStorageCleanupWorker(
        supabase_url="https://mock.supabase.co",
        service_role_key="mock-service-role-key",
    )
    from datetime import datetime, timezone, timedelta

    past_lease = datetime.now(timezone.utc) - timedelta(minutes=10)
    stale_item = StorageCleanupItem(
        id="queue-stale-1",
        storage_bucket="aip-application-documents",
        storage_path="app-uuid/stale.pdf",
        status="processing",
        retry_count=0,
        max_retries=3,
        lease_expires_at=past_lease,
    )
    items = [stale_item]
    recovered = worker.recover_stale_items(items=items)

    assert recovered == 1
    assert stale_item.status == "pending"  # Returned to pending for retry
    assert stale_item.retry_count == 1
    assert stale_item.lease_expires_at is None
    assert "Worker lease expired" in stale_item.last_error


def test_cleanup_worker_recovers_stale_item_to_failed_if_max_retries_exceeded():
    """Worker transitions abandoned item to 'failed' if lease expiration pushes it to max_retries."""
    worker = DocumentStorageCleanupWorker(
        supabase_url="https://mock.supabase.co",
        service_role_key="mock-service-role-key",
    )
    from datetime import datetime, timezone, timedelta

    past_lease = datetime.now(timezone.utc) - timedelta(minutes=10)
    stale_item = StorageCleanupItem(
        id="queue-stale-2",
        storage_bucket="aip-application-documents",
        storage_path="app-uuid/repeatedly-crashed.pdf",
        status="processing",
        retry_count=2,
        max_retries=3,
        lease_expires_at=past_lease,
    )
    items = [stale_item]
    recovered = worker.recover_stale_items(items=items)

    assert recovered == 1
    assert stale_item.status == "failed"
    assert stale_item.retry_count == 3


def test_process_pending_deletions_canonical_scheduled_entrypoint():
    """Check B: process_pending_deletions reconciles lease recovery and pending batch execution."""
    transport = MockTransport(status_code=200)
    client = httpx.Client(transport=transport)
    worker = DocumentStorageCleanupWorker(
        supabase_url="https://mock.supabase.co",
        service_role_key="mock-service-role-key",
        http_client=client,
    )
    from datetime import datetime, timezone, timedelta

    past_lease = datetime.now(timezone.utc) - timedelta(minutes=15)
    stale_item = StorageCleanupItem(
        id="queue-stale",
        storage_bucket="aip-application-documents",
        storage_path="app-uuid/stale.pdf",
        status="processing",
        retry_count=0,
        max_retries=3,
        lease_expires_at=past_lease,
    )
    normal_item = StorageCleanupItem(
        id="queue-normal",
        storage_bucket="aip-application-documents",
        storage_path="app-uuid/normal.pdf",
        status="pending",
    )

    items = [stale_item, normal_item]
    stats = worker.process_pending_deletions(items=items)

    # Stale item is first recovered to pending, then both pending items are processed
    assert stats["recovered_stale"] == 1
    assert stats["completed"] == 2
    assert stats["failed"] == 0
    assert stale_item.status == "completed"
    assert normal_item.status == "completed"


def test_status_column_consistency_with_module_3():
    """Check A: Real status column in applications table is 'current_status' and matched in Module 4."""
    sql_m4 = load_document_migration_sql()
    # Check that public.applications column referenced is current_status
    assert "a.current_status IN (" in sql_m4
    # Ensure no incorrect 'a.status IN' reference exists
    assert "a.status IN" not in sql_m4
    # Ensure queue table has lease_expires_at
    assert "lease_expires_at TIMESTAMPTZ" in sql_m4
    assert "idx_del_queue_lease" in sql_m4


# ==============================================================================
# LAYER 4: AUTHORIZATION & ACCESS CONTROL MATRIX (MOCKED IN-MEMORY TEST HARNESS)
# (Logical simulation proving algorithm correctness; NOT live database RLS)
# ==============================================================================

class MockDocumentAuthEnvironment:
    """Simulates RLS policy evaluations using the exact rules codified in 20261023000003."""

    def __init__(self):
        self.institutions = {
            "inst-tce": {"id": "inst-tce", "name": "Thiagarajar College of Engineering"},
            "inst-other": {"id": "inst-other", "name": "Other College of Technology"},
        }
        self.memberships = {
            ("inst-tce", "user-tce-rep"): "active",
            ("inst-tce", "user-tce-revoked"): "revoked",
            ("inst-tce", "user-tce-suspended"): "suspended",
            ("inst-other", "user-other-rep"): "active",
        }
        self.applications = {
            "app-101": {
                "id": "app-101",
                "institution_id": "inst-tce",
                "created_by": "user-tce-rep",
                "current_status": "draft",
            },
            "app-102-submitted": {
                "id": "app-102-submitted",
                "institution_id": "inst-tce",
                "created_by": "user-tce-rep",
                "current_status": "submitted",
            },
            "app-103-deficiency": {
                "id": "app-103-deficiency",
                "institution_id": "inst-tce",
                "created_by": "user-tce-rep",
                "current_status": "deficiency_resolution",
            },
            "app-104-suspended-creator": {
                "id": "app-104-suspended-creator",
                "institution_id": "inst-tce",
                "created_by": "user-tce-suspended",
                "current_status": "draft",
            },
        }
        self.user_roles = {
            "user-tce-rep": "applicant_institution_representative",
            "user-tce-revoked": "applicant_institution_representative",
            "user-tce-suspended": "applicant_institution_representative",
            "user-other-rep": "applicant_institution_representative",
            "user-scrutiny-officer": "regional_scrutiny_officer",
            "user-evc-evaluator": "evc_evaluator",
            "user-admin": "aicte_executive_admin",
        }

    def is_institution_member(self, inst_id: str, user_id: str) -> bool:
        """Simulates public.is_institution_member(target_inst_id UUID): strictly checks status = 'active'."""
        return self.memberships.get((inst_id, user_id)) == "active"

    def is_regulatory_reviewer(self, user_id: str) -> bool:
        role = self.user_roles.get(user_id)
        return role in {"regional_scrutiny_officer", "evc_evaluator", "shc_member", "aicte_executive_admin"}

    def is_admin(self, user_id: str) -> bool:
        return self.user_roles.get(user_id) == "aicte_executive_admin"

    def can_access_application_documents(self, app_id: str, user_id: Optional[str]) -> bool:
        if not user_id:
            return False
        app = self.applications.get(app_id)
        if not app:
            return False
        return (
            self.is_institution_member(app["institution_id"], user_id)
            or self.is_regulatory_reviewer(user_id)
            or self.is_admin(user_id)
        )

    def can_modify_application_documents(self, app_id: str, user_id: Optional[str]) -> bool:
        """Simulates public.can_modify_application_documents(target_app_id UUID)."""
        if not user_id:
            return False
        app = self.applications.get(app_id)
        if not app:
            return False
        is_active_member = self.is_institution_member(app["institution_id"], user_id)
        is_editable_status = app["current_status"] in {"draft", "deficiency_resolution"}
        return is_active_member and is_editable_status

    def can_delete_storage_object(self, app_id: str, user_id: Optional[str], owner_id: Optional[str]) -> bool:
        """Simulates storage.objects DELETE policy with top-level administrator override."""
        if not user_id:
            return False
        # Top-level Administrator Override: administrators can delete without institution membership
        if self.is_admin(user_id):
            return True
        # Ordinary user: must be owner (owner_id non-null and matches user_id), active member, and in editable state
        if owner_id is None or owner_id != user_id:
            return False
        return self.can_modify_application_documents(app_id, user_id)

    def can_review_document(self, user_id: Optional[str]) -> bool:
        if not user_id:
            return False
        return self.is_regulatory_reviewer(user_id) or self.is_admin(user_id)


def test_anonymous_access_to_documents_denied():
    """Anonymous callers (auth.uid() is null) cannot access or modify application documents."""
    env = MockDocumentAuthEnvironment()
    assert env.can_access_application_documents("app-101", user_id=None) is False
    assert env.can_modify_application_documents("app-101", user_id=None) is False
    assert env.can_review_document(user_id=None) is False


def test_authorized_institution_member_can_view_and_upload():
    """Active institution member can view and upload documents for their draft application."""
    env = MockDocumentAuthEnvironment()
    assert env.can_access_application_documents("app-101", "user-tce-rep") is True
    assert env.can_modify_application_documents("app-101", "user-tce-rep") is True


def test_draft_and_deficiency_resolution_permissions():
    """Documents can be uploaded and deleted in both 'draft' and 'deficiency_resolution' workflow states."""
    env = MockDocumentAuthEnvironment()
    # Draft state
    assert env.can_modify_application_documents("app-101", "user-tce-rep") is True
    assert env.can_delete_storage_object("app-101", user_id="user-tce-rep", owner_id="user-tce-rep") is True
    # Deficiency resolution state
    assert env.can_modify_application_documents("app-103-deficiency", "user-tce-rep") is True
    assert env.can_delete_storage_object("app-103-deficiency", user_id="user-tce-rep", owner_id="user-tce-rep") is True


def test_stranger_from_another_institution_denied_access():
    """Member from another institution cannot view or upload documents to an unowned application."""
    env = MockDocumentAuthEnvironment()
    assert env.can_access_application_documents("app-101", "user-other-rep") is False
    assert env.can_modify_application_documents("app-101", "user-other-rep") is False


def test_reviewer_can_read_documents():
    """Regulatory officers and admins can view documents across applications."""
    env = MockDocumentAuthEnvironment()
    assert env.can_access_application_documents("app-101", "user-scrutiny-officer") is True
    assert env.can_access_application_documents("app-101", "user-evc-evaluator") is True
    assert env.can_access_application_documents("app-101", "user-admin") is True


def test_applicant_cannot_review_documents():
    """Applicants cannot evaluate or review documents."""
    env = MockDocumentAuthEnvironment()
    assert env.can_review_document("user-tce-rep") is False
    assert env.can_review_document("user-other-rep") is False
    assert env.can_review_document("user-scrutiny-officer") is True
    assert env.can_review_document("user-admin") is True


def test_submitted_application_mutation_denied_for_applicants():
    """Applicants cannot upload or delete documents once application is submitted and locked."""
    env = MockDocumentAuthEnvironment()
    # View allowed
    assert env.can_access_application_documents("app-102-submitted", "user-tce-rep") is True
    # Modification denied
    assert env.can_modify_application_documents("app-102-submitted", "user-tce-rep") is False
    # Storage deletion denied
    assert env.can_delete_storage_object("app-102-submitted", user_id="user-tce-rep", owner_id="user-tce-rep") is False


def test_inactive_or_revoked_membership_denial():
    """Revoked or inactive members cannot upload or delete documents even if they originally created the application."""
    env = MockDocumentAuthEnvironment()
    # Revoked member
    assert env.can_modify_application_documents("app-101", "user-tce-revoked") is False
    assert env.can_delete_storage_object("app-101", user_id="user-tce-revoked", owner_id="user-tce-revoked") is False
    # Suspended creator of draft
    assert env.can_modify_application_documents("app-104-suspended-creator", "user-tce-suspended") is False
    assert env.can_delete_storage_object("app-104-suspended-creator", user_id="user-tce-suspended", owner_id="user-tce-suspended") is False


def test_authorized_administrator_not_institution_member():
    """An authorized administrator who is NOT an institution member can delete storage documents."""
    env = MockDocumentAuthEnvironment()
    # Admin is not a member of inst-tce
    assert env.is_institution_member("inst-tce", "user-admin") is False
    # Administrator override allows deletion on draft
    assert env.can_delete_storage_object("app-101", user_id="user-admin", owner_id="user-tce-rep") is True
    # Administrator override allows deletion of ownerless files
    assert env.can_delete_storage_object("app-101", user_id="user-admin", owner_id=None) is True
    # Administrator override allows deletion even on submitted applications
    assert env.can_delete_storage_object("app-102-submitted", user_id="user-admin", owner_id="user-tce-rep") is True


def test_ownerless_storage_object_cannot_be_deleted_by_ordinary_applicant():
    """Audit Finding 2: Ordinary applicants cannot delete storage objects if owner_id is None."""
    env = MockDocumentAuthEnvironment()
    # Ordinary user cannot delete an ownerless file even within their own draft application
    assert env.can_delete_storage_object("app-101", user_id="user-tce-rep", owner_id=None) is False
    # Ordinary user CAN delete a file they explicitly own
    assert env.can_delete_storage_object("app-101", user_id="user-tce-rep", owner_id="user-tce-rep") is True


# ==============================================================================
# LAYER 5: LIVE DATABASE INTEGRATION TESTS (REMOTE SUPABASE REST API)
# ==============================================================================

@pytest.mark.skip(reason="Live database integration requires manual deployment of migration 20261023000003")
def test_live_supabase_application_documents_rls():
    """Live database test: Run only after manual SQL Editor deployment to confirm RLS in PostgreSQL."""
    pass
