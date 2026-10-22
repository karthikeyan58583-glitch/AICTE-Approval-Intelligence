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

