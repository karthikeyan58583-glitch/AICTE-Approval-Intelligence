"""FastAPI security dependencies for Supabase token verification and role enforcement."""

import jwt
import httpx
from typing import List, Callable, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
from app.schemas.auth import UserAuthPayload

# HTTP Bearer scheme extraction
security_scheme = HTTPBearer(auto_error=False)


async def verify_supabase_token(token: str) -> UserAuthPayload:
    """
    Cryptographically verifies a Supabase access token.
    Prioritizes local HMAC secret verification if SUPABASE_JWT_SECRET is provided;
    otherwise validates directly against the Supabase Auth verification endpoint.
    NEVER trusts an unverified decoded JWT.
    """
    # 1. Verification via local JWT secret (Fastest, zero network latency)
    if settings.SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
            user_meta = payload.get("user_metadata") or {}
            app_meta = payload.get("app_metadata") or {}

            # Trust hierarchy: app_metadata > user_metadata > default applicant role
            trusted_role = (
                app_meta.get("role")
                or user_meta.get("role")
                or "applicant_institution_representative"
            )

            return UserAuthPayload(
                id=payload.get("sub", ""),
                email=payload.get("email", ""),
                role=trusted_role,
                full_name=user_meta.get("full_name"),
                institution_name=user_meta.get("institution_name"),
                regional_office=user_meta.get("regional_office"),
                access_token=token,
                is_mock=True,
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token has expired. Please refresh your session.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.PyJWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Cryptographic token verification failed: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # 2. Verification via Supabase Auth API endpoint
    api_key = settings.SUPABASE_PUBLISHABLE_KEY or settings.SUPABASE_ANON_KEY
    if settings.SUPABASE_URL and api_key:
        auth_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user"
        headers = {
            "Authorization": f"Bearer {token}",
            "apikey": api_key,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(auth_url, headers=headers)

            if res.status_code == 200:
                user_data = res.json()
                user_meta = user_data.get("user_metadata") or {}
                app_meta = user_data.get("app_metadata") or {}

                trusted_role = (
                    app_meta.get("role")
                    or user_meta.get("role")
                    or "applicant_institution_representative"
                )

                return UserAuthPayload(
                    id=user_data.get("id", ""),
                    email=user_data.get("email", ""),
                    role=trusted_role,
                    full_name=user_meta.get("full_name"),
                    institution_name=user_meta.get("institution_name"),
                    regional_office=user_meta.get("regional_office"),
                    access_token=token,
                    is_mock=False,
                )
            elif res.status_code == 401:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired Supabase authentication token.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Authentication provider returned an unexpected status code.",
                )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Unable to reach Supabase authentication authority: {str(e)}",
            )

    # 3. Safe fallback when backend environment has not yet been configured
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=(
            "Supabase Auth credentials not configured on backend. "
            "Please configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_JWT_SECRET) in backend/.env"
        ),
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> UserAuthPayload:
    """Dependency that extracts and cryptographically verifies the bearer token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header with Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await verify_supabase_token(credentials.credentials)


def require_roles(allowed_roles: List[str]) -> Callable:
    """
    Dependency factory that enforces Role-Based Access Control (RBAC).
    Rejects callers whose assigned role is not present in allowed_roles.
    """
    async def role_checker(
        current_user: UserAuthPayload = Depends(get_current_user),
    ) -> UserAuthPayload:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access Denied: Persona '{current_user.role}' lacks required permissions. "
                    f"Required roles: {', '.join(allowed_roles)}"
                ),
            )
        return current_user

    return role_checker
