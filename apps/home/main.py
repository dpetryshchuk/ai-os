import asyncio
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

JOBSEARCH_URL = os.environ.get("JOBSEARCH_URL", "http://jobsearch:4111")
WRITING_APP_URL = os.environ.get("WRITING_APP_URL", "http://writing-app:4112")
DAILY_LOG_URL = os.environ.get("DAILY_LOG_URL", "http://daily-log:4113")

APPS_REGISTRY = [
    {
        "name": "Job Search",
        "url": "https://jobsearch.dmytropetryshchuk.com",
        "description": "CRM for tracking job applications, contacts, and outreach.",
        "internal_url": JOBSEARCH_URL,
    },
    {
        "name": "Writing",
        "url": "https://write.dmytropetryshchuk.com",
        "description": "Markdown essay editor with git publish.",
        "internal_url": WRITING_APP_URL,
    },
    {
        "name": "Daily Log",
        "url": "https://log.dmytropetryshchuk.com",
        "description": "Daily journal and habit tracker.",
        "internal_url": DAILY_LOG_URL,
    },
]


app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.exception_handler(Exception)
async def _exc(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"ok": True, "status": "healthy"}


@app.get("/api/apps")
async def list_apps():
    return {"ok": True, "apps": [
        {"name": a["name"], "url": a["url"], "description": a["description"]}
        for a in APPS_REGISTRY
    ]}


@app.get("/api/system-health")
async def system_health():
    async def check(name: str, internal_url: str):
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                r = await client.get(f"{internal_url}/api/health")
                return name, "ok" if r.status_code < 500 else "error"
        except Exception:
            return name, "error"

    results = await asyncio.gather(*[
        check(a["name"], a["internal_url"]) for a in APPS_REGISTRY
    ])
    return {"ok": True, "apps": dict(results)}


# ── Static ────────────────────────────────────────────────────────────────────

if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
