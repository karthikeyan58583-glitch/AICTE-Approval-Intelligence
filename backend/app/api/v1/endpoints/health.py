"""Health endpoint router."""

from fastapi import APIRouter, status
from app.core.config import settings
from app.schemas.health import HealthResponse

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Service Health Check",
    description="Returns vitality indicators and system metadata for the backend service.",
)
async def get_health() -> HealthResponse:
    """Return the health status of the application."""
    return HealthResponse(
        status="healthy",
        service="aicte-approval-intelligence-backend",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
    )
