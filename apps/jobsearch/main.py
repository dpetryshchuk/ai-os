import asyncio
import json
import os
import shutil
from contextlib import asynccontextmanager
from typing import Any

import anthropic
import asyncpg
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from agent import agentic_stream
from db import close_pool, get_pool, init_pool

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/home/dima/jobsearch/uploads")
_anthropic = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.exception_handler(HTTPException)
async def _http_exc(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"ok": False, "error": exc.detail},
    )


def _row(record) -> dict[str, Any]:
    d = dict(record)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


def _new_id() -> str:
    import secrets
    return secrets.token_hex(8)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"ok": True, "status": "healthy"}


# ── Agent SSE stream ──────────────────────────────────────────────────────────

@app.post("/api/agents/jobsearch/stream")
async def agent_stream(body: dict, pool: asyncpg.Pool = Depends(get_pool)):
    messages = body.get("messages")
    if not messages:
        raise HTTPException(400, "messages required")

    async def generate():
        async for chunk in agentic_stream(messages, pool, _anthropic):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Pipeline ──────────────────────────────────────────────────────────────────

@app.get("/api/data/pipeline")
async def get_pipeline(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("""
        SELECT
          c.id, c.name, c.role, c.source, c.stage, c.notes,
          co.name AS company_name, co.website,
          MAX(i.date) AS last_contact
        FROM contacts c
        LEFT JOIN companies co ON co.id = c.company_id
        LEFT JOIN interactions i ON i.contact_id = c.id
        GROUP BY c.id, co.id
        ORDER BY
          CASE c.stage
            WHEN 'Ongoing'    THEN 1
            WHEN 'Responded'  THEN 2
            WHEN 'Outreached' THEN 3
            WHEN 'Dead'       THEN 4
            ELSE 5
          END, c.name
    """)
    contacts = []
    for r in rows:
        d = _row(r)
        contacts.append(d)
    return {"ok": True, "contacts": contacts}


# ── Retro ──────────────────────────────────────────────────────────────────────

@app.get("/api/data/retro")
async def get_retro(pool: asyncpg.Pool = Depends(get_pool)):
    weekly, daily, by_source, needs_action, stats = await asyncio.gather(
        pool.fetch("""
            SELECT date_trunc('week', date) AS week, COUNT(*) AS count
            FROM interactions WHERE date >= now() - interval '12 weeks'
            GROUP BY 1 ORDER BY 1
        """),
        pool.fetch("""
            SELECT date, COUNT(*) AS count
            FROM interactions WHERE date >= now() - interval '30 days'
            GROUP BY 1 ORDER BY 1
        """),
        pool.fetch("""
            SELECT c.source, COUNT(*) AS total,
              SUM(CASE WHEN c.stage != 'Dead' THEN 1 ELSE 0 END) AS active
            FROM contacts c GROUP BY c.source
        """),
        pool.fetch("""
            SELECT c.id, c.name, c.stage, co.name AS company_name, MAX(i.date) AS last_contact
            FROM contacts c
            LEFT JOIN companies co ON co.id = c.company_id
            LEFT JOIN interactions i ON i.contact_id = c.id
            WHERE c.stage IN ('Outreached','Responded','Ongoing')
            GROUP BY c.id, co.id
            HAVING MAX(i.date) < now() - interval '7 days' OR MAX(i.date) IS NULL
            ORDER BY last_contact ASC NULLS FIRST
        """),
        pool.fetchrow("""
            SELECT
              COUNT(DISTINCT c.id) AS total_contacts,
              COUNT(DISTINCT CASE WHEN c.stage != 'Dead' THEN c.id END) AS active_contacts,
              COUNT(i.id) AS total_interactions,
              COUNT(DISTINCT jp.id) AS total_applications
            FROM contacts c
            LEFT JOIN interactions i ON i.contact_id = c.id
            LEFT JOIN job_postings jp ON jp.status = 'applied'
        """),
    )
    return {
        "ok": True,
        "weekly": [_row(r) for r in weekly],
        "daily": [_row(r) for r in daily],
        "by_source": [_row(r) for r in by_source],
        "needs_action": [_row(r) for r in needs_action],
        "stats": _row(stats) if stats else {},
    }


# ── Leads ──────────────────────────────────────────────────────────────────────

@app.get("/api/data/leads")
async def get_leads(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("""
        SELECT jp.id, jp.title, jp.link, jp.source, jp.status, co.name AS company_name, co.website
        FROM job_postings jp
        LEFT JOIN companies co ON co.id = jp.company_id
        WHERE jp.status = 'new'
        ORDER BY jp.id DESC
    """)
    return {"ok": True, "leads": [_row(r) for r in rows]}


# ── Applications ───────────────────────────────────────────────────────────────

@app.get("/api/data/applications")
async def get_applications(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("""
        SELECT jp.id, jp.title, jp.link, jp.source, jp.status, jp.resume_path,
               co.name AS company_name, co.website
        FROM job_postings jp
        LEFT JOIN companies co ON co.id = jp.company_id
        WHERE jp.status = 'applied'
        ORDER BY jp.id DESC
    """)
    return {"ok": True, "applications": [_row(r) for r in rows]}


# ── Content ────────────────────────────────────────────────────────────────────

@app.get("/api/data/content")
async def get_content(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch(
        "SELECT id, posted_date, content, impressions, engagements, comments FROM content_posts ORDER BY posted_date DESC"
    )
    return {"ok": True, "posts": [_row(r) for r in rows]}


# ── Notes ──────────────────────────────────────────────────────────────────────

@app.get("/api/data/notes")
async def get_notes(q: str = "", pool: asyncpg.Pool = Depends(get_pool)):
    if q:
        rows = await pool.fetch(
            "SELECT id, category, title, url, content, created_at FROM notes WHERE to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(url,'')) @@ plainto_tsquery('english', $1) ORDER BY created_at DESC",
            q,
        )
    else:
        rows = await pool.fetch(
            "SELECT id, category, title, url, content, created_at FROM notes ORDER BY created_at DESC"
        )
    return {"ok": True, "notes": [_row(r) for r in rows]}


@app.post("/api/data/notes")
async def create_note(body: dict, pool: asyncpg.Pool = Depends(get_pool)):
    nid = _new_id()
    row = await pool.fetchrow(
        "INSERT INTO notes (id, category, title, url, content) VALUES ($1,$2,$3,$4,$5) RETURNING id, category, title, url, content, created_at",
        nid,
        body.get("category", "note"),
        body.get("title"),
        body.get("url"),
        body.get("content"),
    )
    return {"ok": True, "note": _row(row)}


@app.patch("/api/data/notes/{note_id}")
async def update_note(note_id: str, body: dict, pool: asyncpg.Pool = Depends(get_pool)):
    row = await pool.fetchrow(
        """UPDATE notes SET
             category = COALESCE($2, category),
             title    = COALESCE($3, title),
             url      = COALESCE($4, url),
             content  = COALESCE($5, content)
           WHERE id = $1
           RETURNING id, category, title, url, content, created_at""",
        note_id,
        body.get("category"),
        body.get("title"),
        body.get("url"),
        body.get("content"),
    )
    if not row:
        raise HTTPException(404, "Note not found")
    return {"ok": True, "note": _row(row)}


@app.delete("/api/data/notes/{note_id}")
async def delete_note(note_id: str, pool: asyncpg.Pool = Depends(get_pool)):
    await pool.execute("DELETE FROM notes WHERE id = $1", note_id)
    return {"ok": True}


# ── Resumes ────────────────────────────────────────────────────────────────────

@app.post("/api/data/resumes")
async def upload_resume(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    dest = os.path.join(UPLOAD_DIR, file.filename)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True, "path": dest}


# ── Usage ──────────────────────────────────────────────────────────────────────

@app.get("/api/data/usage")
async def get_usage(pool: asyncpg.Pool = Depends(get_pool)):
    return {"ok": True, "traces": [], "daily": []}


# ── Static (SPA fallback — must be last) ─────────────────────────────────────

if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
