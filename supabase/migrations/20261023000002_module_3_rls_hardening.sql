-- ==============================================================================
-- AICTE Approval Intelligence Platform (AIP)
-- Module 3: Corrective RLS Hardening, Authorization Controls & Atomic Workflow RPC
-- Additive Corrective Migration (Applies on top of 20261023000001)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INSTITUTIONS TABLE HARDENING
-- Prevent applicants from self-assigning verified status or official codes
-- ------------------------------------------------------------------------------

-- Drop the overly broad insertion policy
DROP POLICY IF EXISTS "Authenticated users can onboard institutions" ON public.institutions;

-- Recreate insertion policy with strict initial status check
CREATE POLICY "Authenticated users can onboard institutions"
    ON public.institutions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = (SELECT auth.uid())
        AND status = 'unverified_draft'::public.institution_status
        AND institution_code IS NULL
    );

-- Trigger: protect_institution_mutation
-- Enforces that ordinary users cannot forge approved status, alter ownership, or forge codes
CREATE OR REPLACE FUNCTION public.protect_institution_mutation()
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
    -- Check for direct DB admin
    v_jwt_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '');
    IF session_user IN ('postgres', 'supabase_admin') AND v_jwt_claims IS NULL THEN
        v_is_direct_admin := true;
    END IF;

    -- Check for service_role
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

    IF TG_OP = 'INSERT' THEN
        IF NOT (v_is_direct_admin OR v_is_service_role OR public.is_admin()) THEN
            IF NEW.status IS DISTINCT FROM 'unverified_draft'::public.institution_status THEN
                RAISE EXCEPTION 'Access Denied: New institutions must be onboarded in unverified_draft status.';
            END IF;
            IF NEW.institution_code IS NOT NULL THEN
                RAISE EXCEPTION 'Access Denied: Official institution code cannot be self-assigned during onboarding.';
            END IF;
            NEW.created_by := (SELECT auth.uid());
        END IF;
        NEW.created_at := pg_catalog.now();
        NEW.updated_at := pg_catalog.now();
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Immutable identity fields
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Institution ID is immutable.';
        END IF;
        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'Institution ownership is immutable.';
        END IF;

        -- Non-admins cannot alter verified status or official institution code
        IF NOT (v_is_direct_admin OR v_is_service_role OR public.is_admin()) THEN
            IF NEW.status IS DISTINCT FROM OLD.status THEN
                RAISE EXCEPTION 'Access Denied: Only AICTE administrators can verify or alter institution status.';
            END IF;
            IF NEW.institution_code IS DISTINCT FROM OLD.institution_code THEN
                RAISE EXCEPTION 'Access Denied: Only AICTE administrators can assign or alter official institution codes.';
            END IF;
        END IF;
        NEW.updated_at := pg_catalog.now();
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_institution_mutation() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_protect_institution_mutation ON public.institutions;
CREATE TRIGGER tr_protect_institution_mutation
    BEFORE INSERT OR UPDATE ON public.institutions
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_institution_mutation();

-- ------------------------------------------------------------------------------
-- 2. INSTITUTION MEMBERSHIPS HARDENING
-- Prevent arbitrary membership creation; automatically provision initial membership on onboarding
-- ------------------------------------------------------------------------------

-- Drop the unsafe self-membership insertion policy
DROP POLICY IF EXISTS "Users can establish self-membership on onboarding" ON public.institution_memberships;

-- Automatic initial membership trigger on institution onboarding
CREATE OR REPLACE FUNCTION public.handle_new_institution_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        INSERT INTO public.institution_memberships (
            institution_id,
            user_id,
            role_in_institution,
            status,
            created_at,
            updated_at
        ) VALUES (
            NEW.id,
            NEW.created_by,
            'nodal_officer'::public.membership_role,
            'active',
            pg_catalog.now(),
            pg_catalog.now()
        )
        ON CONFLICT (institution_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_institution_membership() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_handle_new_institution_membership ON public.institutions;
CREATE TRIGGER tr_handle_new_institution_membership
    AFTER INSERT ON public.institutions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_institution_membership();

-- Strict membership insertion policy: Only admins or verified primary signatories can invite members
CREATE POLICY "Signatories and admins can add institution members"
    ON public.institution_memberships
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        OR (
            EXISTS (
                SELECT 1 FROM public.institution_memberships m
                WHERE m.institution_id = institution_memberships.institution_id
                  AND m.user_id = (SELECT auth.uid())
                  AND m.role_in_institution = 'primary_signatory'::public.membership_role
                  AND m.status = 'active'
            )
            AND role_in_institution != 'primary_signatory'::public.membership_role
        )
    );

