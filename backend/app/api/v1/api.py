"""API router assembly for Version 1."""

from fastapi import APIRouter
from app.api.v1.endpoints import health, auth, applications, documents

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & RBAC"])
api_router.include_router(applications.router, prefix="/applications", tags=["Applications & Statutory Workflow"])
api_router.include_router(documents.router, tags=["Document Management & Compliance"])


