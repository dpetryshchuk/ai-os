import asyncio

import httpx
from fastapi import APIRouter

router = APIRouter()

APPS_REGISTRY = [
    {
        "name": "Job Search",
        "url": "https://jobsearch.dmytropetryshchuk.com",
        "description": "CRM for tracking job applications, contacts, and outreach.",
        "section": "personal",
    },
    {
        "name": "Writing",
        "url": "https://aios.dmytropetryshchuk.com/writing",
        "description": "Markdown essay editor with git publish.",
        "section": "personal",
    },
    {
        "name": "Daily Log",
        "url": "https://aios.dmytropetryshchuk.com/daily-log",
        "description": "Daily journal and habit tracker.",
        "section": "personal",
    },
]


@router.get("/apps")
async def list_apps():
    return {"ok": True, "apps": APPS_REGISTRY}


@router.get("/health")
async def system_health():
    async def check(name: str, url: str):
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                r = await client.get(f"http://localhost:4116/api/health")
                return name, "ok" if r.status_code < 500 else "error"
        except Exception:
            return name, "error"

    results = await asyncio.gather(*[check(a["name"], a["url"]) for a in APPS_REGISTRY])
    return {"ok": True, "apps": dict(results)}
