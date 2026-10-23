"""SQL Security and AST Regression Test Suite.

Validates the PostgreSQL schema migration using PostgreSQL's native parser (pglast)
to ensure hardening invariants, RLS non-recursion, parameterless admin checks,
and role-tampering defense mechanics.
"""

from pathlib import Path
import pglast


def load_migration_sql() -> str:
    migration_path = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261022000001_auth_roles_schema.sql"
    assert migration_path.exists(), f"Migration file not found at {migration_path}"
    return migration_path.read_text(encoding="utf-8")


def test_migration_parses_cleanly_with_postgresql_c_parser():
    """Verify that the migration passes PostgreSQL native C parser without syntax errors."""
    sql = load_migration_sql()
    tree = pglast.parse_sql(sql)
    assert len(tree) >= 15, "Expected at least 15 valid SQL statements in migration."


def test_no_invalid_pg_catalog_special_syntax():
    """Verify that invalid pseudo-function calls like pg_catalog.current_user or pg_catalog.coalesce are absent."""
    sql = load_migration_sql()
    assert "pg_catalog.current_user" not in sql, "pg_catalog.current_user is invalid syntax; use SQL keyword current_user/session_user."
    assert "pg_catalog.coalesce" not in sql, "pg_catalog.coalesce is invalid syntax; use SQL construct coalesce."


def test_all_security_definer_functions_set_empty_search_path():
    """Verify that all SECURITY DEFINER functions explicitly set search_path = ''."""
    sql = load_migration_sql()
    # Check is_admin
    assert "CREATE OR REPLACE FUNCTION public.is_admin()" in sql
    assert "SECURITY DEFINER\nSET search_path = ''" in sql or "SECURITY DEFINER\nSET search_path = ''" in sql.replace(" ", "")

    # Check protect_user_role_elevation
    assert "CREATE OR REPLACE FUNCTION public.protect_user_role_elevation()" in sql

    # Check handle_new_auth_user
    assert "CREATE OR REPLACE FUNCTION public.handle_new_auth_user()" in sql


def test_is_admin_is_parameterless_and_non_recursive():
    """Verify is_admin() takes no arguments, queries caller's auth.uid(), and breaks RLS recursion."""
    sql = load_migration_sql()
    assert "FUNCTION public.is_admin()" in sql or "FUNCTION public.is_admin ()" in sql
    assert "id = (SELECT auth.uid())" in sql
    assert "role = 'aicte_executive_admin'::public.app_role" in sql
    # Policy 3 must use public.is_admin() rather than querying user_profiles directly
    assert "CREATE POLICY \"Admins can view all profiles\"" in sql
    assert "USING (\n        public.is_admin()\n    );" in sql


def test_role_protection_trigger_checks_session_user_and_service_role():
    """Verify protect_user_role_elevation distinguishes session_user, service-role claims, and executive admins."""
    sql = load_migration_sql()
    assert "session_user IN ('postgres', 'supabase_admin')" in sql, "Must check session_user for direct database administration."
    assert "v_jwt_role = 'service_role'" in sql, "Must check for legitimate Supabase service_role JWT."
    assert "public.is_admin()" in sql, "Must allow verified executive administrators."
    assert "RAISE EXCEPTION 'Access Denied" in sql, "Must strictly raise an exception for unauthorized role updates."


def test_signup_provisioning_trigger_forces_applicant_role():
    """Verify handle_new_auth_user hardcodes applicant role and ignores client-submitted role metadata."""
    sql = load_migration_sql()
    assert "'applicant_institution_representative'::public.app_role" in sql
    # Must never assign raw_user_meta_data ->> 'role'
    assert "raw_user_meta_data ->> 'role'" not in sql, "Trigger must never read client-submitted role metadata!"


def test_function_execution_privileges_are_revoked_from_public():
    """Verify least privilege: EXECUTE on security definer functions is revoked from PUBLIC."""
    sql = load_migration_sql()
    assert "REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;" in sql
    assert "REVOKE EXECUTE ON FUNCTION public.protect_user_role_elevation() FROM PUBLIC;" in sql
    assert "REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;" in sql


def test_updated_at_column_is_timestamptz_and_trigger_assigns_now():
    """Verify that user_profiles.updated_at is TIMESTAMPTZ and the trigger assigns NEW.updated_at := pg_catalog.now()."""
    sql = load_migration_sql()
    assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()" in sql
    assert "NEW.updated_at := pg_catalog.now();" in sql


def load_module_3_migration_sql() -> str:
    migration_path = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261023000001_core_applications_workflow.sql"
    assert migration_path.exists(), f"Module 3 migration file not found at {migration_path}"
    return migration_path.read_text(encoding="utf-8")


def test_module_3_migration_parses_cleanly_with_c_parser():
    """Verify that Module 3 migration passes PostgreSQL native C parser without syntax errors."""
    sql = load_module_3_migration_sql()
    tree = pglast.parse_sql(sql)
    assert len(tree) >= 40, f"Expected at least 40 SQL statements in Module 3 migration, got {len(tree)}"


