import json
import os
import secrets
import shutil

import asyncpg
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

import db
from agent import agentic_stream
from config import settings
from schemas import (
    AgentStreamRequest,
    ApplicationsResponse,
    ApplicationRow,
    ContentPostRow,
    ContentResponse,
    EventsResponse,
    LeadsResponse,
    LeadRow,
    NoteCreate,
    NoteResponse,
    NoteRow,
    NotesResponse,
    NoteUpdate,
    OkResponse,
    OsEventRow,
    PipelineResponse,
    ContactRow,
    RetroResponse,
    WeeklyCount,
    DailyCount,
    SourceStat,
    NeedsActionContact,
    RetroStats,
    ResumeResponse,
    TriggerResponse,
)

router = APIRouter()


# ── Agent SSE stream ──────────────────────────────────────────────────────────

@router.post("/agents/stream")
async def agent_stream(body: AgentStreamRequest, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    async def generate():
        try:
            async for chunk in agentic_stream(body.messages, pool):
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
async def get_pipeline(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> PipelineResponse:
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
    return PipelineResponse(contacts=[ContactRow.model_validate(dict(r)) for r in rows])


# ── Retro ──────────────────────────────────────────────────────────────────────

@router.get("/retro")
async def get_retro(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> RetroResponse:
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
    return RetroResponse(
        weekly=[WeeklyCount.model_validate(dict(r)) for r in weekly],
        daily=[DailyCount.model_validate(dict(r)) for r in daily],
        by_source=[SourceStat.model_validate(dict(r)) for r in by_source],
        needs_action=[NeedsActionContact.model_validate(dict(r)) for r in needs_action],
        stats=RetroStats.model_validate(dict(stats)) if stats else RetroStats(),
    )


# ── Leads ──────────────────────────────────────────────────────────────────────

@router.get("/leads")
async def get_leads(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> LeadsResponse:
    rows = await pool.fetch("""
        SELECT jp.id, jp.title, jp.link, jp.source, jp.status, co.name AS company_name, co.website
        FROM job_postings jp
        LEFT JOIN companies co ON co.id = jp.company_id
        WHERE jp.status = 'new'
        ORDER BY jp.id DESC
    """)
    return LeadsResponse(leads=[LeadRow.model_validate(dict(r)) for r in rows])


# ── Applications ───────────────────────────────────────────────────────────────

@router.get("/applications")
async def get_applications(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> ApplicationsResponse:
    rows = await pool.fetch("""
        SELECT jp.id, jp.title, jp.link, jp.source, jp.status, jp.resume_path,
               co.name AS company_name, co.website
        FROM job_postings jp
        LEFT JOIN companies co ON co.id = jp.company_id
        WHERE jp.status = 'applied'
        ORDER BY jp.id DESC
    """)
    return ApplicationsResponse(applications=[ApplicationRow.model_validate(dict(r)) for r in rows])


# ── Notes ──────────────────────────────────────────────────────────────────────

@router.get("/notes")
async def get_notes(q: str = "", pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> NotesResponse:
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
    return NotesResponse(notes=[NoteRow.model_validate(dict(r)) for r in rows])


@router.post("/notes", status_code=201)
async def create_note(body: NoteCreate, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> NoteResponse:
    nid = secrets.token_hex(8)
    row = await pool.fetchrow(
        "INSERT INTO notes (id, category, title, url, content) VALUES ($1,$2,$3,$4,$5) "
        "RETURNING id, category, title, url, content, created_at",
        nid, body.category, body.title, body.url, body.content,
    )
    return NoteResponse(note=NoteRow.model_validate(dict(row)))


@router.patch("/notes/{note_id}")
async def update_note(note_id: str, body: NoteUpdate, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> NoteResponse:
    row = await pool.fetchrow(
        """UPDATE notes SET
             category = COALESCE($2, category),
             title    = COALESCE($3, title),
             url      = COALESCE($4, url),
             content  = COALESCE($5, content)
           WHERE id = $1
           RETURNING id, category, title, url, content, created_at""",
        note_id, body.category, body.title, body.url, body.content,
    )
    if not row:
        raise HTTPException(404, "Note not found")
    return NoteResponse(note=NoteRow.model_validate(dict(row)))


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> OkResponse:
    await pool.execute("DELETE FROM notes WHERE id = $1", note_id)
    return OkResponse()


# ── Resumes ────────────────────────────────────────────────────────────────────

@router.post("/resumes")
async def upload_resume(file: UploadFile = File(...)) -> ResumeResponse:
    os.makedirs(settings.uploads_dir, exist_ok=True)
    dest = os.path.join(settings.uploads_dir, file.filename)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return ResumeResponse(path=dest)


# ── Content ────────────────────────────────────────────────────────────────────

@router.get("/content")
async def get_content(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> ContentResponse:
    rows = await pool.fetch(
        "SELECT id, posted_date, content, impressions, engagements, comments "
        "FROM content_posts ORDER BY posted_date DESC"
    )
    return ContentResponse(posts=[ContentPostRow.model_validate(dict(r)) for r in rows])


# ── Events ─────────────────────────────────────────────────────────────────────

@router.get("/events")
async def get_os_events(
    limit: int = 50,
    pool: asyncpg.Pool = Depends(db.get_jobsearch_pool),
) -> EventsResponse:
    rows = await pool.fetch(
        "SELECT id, source, type, status, error, created_at, started_at, completed_at "
        "FROM os_events ORDER BY created_at DESC LIMIT $1",
        limit,
    )
    return EventsResponse(events=[OsEventRow.model_validate(dict(r)) for r in rows])


# ── Trigger ────────────────────────────────────────────────────────────────────

@router.post("/trigger/{task_type}")
async def trigger_task(task_type: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> TriggerResponse:
    allowed = {"scrape.yc", "scrape.hn", "scrape.remoteok", "scrape.simplify", "health.check"}
    if task_type not in allowed:
        raise HTTPException(400, f"Unknown task type: {task_type}")
    import events as ev
    from tasks import process_event
    eid = await ev.create(pool, source="ui", type=task_type, payload={})
    process_event.delay(eid)
    return TriggerResponse(event_id=eid)
