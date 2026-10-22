-- ==============================================================================
-- AICTE Approval Intelligence Platform (AIP)
-- Module 2: Authentication, Security & Role-Based Access Control Schema
-- Hardened SECURITY DEFINER Implementation (search_path = '', fully schema-qualified)
-- ==============================================================================

-- 1. Create the App Role enum for the 5 standardized regulatory personas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM (
            'applicant_institution_representative',
            'regional_scrutiny_officer',
            'evc_evaluator',
            'shc_member',
            'aicte_executive_admin'
        );
    END IF;
END $$;

-- 2. Create the User Profiles table linked directly to auth.users
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role public.app_role NOT NULL DEFAULT 'applicant_institution_representative'::public.app_role,
    institution_name TEXT,
    regional_office TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- Indexes for fast lookup by role and email
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- 3. Row Level Security (RLS) Configuration
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to safely evaluate executive admin status without RLS recursion
-- Hardened with SECURITY DEFINER and search_path = '' to prevent search_path hijacking
-- Parameterless: derives identity exclusively from verified caller JWT claim (auth.uid())
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = (SELECT auth.uid()) AND role = 'aicte_executive_admin'::public.app_role
    );
$$;

-- Restrict function execution privileges to authenticated users and service_role
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Policy 1: Authenticated users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
    ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING (id = (SELECT auth.uid()));

-- Policy 2: Users can update their own personal info, but NOT privileged fields/roles
DROP POLICY IF EXISTS "Users can update own personal info" ON public.user_profiles;
CREATE POLICY "Users can update own personal info"
    ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

-- Policy 3: Executive administrators can view all profiles (evaluated via non-recursive security definer)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles"
    ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
    );

-- 4. Trigger to prevent unauthorized role elevation
-- Disallows any unauthorized modification of the user's role column.
-- Distinguishes:
--  a) Trusted direct database administration (session_user in postgres/supabase_admin with no HTTP claims)
--  b) Legitimate Supabase service-role requests (JWT role claim = 'service_role')
--  c) Authenticated caller whose existing trusted profile role is 'aicte_executive_admin'
--  d) All other callers (ordinary applicants, officers, evaluators), who are strictly rejected.
CREATE OR REPLACE FUNCTION public.protect_user_role_elevation()
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
    v_is_exec_admin boolean := false;
BEGIN
    -- Check if authorization role is being altered
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        -- Case A: Trusted direct database session (SQL Editor, psql, migrations)
        -- session_user preserves the database connection identity even inside SECURITY DEFINER
        v_jwt_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '');
        IF session_user IN ('postgres', 'supabase_admin') AND v_jwt_claims IS NULL THEN
            v_is_direct_admin := true;
        END IF;

        -- Case B: Legitimate Supabase service-role token
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

        -- Case C: Authenticated caller with existing aicte_executive_admin trusted role
        v_is_exec_admin := public.is_admin();

        -- Reject if none of the authorized administrative contexts apply
        IF NOT (v_is_direct_admin OR v_is_service_role OR v_is_exec_admin) THEN
            RAISE EXCEPTION 'Access Denied: You do not have permission to alter authorization roles.';
        END IF;
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_user_role_elevation() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_protect_user_role_elevation ON public.user_profiles;
CREATE TRIGGER tr_protect_user_role_elevation
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_user_role_elevation();

-- 5. Trigger to automatically provision public.user_profiles on new signup
-- SECURITY GUARANTEE: Regardless of any metadata submitted by client forms,
-- public signups ALWAYS receive 'applicant_institution_representative' role.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.user_profiles (
        id,
        email,
        full_name,
        role,
        institution_name,
        regional_office
    )
    VALUES (
        NEW.id,
        coalesce(NEW.email, ''),
        coalesce(NEW.raw_user_meta_data ->> 'full_name', 'Institution Representative'),
        'applicant_institution_representative'::public.app_role, -- Immutable default for public registration
        NEW.raw_user_meta_data ->> 'institution_name',
        NEW.raw_user_meta_data ->> 'regional_office'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_on_auth_user_created ON auth.users;
CREATE TRIGGER tr_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- ==============================================================================
-- Development & Testing Role Assignment Guide
-- To promote an existing account for privileged evaluation:
--
-- UPDATE public.user_profiles
-- SET role = 'regional_scrutiny_officer'::public.app_role, regional_office = 'Southern Regional Office (SRO)'
-- WHERE email = 'officer@example.com';
--
-- UPDATE public.user_profiles
-- SET role = 'aicte_executive_admin'::public.app_role
-- WHERE email = 'admin@example.com';
-- ==============================================================================
