import asyncio

import httpx
from fastapi import APIRouter

from schemas import AppEntry, AppsResponse, HealthResponse

router = APIRouter()

APPS_REGISTRY = [
    AppEntry(
        name="Job Search",
        url="https://jobsearch.dmytropetryshchuk.com",
        description="CRM for tracking job applications, contacts, and outreach.",
        section="personal",
    ),
    AppEntry(
        name="Writing",
        url="https://aios.dmytropetryshchuk.com/writing",
        description="Markdown essay editor with git publish.",
        section="personal",
    ),
    AppEntry(
        name="Daily Log",
        url="https://aios.dmytropetryshchuk.com/daily-log",
        description="Daily journal and habit tracker.",
        section="personal",
    ),
]


@router.get("/apps")
async def list_apps() -> AppsResponse:
    return AppsResponse(apps=APPS_REGISTRY)


@router.get("/health")
async def system_health() -> HealthResponse:
    async def check(name: str, url: str):
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                r = await client.get("http://localhost:4116/api/health")
                return name, "ok" if r.status_code < 500 else "error"
        except Exception:
            return name, "error"

    results = await asyncio.gather(*[check(a.name, a.url) for a in APPS_REGISTRY])
    return HealthResponse(apps=dict(results))
