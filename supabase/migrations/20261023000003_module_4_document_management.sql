-- ==============================================================================
-- AICTE Approval Intelligence Platform (AIP)
-- Module 4: Secure Document Management Foundation (Phase 1)
-- Additive Migration (Preserves Module 2 & 3 Schemas, Triggers & RLS Policies)
-- Hardened Post-Audit Security Implementation (search_path = '', schema-qualified)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENUMS FOR DOCUMENT CATEGORIES AND VERIFICATION STATUS
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typname = 'document_type') THEN
        CREATE TYPE public.document_type AS ENUM (
            'land_ownership_deed',
            'land_use_certificate',
            'building_plan_approval',
            'fire_safety_certificate',
            'structural_stability_certificate',
            'architect_certificate',
            'fdr_guarantee',
            'aicte_affidavit',
            'society_trust_deed',
            'other_statutory'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typname = 'document_verification_status') THEN
        CREATE TYPE public.document_verification_status AS ENUM (
            'pending_review',
            'verified_valid',
            'deficiency_flagged',
            'rejected'
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. APPLICATION DOCUMENTS METADATA TABLE
-- Authoritative PostgreSQL metadata store (actual file bytes reside in Supabase Storage)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.application_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    document_type public.document_type NOT NULL,
    original_filename TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'aip-application-documents',
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_size_bytes BIGINT NOT NULL,
    file_hash_sha256 TEXT,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    verification_status public.document_verification_status NOT NULL DEFAULT 'pending_review'::public.document_verification_status,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

    -- Constraints
    CONSTRAINT chk_app_doc_filename CHECK (
        length(trim(original_filename)) >= 1 AND length(original_filename) <= 255
    ),
    CONSTRAINT chk_app_doc_bucket CHECK (
        storage_bucket = 'aip-application-documents'
    ),
    -- Path format: {application_id}/{filename} without path traversal (no '..')
    CONSTRAINT chk_app_doc_path CHECK (
        length(trim(storage_path)) >= 3
        AND storage_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_\.\-]+$'
        AND storage_path NOT LIKE '%..%'
    ),
    -- Enforce that storage_path prefix strictly matches the application_id
    CONSTRAINT chk_app_doc_path_match_app CHECK (
        pg_catalog.split_part(storage_path, '/', 1) = application_id::text
    ),
    CONSTRAINT chk_app_doc_file_size CHECK (
        file_size_bytes > 0 AND file_size_bytes <= 10485760 -- 10 MiB maximum
    ),
    CONSTRAINT chk_app_doc_mime CHECK (
        mime_type IN ('application/pdf')
    ),
    -- Review fields coherence check
    CONSTRAINT chk_app_doc_review_fields CHECK (
        (verification_status = 'pending_review'::public.document_verification_status AND reviewed_at IS NULL AND reviewed_by IS NULL)
        OR
        (verification_status != 'pending_review'::public.document_verification_status AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    )
);

-- Indexes for performant filtering and queries
CREATE INDEX IF NOT EXISTS idx_application_documents_app ON public.application_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_application_documents_type ON public.application_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_application_documents_status ON public.application_documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_application_documents_uploaded_by ON public.application_documents(uploaded_by);
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_documents_path ON public.application_documents(storage_bucket, storage_path);

-- ------------------------------------------------------------------------------
-- 3. PROVISION PRIVATE STORAGE BUCKET
-- Configures dedicated 'aip-application-documents' bucket with 10 MiB limit & PDF MIME filter
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_tables 
        WHERE schemaname = 'storage' AND tablename = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'aip-application-documents',
            'aip-application-documents',
            false,
            10485760, -- 10 MiB
            ARRAY['application/pdf']::text[]
        )
        ON CONFLICT (id) DO UPDATE SET
            public = false,
            file_size_limit = 10485760,
            allowed_mime_types = ARRAY['application/pdf']::text[];
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. HARDENED SECURITY DEFINER HELPER FUNCTIONS
-- Derives authorization exclusively from verified caller JWT claim (auth.uid())
-- ------------------------------------------------------------------------------

