from fastapi import APIRouter
from schemas import HealthResponse

router = APIRouter()


@router.get("/health")
async def system_health() -> HealthResponse:
    return HealthResponse(apps={"aios": "ok"})
