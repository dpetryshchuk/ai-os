import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import db
from routers import daily_log, home, jobsearch, proposals, webhooks, writing


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_jobsearch_pool()
    await db.init_daily_log_pool()
    yield
    await db.close_jobsearch_pool()
    await db.close_daily_log_pool()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.exception_handler(Exception)
async def _exc(request: Request, exc: Exception):
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"ok": False, "error": exc.detail},
        )
    return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})


app.include_router(jobsearch.router, prefix="/api/jobsearch")
app.include_router(writing.router, prefix="/api/writing")
app.include_router(daily_log.router, prefix="/api/daily-log")
app.include_router(home.router, prefix="/api/home")
app.include_router(proposals.router, prefix="/api/proposals")
app.include_router(webhooks.router, prefix="/webhooks")


@app.get("/api/health")
async def health():
    return {"ok": True, "status": "healthy"}


if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
