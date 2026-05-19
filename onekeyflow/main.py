# onekeyflow/main.py
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import db
from routers import proposals, revenue

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

db.init()

app.include_router(revenue.router,   prefix="/api/revenue")
app.include_router(proposals.router, prefix="/api/proposals")


@app.exception_handler(Exception)
async def _exc(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": exc.detail})
    return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})


@app.get("/api/health")
def health():
    return {"ok": True, "status": "healthy"}


_PUBLIC = Path("public")
if _PUBLIC.exists():
    app.mount("/assets", StaticFiles(directory=_PUBLIC / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str) -> FileResponse:
        candidate = _PUBLIC / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_PUBLIC / "index.html")
