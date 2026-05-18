import json
import os
import shutil
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

import db
from agent import agentic_stream
from config import settings

router = APIRouter()


def _row(record) -> dict[str, Any]:
    d = dict(record)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


# ── Agent SSE stream ──────────────────────────────────────────────────────────

@router.post("/agents/stream")
async def agent_stream(body: dict, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    messages = body.get("messages")
    if not messages:
        raise HTTPException(400, "messages required")

    async def generate():
        try:
            async for chunk in agentic_stream(messages, pool):
                yield chunk
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'payload': {'message': str(e)}})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Pipeline ──────────────────────────────────────────────────────────────────

@router.get("/pipeline")
async def get_pipeline(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
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
    return {"ok": True, "contacts": [_row(r) for r in rows]}


# ── Retro ──────────────────────────────────────────────────────────────────────

@router.get("/retro")
async def get_retro(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    import asyncio
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

@router.get("/leads")
async def get_leads(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    rows = await pool.fetch("""
        SELECT jp.id, jp.title, jp.link, jp.source, jp.status, co.name AS company_name, co.website
        FROM job_postings jp
        LEFT JOIN companies co ON co.id = jp.company_id
        WHERE jp.status = 'new'
        ORDER BY jp.id DESC
    """)
    return {"ok": True, "leads": [_row(r) for r in rows]}


# ── Applications ───────────────────────────────────────────────────────────────

@router.get("/applications")
async def get_applications(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    rows = await pool.fetch("""
        SELECT jp.id, jp.title, jp.link, jp.source, jp.status, jp.resume_path,
               co.name AS company_name, co.website
        FROM job_postings jp
        LEFT JOIN companies co ON co.id = jp.company_id
        WHERE jp.status = 'applied'
        ORDER BY jp.id DESC
    """)
    return {"ok": True, "applications": [_row(r) for r in rows]}


# ── Notes ──────────────────────────────────────────────────────────────────────

@router.get("/notes")
async def get_notes(q: str = "", pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    if q:
        rows = await pool.fetch(
            "SELECT id, category, title, url, content, created_at FROM notes "
            "WHERE to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(url,'')) "
            "@@ plainto_tsquery('english', $1) ORDER BY created_at DESC",
            q,
        )
    else:
        rows = await pool.fetch(
            "SELECT id, category, title, url, content, created_at FROM notes ORDER BY created_at DESC"
        )
    return {"ok": True, "notes": [_row(r) for r in rows]}


@router.post("/notes")
async def create_note(body: dict, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    import secrets
    nid = secrets.token_hex(8)
    row = await pool.fetchrow(
        "INSERT INTO notes (id, category, title, url, content) VALUES ($1,$2,$3,$4,$5) "
        "RETURNING id, category, title, url, content, created_at",
        nid, body.get("category", "note"), body.get("title"), body.get("url"), body.get("content"),
    )
    return {"ok": True, "note": _row(row)}


@router.patch("/notes/{note_id}")
async def update_note(note_id: str, body: dict, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    row = await pool.fetchrow(
        """UPDATE notes SET
             category = COALESCE($2, category),
             title    = COALESCE($3, title),
             url      = COALESCE($4, url),
             content  = COALESCE($5, content)
           WHERE id = $1
           RETURNING id, category, title, url, content, created_at""",
        note_id, body.get("category"), body.get("title"), body.get("url"), body.get("content"),
    )
    if not row:
        raise HTTPException(404, "Note not found")
    return {"ok": True, "note": _row(row)}


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    await pool.execute("DELETE FROM notes WHERE id = $1", note_id)
    return {"ok": True}


# ── Resumes ────────────────────────────────────────────────────────────────────

@router.post("/resumes")
async def upload_resume(file: UploadFile = File(...)):
    os.makedirs(settings.uploads_dir, exist_ok=True)
    dest = os.path.join(settings.uploads_dir, file.filename)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True, "path": dest}


# ── Content ────────────────────────────────────────────────────────────────────

@router.get("/content")
async def get_content(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    rows = await pool.fetch(
        "SELECT id, posted_date, content, impressions, engagements, comments "
        "FROM content_posts ORDER BY posted_date DESC"
    )
    return {"ok": True, "posts": [_row(r) for r in rows]}


# ── Events (os_events read for the events page) ───────────────────────────────

@router.get("/events")
async def get_os_events(
    limit: int = 50,
    pool: asyncpg.Pool = Depends(db.get_jobsearch_pool),
):
    rows = await pool.fetch(
        "SELECT id, source, type, status, error, created_at, started_at, completed_at "
        "FROM os_events ORDER BY created_at DESC LIMIT $1",
        limit,
    )
    return {"ok": True, "events": [_row(r) for r in rows]}


# ── Trigger (UI-triggered tasks) ──────────────────────────────────────────────

@router.post("/trigger/{task_type}")
async def trigger_task(task_type: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    allowed = {"scrape.yc", "scrape.hn", "scrape.remoteok", "scrape.simplify", "health.check"}
    if task_type not in allowed:
        raise HTTPException(400, f"Unknown task type: {task_type}")
    import events as ev
    from tasks import process_event
    eid = await ev.create(pool, source="ui", type=task_type, payload={})
    process_event.delay(eid)
    return {"ok": True, "event_id": eid}