-- A. Evaluate if caller can access (view/download) documents for an application
CREATE OR REPLACE FUNCTION public.can_access_application_documents(target_app_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = target_app_id
          AND (
              public.is_institution_member(a.institution_id)
              OR public.is_regulatory_reviewer()
              OR public.is_admin()
          )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_application_documents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_application_documents(UUID) TO authenticated, service_role;

-- B. Evaluate if caller can modify (upload/delete) documents for an application
-- Strictly requires active institution membership AND editable application state (draft or deficiency_resolution)
CREATE OR REPLACE FUNCTION public.can_modify_application_documents(target_app_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = target_app_id
          AND public.is_institution_member(a.institution_id)
          AND a.current_status IN (
              'draft'::public.workflow_status,
              'deficiency_resolution'::public.workflow_status
          )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_modify_application_documents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_modify_application_documents(UUID) TO authenticated, service_role;

-- C. Evaluate storage object download permissions for Supabase Storage RLS
CREATE OR REPLACE FUNCTION public.can_access_storage_object(p_bucket_id TEXT, p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
    v_app_id_text TEXT;
    v_app_id UUID;
BEGIN
    IF p_bucket_id != 'aip-application-documents' THEN
        RETURN false;
    END IF;

    -- Extract first path segment as application UUID
    v_app_id_text := pg_catalog.split_part(p_object_name, '/', 1);
    IF v_app_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_app_id := v_app_id_text::uuid;
        RETURN public.can_access_application_documents(v_app_id);
    END IF;

    -- Fallback: verify against application_documents table
    RETURN EXISTS (
        SELECT 1 FROM public.application_documents d
        WHERE d.storage_bucket = p_bucket_id
          AND d.storage_path = p_object_name
          AND public.can_access_application_documents(d.application_id)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_storage_object(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_storage_object(TEXT, TEXT) TO authenticated, service_role;

-- D. Evaluate storage object upload permissions for Supabase Storage RLS
CREATE OR REPLACE FUNCTION public.can_upload_storage_object(p_bucket_id TEXT, p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
    v_app_id_text TEXT;
    v_app_id UUID;
BEGIN
    IF p_bucket_id != 'aip-application-documents' THEN
        RETURN false;
    END IF;

    -- Reject path traversal attempts
    IF p_object_name LIKE '%..%' THEN
        RETURN false;
    END IF;

    -- Extract first path segment as application UUID
    v_app_id_text := pg_catalog.split_part(p_object_name, '/', 1);
    IF v_app_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_app_id := v_app_id_text::uuid;
        RETURN public.can_modify_application_documents(v_app_id);
    END IF;

    RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_upload_storage_object(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_upload_storage_object(TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. ANTI-TAMPERING TRIGGER ON APPLICATION DOCUMENTS
-- Protects immutable metadata (identity, uploader, storage path, size)
-- Restricts document verification/review to regulatory reviewers and admins
-- Enforces automatic reviewer identity stamping (non-repudiation)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_document_metadata_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_jwt_claims TEXT;
    v_jwt_role TEXT;
    v_is_service_role BOOLEAN := false;
    v_is_direct_admin BOOLEAN := false;
    v_is_exec_admin BOOLEAN := false;
    v_caller_id UUID;
BEGIN
    -- Check for direct DB admin session
    v_jwt_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '');
    IF session_user IN ('postgres', 'supabase_admin') AND v_jwt_claims IS NULL THEN
        v_is_direct_admin := true;
    END IF;

    -- Check for service-role token
    BEGIN
        v_jwt_role := coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
            (v_jwt_claims::jsonb ->> 'role')
        );
        IF v_jwt_role = 'service_role' THEN
            v_is_service_role := true;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            v_is_service_role := false;
    END;

    v_is_exec_admin := public.is_admin();
    v_caller_id := (SELECT auth.uid());

    IF TG_OP = 'INSERT' THEN
        NEW.created_at := pg_catalog.now();
        NEW.updated_at := pg_catalog.now();
        NEW.uploaded_at := pg_catalog.now();
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Prevent alteration of immutable document identity and upload metadata
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Document ID is immutable.';
        END IF;
        IF NEW.application_id IS DISTINCT FROM OLD.application_id THEN
            RAISE EXCEPTION 'Document cannot be reassigned to a different application.';
        END IF;
        IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
            RAISE EXCEPTION 'Document uploader identity is immutable.';
        END IF;
        IF NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at THEN
            RAISE EXCEPTION 'Document upload timestamp is immutable.';
        END IF;
        IF NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket THEN
            RAISE EXCEPTION 'Document storage bucket identifier is immutable.';
        END IF;
        IF NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
            RAISE EXCEPTION 'Document storage path is immutable.';
        END IF;
        IF NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes THEN
            RAISE EXCEPTION 'Document file size is immutable.';
        END IF;
        IF NEW.mime_type IS DISTINCT FROM OLD.mime_type THEN
            RAISE EXCEPTION 'Document MIME type is immutable.';
        END IF;

        -- Review fields can ONLY be mutated by authorized regulatory reviewers, admins, or service_role
        IF NOT (v_is_direct_admin OR v_is_service_role OR public.is_regulatory_reviewer() OR v_is_exec_admin) THEN
            IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
               OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
               OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
               OR NEW.review_comments IS DISTINCT FROM OLD.review_comments THEN
                RAISE EXCEPTION 'Access Denied: Only regulatory reviewers can review or verify application documents.';
            END IF;
        END IF;

        -- Non-admin reviewers must be automatically stamped with caller's identity (non-repudiation)
        IF NOT (v_is_direct_admin OR v_is_service_role OR v_is_exec_admin) THEN
            IF NEW.verification_status != 'pending_review'::public.document_verification_status THEN
                NEW.reviewed_by := v_caller_id;
                NEW.reviewed_at := pg_catalog.now();
            END IF;
        END IF;

        NEW.updated_at := pg_catalog.now();
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_document_metadata_mutation() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_protect_document_metadata_mutation ON public.application_documents;
CREATE TRIGGER tr_protect_document_metadata_mutation
    BEFORE INSERT OR UPDATE ON public.application_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_document_metadata_mutation();

-- ------------------------------------------------------------------------------
-- 6. DURABLE STORAGE DELETION OUTBOX QUEUE & TRIGGER
-- Guarantees file deletion is executed safely via Supabase Storage API, NEVER via direct SQL
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_storage_deletion_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_bucket TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    document_id UUID,
    application_id UUID,
    enqueued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 5,
    last_error TEXT,
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    processed_at TIMESTAMPTZ,

    CONSTRAINT chk_del_queue_status CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    ),
    CONSTRAINT chk_del_queue_retries CHECK (
        retry_count >= 0 AND retry_count <= max_retries + 1
    )
);

CREATE INDEX IF NOT EXISTS idx_del_queue_status_retry ON public.document_storage_deletion_queue(status, retry_count);
CREATE INDEX IF NOT EXISTS idx_del_queue_created ON public.document_storage_deletion_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_del_queue_lease ON public.document_storage_deletion_queue(status, lease_expires_at);

-- Enqueue trigger: catches single-document deletion and application cascade deletion
CREATE OR REPLACE FUNCTION public.handle_document_storage_deletion_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.document_storage_deletion_queue (
        storage_bucket,
        storage_path,
        document_id,
        application_id,
        enqueued_by,
        status,
        created_at
    ) VALUES (
        OLD.storage_bucket,
        OLD.storage_path,
        OLD.id,
        OLD.application_id,
        (SELECT auth.uid()),
        'pending',
        pg_catalog.now()
    );
    RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_document_storage_deletion_enqueue() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_enqueue_document_storage_deletion ON public.application_documents;
CREATE TRIGGER tr_enqueue_document_storage_deletion
    AFTER DELETE ON public.application_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_document_storage_deletion_enqueue();

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES ON APPLICATION DOCUMENTS
-- ------------------------------------------------------------------------------

ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_documents FORCE ROW LEVEL SECURITY;

-- Policy 1: SELECT - Authorized institution members and regulatory reviewers
DROP POLICY IF EXISTS "Authorized viewers can view application documents" ON public.application_documents;
CREATE POLICY "Authorized viewers can view application documents"
    ON public.application_documents
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_application_documents(application_id)
    );

-- Policy 2: INSERT - Authenticated applicants for authorized editable applications
DROP POLICY IF EXISTS "Authorized applicants can register application documents" ON public.application_documents;
CREATE POLICY "Authorized applicants can register application documents"
    ON public.application_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (
        uploaded_by = (SELECT auth.uid())
        AND storage_bucket = 'aip-application-documents'
        AND verification_status = 'pending_review'::public.document_verification_status
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
        AND (
            public.is_admin()
            OR public.can_modify_application_documents(application_id)
        )
    );

-- Policy 3: UPDATE - Regulatory reviewers evaluating documents
DROP POLICY IF EXISTS "Reviewers can evaluate documents" ON public.application_documents;
CREATE POLICY "Reviewers can evaluate documents"
    ON public.application_documents
    FOR UPDATE
    TO authenticated
    USING (
        public.is_regulatory_reviewer() OR public.is_admin()
    )
    WITH CHECK (
        public.is_regulatory_reviewer() OR public.is_admin()
    );

-- Policy 4: DELETE - Uploader can delete document while application is in draft/deficiency_resolution
DROP POLICY IF EXISTS "Authorized applicants can delete draft documents" ON public.application_documents;
CREATE POLICY "Authorized applicants can delete draft documents"
    ON public.application_documents
    FOR DELETE
    TO authenticated
    USING (
        public.is_admin()
        OR (
            uploaded_by = (SELECT auth.uid())
            AND public.can_modify_application_documents(application_id)
        )
    );

-- ------------------------------------------------------------------------------
-- 8. SUPABASE STORAGE RLS POLICIES (ON storage.objects)
-- Governs private binary downloads and uploads through Supabase Storage API
-- Note: storage.objects is managed by Supabase with RLS pre-enabled.
-- Do not issue ALTER TABLE on storage.objects (requires supabase_storage_admin).
-- ------------------------------------------------------------------------------

-- Storage Policy 1: SELECT (Download)
DROP POLICY IF EXISTS "Authorized viewers can read storage documents" ON storage.objects;
CREATE POLICY "Authorized viewers can read storage documents"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'aip-application-documents'
        AND (
            public.is_admin()
            OR public.can_access_storage_object(bucket_id, name)
        )
    );

-- Storage Policy 2: INSERT (Upload)
DROP POLICY IF EXISTS "Authorized applicants can upload storage documents" ON storage.objects;
CREATE POLICY "Authorized applicants can upload storage documents"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'aip-application-documents'
        AND (
            public.is_admin()
            OR public.can_upload_storage_object(bucket_id, name)
        )
    );

-- Storage Policy 3: DELETE (Remove from storage)
-- Enforces applicant authorization AND uploader ownership
-- Crucially rejects unauthenticated or ownerless deletions
-- Administrator override works without requiring institution membership
DROP POLICY IF EXISTS "Authorized applicants can delete storage documents" ON storage.objects;
CREATE POLICY "Authorized applicants can delete storage documents"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'aip-application-documents'
        AND (
            public.is_admin()
            OR (
                owner_id IS NOT NULL 
                AND owner_id = (SELECT auth.uid())::text
                AND public.can_upload_storage_object(bucket_id, name)
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 9. LEAST-PRIVILEGE EXPOSED TABLE GRANTS
-- ------------------------------------------------------------------------------

-- Revoke all anonymous and public permissions
REVOKE ALL ON public.application_documents FROM anon, PUBLIC;
REVOKE ALL ON public.document_storage_deletion_queue FROM anon, PUBLIC;

-- Authenticated users have ZERO direct access to the deletion queue (writes happen via trigger)
REVOKE ALL ON public.document_storage_deletion_queue FROM authenticated;

-- Grant least-privilege operations to authenticated users for documents
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_documents TO authenticated;

-- Full service_role access for trusted backend workers
GRANT ALL ON public.application_documents TO service_role;
GRANT ALL ON public.document_storage_deletion_queue TO service_role;
