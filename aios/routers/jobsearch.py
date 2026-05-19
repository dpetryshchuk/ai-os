import asyncio
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
    FunnelStage,
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
    RetroFunnel,
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
    weekly, daily, by_source, needs_action, stats, funnel_rows, velocity = await asyncio.gather(
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
        pool.fetchrow("""
            SELECT
              COUNT(*) FILTER (WHERE stage IN ('Outreached','Responded','Ongoing','Dead')) AS outreached,
              COUNT(*) FILTER (WHERE stage IN ('Responded','Ongoing'))                    AS responded,
              COUNT(*) FILTER (WHERE stage = 'Ongoing')                                  AS ongoing
            FROM contacts
        """),
        pool.fetchrow("""
            SELECT AVG(EXTRACT(EPOCH FROM (resp.date - out.date)) / 86400.0) AS avg_days
            FROM (
              SELECT contact_id, MIN(date) AS date FROM interactions GROUP BY contact_id
            ) out
            JOIN (
              SELECT i.contact_id, MIN(i.date) AS date
              FROM interactions i
              JOIN contacts c ON c.id = i.contact_id
              WHERE c.stage IN ('Responded','Ongoing')
              GROUP BY i.contact_id
            ) resp ON resp.contact_id = out.contact_id
            WHERE resp.date > out.date
        """),
    )

    today_count = sum(r["count"] for r in daily if str(r["date"]) == str(__import__("datetime").date.today()))
    from datetime import date as _date
    week_start = _date.today()
    dow = week_start.weekday()
    import datetime as _dt
    week_start = week_start - _dt.timedelta(days=dow)
    week_count = sum(r["count"] for r in daily if r["date"] >= week_start)

    outreached = funnel_rows["outreached"] or 0
    responded = funnel_rows["responded"] or 0
    ongoing = funnel_rows["ongoing"] or 0
    funnel_stages = [
        FunnelStage(stage="Outreached", count=outreached, pct_of_prev=None),
        FunnelStage(stage="Responded", count=responded,
                    pct_of_prev=round(responded / outreached * 100, 1) if outreached else None),
        FunnelStage(stage="In conversation", count=ongoing,
                    pct_of_prev=round(ongoing / responded * 100, 1) if responded else None),
    ]
    avg_days = float(velocity["avg_days"]) if velocity and velocity["avg_days"] else None

    return RetroResponse(
        weekly=[WeeklyCount.model_validate(dict(r)) for r in weekly],
        daily=[DailyCount.model_validate(dict(r)) for r in daily],
        by_source=[SourceStat.model_validate(dict(r)) for r in by_source],
        needs_action=[NeedsActionContact.model_validate(dict(r)) for r in needs_action],
        stats=RetroStats.model_validate(dict(stats)) if stats else RetroStats(),
        funnel=RetroFunnel(
            stages=funnel_stages,
            avg_days_to_response=avg_days,
            interactions_this_week=week_count,
            interactions_today=today_count,
        ),
    )


# ── Leads ──────────────────────────────────────────────────────────────────────

@router.get("/leads")
async def get_leads(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> LeadsResponse:
    rows = await pool.fetch("""
        SELECT jp.id, jp.title, jp.link, jp.source, jp.status,
               jp.location, jp.scraped_at,
               co.name AS company_name, co.website
        FROM job_postings jp
        LEFT JOIN companies co ON co.id = jp.company_id
        WHERE jp.status = 'new'
        ORDER BY jp.scraped_at DESC NULLS LAST, jp.id DESC
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
    allowed = {"scrape.sd", "scrape.yc", "scrape.hn", "health.check"}
    if task_type not in allowed:
        raise HTTPException(400, f"Unknown task type: {task_type}")
    import events as ev
    from tasks import process_event
    eid = await ev.create(pool, source="ui", type=task_type, payload={})
    process_event.delay(eid)
    return TriggerResponse(event_id=eid)