-- Trigger: protect_institution_membership_mutation
-- Prevents non-admins from self-elevating to primary_signatory or altering user_id / institution_id
CREATE OR REPLACE FUNCTION public.protect_institution_membership_mutation()
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

    IF TG_OP = 'INSERT' THEN
        -- Only admin or service-role can assign primary_signatory directly
        IF NOT (v_is_direct_admin OR v_is_service_role OR public.is_admin()) THEN
            IF NEW.role_in_institution = 'primary_signatory'::public.membership_role THEN
                RAISE EXCEPTION 'Access Denied: Primary signatory role requires administrative accreditation.';
            END IF;
        END IF;
        NEW.created_at := pg_catalog.now();
        NEW.updated_at := pg_catalog.now();
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
            RAISE EXCEPTION 'Institution membership association is immutable.';
        END IF;
        IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
            RAISE EXCEPTION 'Member user ID is immutable.';
        END IF;

        IF NOT (v_is_direct_admin OR v_is_service_role OR public.is_admin()) THEN
            IF NEW.role_in_institution = 'primary_signatory'::public.membership_role AND OLD.role_in_institution != 'primary_signatory'::public.membership_role THEN
                RAISE EXCEPTION 'Access Denied: Elevation to primary signatory requires administrative accreditation.';
            END IF;
        END IF;
        NEW.updated_at := pg_catalog.now();
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_institution_membership_mutation() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_protect_institution_membership_mutation ON public.institution_memberships;
CREATE TRIGGER tr_protect_institution_membership_mutation
    BEFORE INSERT OR UPDATE ON public.institution_memberships
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_institution_membership_mutation();

-- ------------------------------------------------------------------------------
-- 3. WORKFLOW HISTORY TABLE HARDENING
-- Block direct client INSERT; history records may only be written via trusted transition boundary
-- ------------------------------------------------------------------------------

-- Drop the unverified direct insertion policy
DROP POLICY IF EXISTS "Insert history on authorized transitions" ON public.application_workflow_history;

-- Trigger: protect_workflow_history_insert
-- Enforces that history is written ONLY within trusted statutory transition functions or service_role
CREATE OR REPLACE FUNCTION public.protect_workflow_history_insert()
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
    v_trusted_context text;
BEGIN
    -- Check if called within trusted transition function
    v_trusted_context := pg_catalog.current_setting('aicte.workflow_transition_active', true);
    IF v_trusted_context = 'true' THEN
        RETURN NEW;
    END IF;

    -- Check for direct DB admin
    v_jwt_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '');
    IF session_user IN ('postgres', 'supabase_admin') AND v_jwt_claims IS NULL THEN
        v_is_direct_admin := true;
    END IF;

    -- Check for service_role
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

    IF NOT (v_is_direct_admin OR v_is_service_role) THEN
        RAISE EXCEPTION 'Access Denied: Direct insertion into application_workflow_history is forbidden. Statutory transitions must be executed via execute_statutory_workflow_transition().';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_workflow_history_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_protect_workflow_history_insert ON public.application_workflow_history;
CREATE TRIGGER tr_protect_workflow_history_insert
    BEFORE INSERT ON public.application_workflow_history
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_workflow_history_insert();

