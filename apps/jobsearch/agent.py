import json
import os
import secrets
from typing import AsyncIterator

import asyncpg
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.litellm import LiteLLMModel

INSTRUCTIONS = """You are a job search CRM assistant. Help the user manage their job search pipeline.

You have access to tools to:
- Upsert companies and contacts
- Track job postings and applications
- Log interactions
- Update pipeline stages
- Search and manage notes
- Query the database directly

Rules:
- Always call upsert_company first before creating contacts or job postings
- Never create duplicates — tools search before inserting
- When logging a reply, first use query_db to find the contact
- Stage values: Outreached → Responded → Ongoing → Dead
"""

model = LiteLLMModel("deepseek/deepseek-chat")
agent: Agent[asyncpg.Pool, str] = Agent(
    model=model,
    system_prompt=INSTRUCTIONS,
    deps_type=asyncpg.Pool,
)


def _new_id() -> str:
    return secrets.token_hex(8)


@agent.tool
async def upsert_company(ctx: RunContext[asyncpg.Pool], name: str, website: str | None = None) -> str:
    """Find or create a company by name. Returns JSON with id and created flag."""
    pool = ctx.deps
    row = await pool.fetchrow("SELECT id FROM companies WHERE lower(name) = lower($1)", name)
    if row:
        return json.dumps({"id": row["id"], "created": False})
    cid = _new_id()
    await pool.execute("INSERT INTO companies (id, name, website) VALUES ($1, $2, $3)", cid, name, website)
    return json.dumps({"id": cid, "created": True})


@agent.tool
async def upsert_contact(
    ctx: RunContext[asyncpg.Pool],
    name: str,
    company_id: str,
    role: str | None = None,
    source: str | None = None,
    stage: str = "Outreached",
    notes: str | None = None,
) -> str:
    """Find or create a contact at a company. Returns JSON with id and created flag."""
    pool = ctx.deps
    row = await pool.fetchrow(
        "SELECT id FROM contacts WHERE lower(name) = lower($1) AND company_id = $2",
        name, company_id,
    )
    if row:
        return json.dumps({"id": row["id"], "created": False})
    cid = _new_id()
    await pool.execute(
        "INSERT INTO contacts (id, name, company_id, role, source, stage, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        cid, name, company_id, role, source, stage, notes,
    )
    return json.dumps({"id": cid, "created": True})


@agent.tool
async def upsert_job_posting(
    ctx: RunContext[asyncpg.Pool],
    company_id: str,
    title: str,
    link: str | None = None,
    source: str | None = None,
    status: str = "new",
    resume_path: str | None = None,
) -> str:
    """Find or create a job posting. Status values: new, applied, dropped."""
    pool = ctx.deps
    row = await pool.fetchrow(
        "SELECT id FROM job_postings WHERE company_id = $1 AND lower(title) = lower($2)",
        company_id, title,
    )
    if row:
        jid = row["id"]
        if status or resume_path:
            await pool.execute(
                "UPDATE job_postings SET status = COALESCE($2, status), resume_path = COALESCE($3, resume_path) WHERE id = $1",
                jid, status, resume_path,
            )
        return json.dumps({"id": jid, "created": False})
    jid = _new_id()
    await pool.execute(
        "INSERT INTO job_postings (id, company_id, title, link, source, status, resume_path) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        jid, company_id, title, link, source, status, resume_path,
    )
    return json.dumps({"id": jid, "created": True})


@agent.tool
async def update_stage(ctx: RunContext[asyncpg.Pool], contact_id: str, stage: str) -> str:
    """Update the pipeline stage for a contact. Stage values: Outreached, Responded, Ongoing, Dead."""
    pool = ctx.deps
    await pool.execute("UPDATE contacts SET stage = $2 WHERE id = $1", contact_id, stage)
    return json.dumps({"ok": True})


@agent.tool
async def log_interaction(
    ctx: RunContext[asyncpg.Pool],
    contact_id: str,
    direction: str,
    notes: str | None = None,
) -> str:
    """Log an interaction with a contact. Direction: out (sent by me), in (received reply)."""
    pool = ctx.deps
    iid = _new_id()
    await pool.execute(
        "INSERT INTO interactions (id, contact_id, direction, notes) VALUES ($1,$2,$3,$4)",
        iid, contact_id, direction, notes,
    )
    return json.dumps({"id": iid})


@agent.tool
async def log_content_post(
    ctx: RunContext[asyncpg.Pool],
    content: str,
    impressions: int = 0,
    engagements: int = 0,
    comments: int = 0,
) -> str:
    """Log a LinkedIn or social media content post with engagement metrics."""
    pool = ctx.deps
    pid = _new_id()
    await pool.execute(
        "INSERT INTO content_posts (id, content, impressions, engagements, comments) VALUES ($1,$2,$3,$4,$5)",
        pid, content, impressions, engagements, comments,
    )
    return json.dumps({"id": pid})


@agent.tool
async def search_notes(ctx: RunContext[asyncpg.Pool], query: str) -> str:
    """Full-text search across notes. Returns matching notes as a JSON array."""
    pool = ctx.deps
    rows = await pool.fetch(
        "SELECT id, category, title, url, content FROM notes "
        "WHERE to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(url,'')) "
        "@@ plainto_tsquery('english', $1) LIMIT 20",
        query,
    )
    return json.dumps([dict(r) for r in rows])


@agent.tool
async def query_db(ctx: RunContext[asyncpg.Pool], sql: str) -> str:
    """Run a read-only SELECT query against the database. Returns results as a JSON array."""
    pool = ctx.deps
    if not sql.strip().upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries allowed"})
    try:
        rows = await pool.fetch(sql)
        return json.dumps([dict(r) for r in rows], default=str)
    except Exception as e:
        return json.dumps({"error": str(e)})


async def agentic_stream(messages: list, pool: asyncpg.Pool) -> AsyncIterator[str]:
    user_text = messages[-1].get("content", "") if messages else ""
    try:
        async with agent.run_stream(user_text, deps=pool) as result:
            async for chunk in result.stream_text(delta=True):
                yield f"data: {json.dumps({'type': 'text-delta', 'payload': {'text': chunk}})}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'payload': {'message': str(e)}})}\n\n"
        yield "data: [DONE]\n\n"
