-- ==============================================================================
-- AICTE Approval Intelligence Platform (AIP)
-- Module 3: Core Data Model & Statutory Workflow State Machine Schema
-- Additive Migration (Preserves Module 2 Auth & RBAC Schemas)
-- ==============================================================================

-- 1. Enums for Application Types, Workflow States, Institution and Membership Status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typname = 'application_type') THEN
        CREATE TYPE public.application_type AS ENUM (
            'new_institute',
            'extension_of_approval',
            'course_addition'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typname = 'workflow_status') THEN
        CREATE TYPE public.workflow_status AS ENUM (
            'draft',
            'submitted',
            'regional_scrutiny',
            'deficiency_resolution',
            'evc_evaluation',
            'sac_review',
            'shc_hearing',
            'approved',
            'rejected',
            'withdrawn'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typname = 'institution_status') THEN
        CREATE TYPE public.institution_status AS ENUM (
            'unverified_draft',
            'registered',
            'approved',
            'suspended'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typname = 'membership_role') THEN
        CREATE TYPE public.membership_role AS ENUM (
            'primary_signatory',
            'nodal_officer',
            'staff_representative'
        );
    END IF;
END $$;

-- 2. Institutions Table
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_code TEXT UNIQUE,
    name TEXT NOT NULL,
    institution_type TEXT NOT NULL,
    status public.institution_status NOT NULL DEFAULT 'unverified_draft'::public.institution_status,
    address TEXT,
    city TEXT,
    district TEXT,
    state TEXT NOT NULL,
    pincode TEXT,
    regional_office TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_institutions_reg_office ON public.institutions(regional_office);
CREATE INDEX IF NOT EXISTS idx_institutions_created_by ON public.institutions(created_by);

