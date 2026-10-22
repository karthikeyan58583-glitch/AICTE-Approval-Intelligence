"""Main entry point for AICTE Approval Intelligence Platform FastAPI Backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.api import api_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "Backend API for the Integrated AICTE Approval Workflow Automation, "
        "Compliance Monitoring, and Alert Management System (SIH Problem Statement 26262)."
    ),
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

# Configure CORS for local development and authorized origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Register API v1 router under both /api and /api/v1 for maximum client compatibility
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(api_router, prefix="/api/v1")


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint welcoming API consumers and linking to documentation."""
    return {
        "message": "Welcome to AICTE Approval Intelligence Platform API",
        "version": settings.VERSION,
        "docs_url": f"{settings.API_V1_STR}/docs",
        "health_check": f"{settings.API_V1_STR}/health",
    }