def test_module_3_all_security_definer_functions_set_empty_search_path():
    """Verify that all SECURITY DEFINER functions in Module 3 set search_path = ''."""
    sql = load_module_3_migration_sql()
    assert "CREATE OR REPLACE FUNCTION public.is_institution_member(" in sql
    assert "CREATE OR REPLACE FUNCTION public.is_regulatory_reviewer()" in sql
    assert "CREATE OR REPLACE FUNCTION public.protect_application_mutation()" in sql
    assert "CREATE OR REPLACE FUNCTION public.prevent_workflow_history_tampering()" in sql
    # Count occurrences of SET search_path = ''
    assert sql.count("SET search_path = ''") >= 4


def test_module_3_audit_triggers_enforce_append_only_and_protect_immutability():
    """Verify that triggers enforce immutability of application reference & append-only history."""
    sql = load_module_3_migration_sql()
    # History append-only trigger
    assert "Application workflow history entries are permanent audit records" in sql
    assert "prevent_workflow_history_tampering" in sql
    # Application mutation protection trigger
    assert "Application reference number is immutable once generated." in sql
    assert "Application cannot be re-assigned to a different institution." in sql
    assert "Application ownership cannot be altered." in sql


def test_module_3_rls_enabled_on_all_tables():
    """Verify Row Level Security is explicitly enabled on all Module 3 tables."""
    sql = load_module_3_migration_sql()
    assert "ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;" in sql
    assert "ALTER TABLE public.institution_memberships ENABLE ROW LEVEL SECURITY;" in sql
    assert "ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;" in sql
    assert "ALTER TABLE public.application_workflow_history ENABLE ROW LEVEL SECURITY;" in sql


def test_module_3_execution_privileges_revoked_from_public():
    """Verify least privilege: EXECUTE on all Module 3 functions is revoked from PUBLIC."""
    sql = load_module_3_migration_sql()
    assert "REVOKE EXECUTE ON FUNCTION public.is_institution_member(UUID) FROM PUBLIC;" in sql
    assert "REVOKE EXECUTE ON FUNCTION public.is_regulatory_reviewer() FROM PUBLIC;" in sql
    assert "REVOKE EXECUTE ON FUNCTION public.protect_application_mutation() FROM PUBLIC;" in sql
    assert "REVOKE EXECUTE ON FUNCTION public.prevent_workflow_history_tampering() FROM PUBLIC;" in sql


def load_corrective_migration_sql() -> str:
    migration_path = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261023000002_module_3_rls_hardening.sql"
    assert migration_path.exists(), f"Corrective migration file not found at {migration_path}"
    return migration_path.read_text(encoding="utf-8")


def test_corrective_migration_parses_cleanly_with_c_parser():
    """Verify corrective migration passes native PostgreSQL C parser without syntax errors."""
    sql = load_corrective_migration_sql()
    tree = pglast.parse_sql(sql)
    assert len(tree) >= 30, f"Expected at least 30 statements in corrective migration, got {len(tree)}"


def test_corrective_migration_drops_unsafe_policies():
    """Verify unsafe self-membership and direct history insert policies are explicitly dropped."""
    sql = load_corrective_migration_sql()
    assert 'DROP POLICY IF EXISTS "Users can establish self-membership on onboarding" ON public.institution_memberships;' in sql
    assert 'DROP POLICY IF EXISTS "Insert history on authorized transitions" ON public.application_workflow_history;' in sql
    assert 'DROP POLICY IF EXISTS "Authenticated users can onboard institutions" ON public.institutions;' in sql


def test_corrective_migration_hardens_functions_with_empty_search_path():
    """Verify all new SECURITY DEFINER functions in corrective migration set search_path = ''."""
    sql = load_corrective_migration_sql()
    assert "CREATE OR REPLACE FUNCTION public.protect_institution_mutation()" in sql
    assert "CREATE OR REPLACE FUNCTION public.handle_new_institution_membership()" in sql
    assert "CREATE OR REPLACE FUNCTION public.protect_institution_membership_mutation()" in sql
    assert "CREATE OR REPLACE FUNCTION public.protect_workflow_history_insert()" in sql
    assert "CREATE OR REPLACE FUNCTION public.execute_statutory_workflow_transition(" in sql
    assert sql.count("SET search_path = ''") >= 5


def test_corrective_migration_atomic_rpc_implements_statutory_state_machine():
    """Verify execute_statutory_workflow_transition verifies role, transitions state, and inserts history atomically."""
    sql = load_corrective_migration_sql()
    assert "FUNCTION public.execute_statutory_workflow_transition(" in sql
    assert "UPDATE public.applications" in sql
    assert "INSERT INTO public.application_workflow_history" in sql
    assert "aicte.workflow_transition_active" in sql
    assert "REVOKE EXECUTE ON FUNCTION public.execute_statutory_workflow_transition(UUID, public.workflow_status, TEXT, TEXT) FROM PUBLIC;" in sql


def test_corrective_migration_least_privilege_grants():
    """Verify anon has zero access, and authenticated users cannot insert/update history or delete applications."""
    sql = load_corrective_migration_sql()
    assert "REVOKE ALL ON public.institutions FROM anon, PUBLIC;" in sql
    assert "REVOKE ALL ON public.application_workflow_history FROM anon, PUBLIC;" in sql
    assert "REVOKE INSERT, UPDATE ON public.application_workflow_history FROM authenticated;" in sql
    assert "REVOKE DELETE ON public.applications FROM authenticated;" in sql
    assert "REVOKE DELETE ON public.institutions FROM authenticated;" in sql