-- ------------------------------------------------------------------------------
-- 4. ATOMIC STATUTORY WORKFLOW TRANSITION RPC
-- Authoritative database boundary executing role verification, state update, and audit log
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.execute_statutory_workflow_transition(
    p_application_id UUID,
    p_target_status public.workflow_status,
    p_action TEXT,
    p_comments TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role public.app_role;
    v_app RECORD;
    v_history_id UUID;
    v_now TIMESTAMPTZ := pg_catalog.now();
    v_is_authorized boolean := false;
BEGIN
    -- 1. Identify caller
    v_caller_id := (SELECT auth.uid());
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to execute statutory workflow transitions.';
    END IF;

    -- 2. Lookup caller's trusted regulatory role from user_profiles
    SELECT role INTO v_caller_role
    FROM public.user_profiles
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Caller profile not found or role unassigned.';
    END IF;

    -- 3. Lock application row for concurrency protection
    SELECT * INTO v_app
    FROM public.applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF v_app.id IS NULL THEN
        RAISE EXCEPTION 'Application with ID % not found.', p_application_id;
    END IF;

    -- 4. Scope verification: caller must be member/creator or regulatory reviewer
    IF v_caller_role = 'applicant_institution_representative'::public.app_role THEN
        IF NOT (public.is_institution_member(v_app.institution_id) OR v_app.created_by = v_caller_id) THEN
            RAISE EXCEPTION 'Access Denied: You are not an authorized member of the applicant institution.';
        END IF;
    ELSIF v_caller_role IN (
        'regional_scrutiny_officer'::public.app_role,
        'evc_evaluator'::public.app_role,
        'shc_member'::public.app_role,
        'aicte_executive_admin'::public.app_role
    ) THEN
        -- Authorized regulatory officer
        NULL;
    ELSE
        RAISE EXCEPTION 'Access Denied: Role % lacks statutory workflow permissions.', v_caller_role;
    END IF;

    -- 5. Authoritative State Machine Validation
    -- Rules per AICTE Approval Process Handbook (APH)
    IF v_app.current_status = 'draft'::public.workflow_status AND p_target_status = 'submitted'::public.workflow_status THEN
        -- Applicant submits draft
        IF v_caller_role NOT IN ('applicant_institution_representative'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only applicant representatives or administrators may submit drafts.';
        END IF;
        IF v_app.application_number IS NULL THEN
            RAISE EXCEPTION 'Application must have a valid reference number before statutory lodgement.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'draft'::public.workflow_status AND p_target_status = 'withdrawn'::public.workflow_status THEN
        -- Applicant withdraws draft
        IF v_caller_role NOT IN ('applicant_institution_representative'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only applicant representatives or administrators may withdraw drafts.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'submitted'::public.workflow_status AND p_target_status = 'regional_scrutiny'::public.workflow_status THEN
        -- Scrutiny officer claims case
        IF v_caller_role NOT IN ('regional_scrutiny_officer'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only Regional Scrutiny Officers or administrators may initiate scrutiny.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'regional_scrutiny'::public.workflow_status AND p_target_status = 'deficiency_resolution'::public.workflow_status THEN
        -- Scrutiny officer issues deficiency
        IF v_caller_role NOT IN ('regional_scrutiny_officer'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only Regional Scrutiny Officers or administrators may issue deficiency notices.';
        END IF;
        IF p_comments IS NULL OR pg_catalog.length(pg_catalog.trim(p_comments)) < 5 THEN
            RAISE EXCEPTION 'Deficiency notices require official explanatory remarks (min 5 characters).';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'deficiency_resolution'::public.workflow_status AND p_target_status = 'regional_scrutiny'::public.workflow_status THEN
        -- Applicant resubmits rectification
        IF v_caller_role NOT IN ('applicant_institution_representative'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only applicant representatives or administrators may resubmit deficiency rectifications.';
        END IF;
        IF p_comments IS NULL OR pg_catalog.length(pg_catalog.trim(p_comments)) < 5 THEN
            RAISE EXCEPTION 'Rectification resubmission requires a compliance response note.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'regional_scrutiny'::public.workflow_status AND p_target_status = 'evc_evaluation'::public.workflow_status THEN
        -- Scrutiny officer recommends EVC
        IF v_caller_role NOT IN ('regional_scrutiny_officer'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only Regional Scrutiny Officers or administrators may recommend EVC evaluation.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'regional_scrutiny'::public.workflow_status AND p_target_status = 'sac_review'::public.workflow_status THEN
        -- Direct appraisal recommendation for clean EoA
        IF v_caller_role NOT IN ('regional_scrutiny_officer'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only Regional Scrutiny Officers or administrators may forward cases to SAC.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'regional_scrutiny'::public.workflow_status AND p_target_status = 'rejected'::public.workflow_status THEN
        -- Rejection at scrutiny
        IF v_caller_role NOT IN ('regional_scrutiny_officer'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only Regional Scrutiny Officers or administrators may issue scrutiny rejection orders.';
        END IF;
        IF p_comments IS NULL OR pg_catalog.length(pg_catalog.trim(p_comments)) < 5 THEN
            RAISE EXCEPTION 'Rejection orders require detailed statutory justification.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'evc_evaluation'::public.workflow_status AND p_target_status = 'sac_review'::public.workflow_status THEN
        -- EVC tables report
        IF v_caller_role NOT IN ('evc_evaluator'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only EVC Evaluators or administrators may submit inspection findings.';
        END IF;
        IF p_comments IS NULL OR pg_catalog.length(pg_catalog.trim(p_comments)) < 5 THEN
            RAISE EXCEPTION 'EVC report submission requires official inspection remarks.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'evc_evaluation'::public.workflow_status AND p_target_status = 'deficiency_resolution'::public.workflow_status THEN
        -- EVC finds physical deficiency
        IF v_caller_role NOT IN ('evc_evaluator'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only EVC Evaluators or administrators may issue inspection deficiency notices.';
        END IF;
        IF p_comments IS NULL OR pg_catalog.length(pg_catalog.trim(p_comments)) < 5 THEN
            RAISE EXCEPTION 'Inspection deficiencies require detailed defect notes.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'sac_review'::public.workflow_status AND p_target_status = 'shc_hearing'::public.workflow_status THEN
        -- Referral to Standing Hearing Committee
        IF v_caller_role NOT IN ('shc_member'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Only SHC members or administrators may refer cases to personal hearing.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'sac_review'::public.workflow_status AND p_target_status = 'approved'::public.workflow_status THEN
        -- Final statutory approval
        IF v_caller_role != 'aicte_executive_admin'::public.app_role THEN
            RAISE EXCEPTION 'Final statutory approval can only be granted by AICTE Executive Administrators.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'sac_review'::public.workflow_status AND p_target_status = 'rejected'::public.workflow_status THEN
        -- Final statutory rejection
        IF v_caller_role != 'aicte_executive_admin'::public.app_role THEN
            RAISE EXCEPTION 'Final statutory rejection can only be ordered by AICTE Executive Administrators.';
        END IF;
        IF p_comments IS NULL OR pg_catalog.length(pg_catalog.trim(p_comments)) < 5 THEN
            RAISE EXCEPTION 'Final rejection orders require detailed statutory justification.';
        END IF;
        v_is_authorized := true;

    ELSIF v_app.current_status = 'shc_hearing'::public.workflow_status AND p_target_status IN ('approved'::public.workflow_status, 'rejected'::public.workflow_status) THEN
        -- SHC post-hearing decision
        IF v_caller_role NOT IN ('shc_member'::public.app_role, 'aicte_executive_admin'::public.app_role) THEN
            RAISE EXCEPTION 'Post-hearing decisions require SHC Member or Administrator authority.';
        END IF;
        IF p_comments IS NULL OR pg_catalog.length(pg_catalog.trim(p_comments)) < 5 THEN
            RAISE EXCEPTION 'Hearing committee orders require formal recorded proceedings.';
        END IF;
        v_is_authorized := true;
    ELSE
        RAISE EXCEPTION 'Illegal workflow transition: Cannot move application directly from % to %.',
            v_app.current_status, p_target_status;
    END IF;

    -- 6. Set transaction-local flag so triggers permit atomic history creation
    PERFORM pg_catalog.set_config('aicte.workflow_transition_active', 'true', true);

    -- 7. Execute atomic application status mutation
    UPDATE public.applications
    SET current_status = p_target_status,
        submitted_at = CASE
            WHEN v_app.current_status = 'draft'::public.workflow_status AND p_target_status = 'submitted'::public.workflow_status
            THEN v_now
            ELSE submitted_at
        END,
        updated_at = v_now
    WHERE id = p_application_id;

    -- 8. Execute atomic workflow history creation
    INSERT INTO public.application_workflow_history (
        application_id,
        previous_status,
        new_status,
        actor_id,
        action,
        comments,
        created_at
    ) VALUES (
        p_application_id,
        v_app.current_status,
        p_target_status,
        v_caller_id,
        p_action,
        p_comments,
        v_now
    ) RETURNING id INTO v_history_id;

    -- 9. Return JSON response
    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'previous_status', v_app.current_status,
        'new_status', p_target_status,
        'history_id', v_history_id,
        'transitioned_at', v_now
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.execute_statutory_workflow_transition(UUID, public.workflow_status, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_statutory_workflow_transition(UUID, public.workflow_status, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. LEAST-PRIVILEGE EXPOSED TABLE GRANTS
-- Revoke anonymous access and restrict unprivileged modifications
-- ------------------------------------------------------------------------------

-- Revoke all public/anon access from all tables
REVOKE ALL ON public.institutions FROM anon, PUBLIC;
REVOKE ALL ON public.institution_memberships FROM anon, PUBLIC;
REVOKE ALL ON public.applications FROM anon, PUBLIC;
REVOKE ALL ON public.application_workflow_history FROM anon, PUBLIC;

-- Revoke dangerous DELETE privileges from authenticated users
REVOKE DELETE ON public.institutions FROM authenticated;
REVOKE DELETE ON public.applications FROM authenticated;
REVOKE DELETE ON public.application_workflow_history FROM authenticated;

-- Restrict workflow history: authenticated users may ONLY SELECT (writes happen via RPC)
REVOKE INSERT, UPDATE ON public.application_workflow_history FROM authenticated;
GRANT SELECT ON public.application_workflow_history TO authenticated;

-- Grant least-privilege operations for ordinary tables
GRANT SELECT, INSERT, UPDATE ON public.institutions TO authenticated;
GRANT SELECT, INSERT ON public.institution_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.applications TO authenticated;

-- Full service_role access for trusted backend administrative workers
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
