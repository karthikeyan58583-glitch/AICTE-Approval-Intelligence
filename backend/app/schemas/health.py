"""Health check schema."""

from datetime import datetime, timezone
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Health response payload indicating service vitality."""
    status: str = Field(default="healthy", description="Current status of the service")
    service: str = Field(
        default="aicte-approval-intelligence-backend",
        description="Application identifier",
    )
    version: str = Field(..., description="Application semantic version")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp of the health inspection",
    )
    environment: str = Field(..., description="Operational environment name")