-- 3. Institution Memberships Table
CREATE TABLE IF NOT EXISTS public.institution_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_in_institution public.membership_role NOT NULL DEFAULT 'nodal_officer'::public.membership_role,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT uq_institution_member UNIQUE (institution_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.institution_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_inst ON public.institution_memberships(institution_id);

-- 4. Applications Table
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_number TEXT NOT NULL UNIQUE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    application_type public.application_type NOT NULL,
    academic_year TEXT NOT NULL DEFAULT '2026-2027',
    current_status public.workflow_status NOT NULL DEFAULT 'draft'::public.workflow_status,
    draft_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_applications_inst ON public.applications(institution_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(current_status);
CREATE INDEX IF NOT EXISTS idx_applications_type ON public.applications(application_type);
CREATE INDEX IF NOT EXISTS idx_applications_created_by ON public.applications(created_by);

-- 5. Application Workflow History Table (Append-only audit trail)
CREATE TABLE IF NOT EXISTS public.application_workflow_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    previous_status public.workflow_status,
    new_status public.workflow_status NOT NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_history_app ON public.application_workflow_history(application_id);
CREATE INDEX IF NOT EXISTS idx_workflow_history_created ON public.application_workflow_history(created_at);

-- 6. Helper Security Definer Functions (search_path = '')
-- A. Check if the authenticated caller has active membership in the specified institution
CREATE OR REPLACE FUNCTION public.is_institution_member(target_inst_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.institution_memberships
        WHERE institution_id = target_inst_id
          AND user_id = (SELECT auth.uid())
          AND status = 'active'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_institution_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_institution_member(UUID) TO authenticated, service_role;

-- B. Check if the authenticated caller has a regulatory officer or evaluator role
CREATE OR REPLACE FUNCTION public.is_regulatory_reviewer()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = (SELECT auth.uid())
          AND role IN (
              'regional_scrutiny_officer'::public.app_role,
              'evc_evaluator'::public.app_role,
              'shc_member'::public.app_role,
              'aicte_executive_admin'::public.app_role
          )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_regulatory_reviewer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_regulatory_reviewer() TO authenticated, service_role;

-- 7. Row Level Security Configuration

-- Enable RLS on all 4 new tables
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_workflow_history ENABLE ROW LEVEL SECURITY;

-- Institutions RLS
DROP POLICY IF EXISTS "Members and Reviewers can view institutions" ON public.institutions;
CREATE POLICY "Members and Reviewers can view institutions"
    ON public.institutions
    FOR SELECT
    TO authenticated
    USING (
        public.is_institution_member(id)
        OR public.is_regulatory_reviewer()
        OR created_by = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "Authenticated users can onboard institutions" ON public.institutions;
CREATE POLICY "Authenticated users can onboard institutions"
    ON public.institutions
    FOR INSERT
    TO authenticated
    WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Institution signatories and admins can update institutions" ON public.institutions;
CREATE POLICY "Institution signatories and admins can update institutions"
    ON public.institutions
    FOR UPDATE
    TO authenticated
    USING (
        public.is_institution_member(id)
        OR public.is_admin()
    )
    WITH CHECK (
        public.is_institution_member(id)
        OR public.is_admin()
    );

-- Institution Memberships RLS
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.institution_memberships;
CREATE POLICY "Users can view their own memberships"
    ON public.institution_memberships
    FOR SELECT
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Users can establish self-membership on onboarding" ON public.institution_memberships;
CREATE POLICY "Users can establish self-membership on onboarding"
    ON public.institution_memberships
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

-- Applications RLS
DROP POLICY IF EXISTS "Authorized members and reviewers can view applications" ON public.applications;
CREATE POLICY "Authorized members and reviewers can view applications"
    ON public.applications
    FOR SELECT
    TO authenticated
    USING (
        public.is_institution_member(institution_id)
        OR public.is_regulatory_reviewer()
        OR created_by = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "Authorized members can create application drafts" ON public.applications;
CREATE POLICY "Authorized members can create application drafts"
    ON public.applications
    FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = (SELECT auth.uid())
        AND (
            public.is_institution_member(institution_id)
            OR EXISTS (SELECT 1 FROM public.institutions WHERE id = institution_id AND created_by = (SELECT auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Authorized members can update drafts and deficiency replies" ON public.applications;
CREATE POLICY "Authorized members can update drafts and deficiency replies"
    ON public.applications
    FOR UPDATE
    TO authenticated
    USING (
        (public.is_institution_member(institution_id) OR created_by = (SELECT auth.uid()))
        AND current_status IN ('draft'::public.workflow_status, 'deficiency_resolution'::public.workflow_status)
    )
    WITH CHECK (
        (public.is_institution_member(institution_id) OR created_by = (SELECT auth.uid()))
    );

-- Application Workflow History RLS
DROP POLICY IF EXISTS "Viewers of application can view its workflow history" ON public.application_workflow_history;
CREATE POLICY "Viewers of application can view its workflow history"
    ON public.application_workflow_history
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            WHERE a.id = application_id
              AND (
                  public.is_institution_member(a.institution_id)
                  OR public.is_regulatory_reviewer()
                  OR a.created_by = (SELECT auth.uid())
              )
        )
    );

DROP POLICY IF EXISTS "Insert history on authorized transitions" ON public.application_workflow_history;
CREATE POLICY "Insert history on authorized transitions"
    ON public.application_workflow_history
    FOR INSERT
    TO authenticated
    WITH CHECK (actor_id = (SELECT auth.uid()));

-- 8. Anti-Tampering & Lifecycle Integrity Triggers

-- A. Applications table protection trigger
CREATE OR REPLACE FUNCTION public.protect_application_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_jwt_claims text;
    v_jwt_role text;
    v_is_service_role boolean := false;
    v_is_direct_admin boolean := false;
BEGIN
    -- 1. Prevent modification of immutable application identity fields
    IF NEW.application_number IS DISTINCT FROM OLD.application_number THEN
        RAISE EXCEPTION 'Application reference number is immutable once generated.';
    END IF;

    IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
        RAISE EXCEPTION 'Application cannot be re-assigned to a different institution.';
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Application ownership cannot be altered.';
    END IF;

    -- 2. State machine governance
    IF NEW.current_status IS DISTINCT FROM OLD.current_status THEN
        -- Check for direct DB admin or service_role
        v_jwt_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '');
        IF session_user IN ('postgres', 'supabase_admin') AND v_jwt_claims IS NULL THEN
            v_is_direct_admin := true;
        END IF;

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

        -- If not service_role or direct DB admin, enforce client-allowed transitions
        IF NOT (v_is_direct_admin OR v_is_service_role) THEN
            -- Applicant representative may ONLY transition:
            -- draft -> submitted
            -- draft -> withdrawn
            -- deficiency_resolution -> regional_scrutiny
            IF NOT (
                (OLD.current_status = 'draft'::public.workflow_status AND NEW.current_status IN ('submitted'::public.workflow_status, 'withdrawn'::public.workflow_status))
                OR (OLD.current_status = 'deficiency_resolution'::public.workflow_status AND NEW.current_status = 'regional_scrutiny'::public.workflow_status)
                OR public.is_admin()
            ) THEN
                RAISE EXCEPTION 'Unauthorized state transition from % to %. Statutory transitions must be executed through official regulatory workflow channels.',
                    OLD.current_status, NEW.current_status;
            END IF;
        END IF;

        -- Record submission timestamp when moving from draft to submitted
        IF OLD.current_status = 'draft'::public.workflow_status AND NEW.current_status = 'submitted'::public.workflow_status THEN
            NEW.submitted_at := pg_catalog.now();
        END IF;
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_application_mutation() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_protect_application_mutation ON public.applications;
CREATE TRIGGER tr_protect_application_mutation
    BEFORE UPDATE ON public.applications
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_application_mutation();

-- B. Append-only enforcement on workflow history
CREATE OR REPLACE FUNCTION public.prevent_workflow_history_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Application workflow history entries are permanent audit records and cannot be modified or deleted.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_workflow_history_tampering() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_prevent_workflow_history_tampering ON public.application_workflow_history;
CREATE TRIGGER tr_prevent_workflow_history_tampering
    BEFORE UPDATE OR DELETE ON public.application_workflow_history
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_workflow_history_tampering();
