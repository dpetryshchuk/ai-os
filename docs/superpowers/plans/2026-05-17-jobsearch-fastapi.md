# jobsearch FastAPI Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mastra/Express/TypeScript backend with FastAPI/Python. All data routes keep identical response shapes. The agent streaming endpoint replaces Mastra with the Anthropic Python SDK (Claude), preserving the exact SSE event format the React frontend expects.

**Architecture:** FastAPI + asyncpg for data routes. `AsyncAnthropic` for the agent streaming endpoint with an agentic loop (text-delta → tool-call → tool-result → repeat → [DONE]). Langfuse Python SDK for observability.

**Tech Stack:** Python 3.12, FastAPI 0.115, asyncpg 0.29, anthropic 0.40, sse-starlette 2.1, langfuse 2.7, python-multipart, pytest + httpx

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/jobsearch/main.py` |
| Create | `apps/jobsearch/db.py` |
| Create | `apps/jobsearch/agent.py` |
| Create | `apps/jobsearch/requirements.txt` |
| Create | `apps/jobsearch/pytest.ini` |
| Create | `apps/jobsearch/tests/__init__.py` |
| Create | `apps/jobsearch/tests/test_main.py` |
| Modify | `apps/jobsearch/db/schema.sql` (add notes table) |
| Replace | `apps/jobsearch/Dockerfile` |
| Delete  | `apps/jobsearch/src/`, `apps/jobsearch/package.json`, `apps/jobsearch/package-lock.json`, `apps/jobsearch/tsconfig.json`, `apps/jobsearch/.mastra/` |

---

### Task 1: Project setup + schema fix

**Files:**
- Create: `apps/jobsearch/requirements.txt`
- Create: `apps/jobsearch/pytest.ini`
- Create: `apps/jobsearch/tests/__init__.py`
- Modify: `apps/jobsearch/db/schema.sql`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
asyncpg==0.29.0
anthropic==0.40.0
sse-starlette==2.1.3
python-multipart==0.0.9
httpx==0.27.0
langfuse==2.7.3
python-dotenv==1.0.0
pytest==8.3.0
pytest-asyncio==0.23.8
anyio==4.4.0
```

- [ ] **Step 2: Create pytest.ini**

```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 3: Create tests/__init__.py** (empty)

- [ ] **Step 4: Append notes table DDL to apps/jobsearch/db/schema.sql**

Add these lines at the end of `apps/jobsearch/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  category    TEXT NOT NULL DEFAULT 'note',
  title       TEXT,
  url         TEXT,
  content     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_fts ON notes
  USING GIN(to_tsvector('english',
    COALESCE(title,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(url,'')));
```

- [ ] **Step 5: Install deps**

```bash
cd apps/jobsearch
pip install -r requirements.txt
```

---

### Task 2: db.py

**Files:**
- Create: `apps/jobsearch/db.py`

- [ ] **Step 1: Create db.py**

```python
import asyncpg
import os
from typing import Optional

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    return _pool  # type: ignore[return-value]


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
```

---

### Task 3: Write all tests (all must fail)

**Files:**
- Create: `apps/jobsearch/tests/test_main.py`

- [ ] **Step 1: Create tests/test_main.py**

```python
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from main import app, get_pool


def make_mock_pool():
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()
    pool.fetchval = AsyncMock(return_value=None)
    return pool


@pytest.fixture
async def client():
    pool = make_mock_pool()
    app.dependency_overrides[get_pool] = lambda: pool
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c, pool
    app.dependency_overrides.clear()


async def test_health(client):
    c, _ = client
    r = await c.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "status": "healthy"}


async def test_get_pipeline_empty(client):
    c, _ = client
    r = await c.get("/api/data/pipeline")
    assert r.status_code == 200
    assert r.json() == []


async def test_get_leads_empty(client):
    c, _ = client
    r = await c.get("/api/data/leads")
    assert r.status_code == 200
    assert r.json() == []


async def test_get_applications_empty(client):
    c, _ = client
    r = await c.get("/api/data/applications")
    assert r.status_code == 200
    assert r.json() == []


async def test_get_content_empty(client):
    c, _ = client
    r = await c.get("/api/data/content")
    assert r.status_code == 200
    assert r.json() == []


async def test_get_notes_empty(client):
    c, _ = client
    r = await c.get("/api/data/notes")
    assert r.status_code == 200
    assert r.json() == []


async def test_get_notes_with_search(client):
    c, _ = client
    r = await c.get("/api/data/notes?q=python")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_note(client):
    c, pool = client
    pool.fetchrow.return_value = MagicMock(
        __iter__=lambda s: iter([
            ("id", "abc123"), ("category", "note"), ("title", "Test"),
            ("url", None), ("content", "hello"), ("created_at", "2024-01-01T00:00:00")
        ]),
        keys=lambda: ["id", "category", "title", "url", "content", "created_at"],
    )
    r = await c.post("/api/data/notes", json={"title": "Test", "content": "hello"})
    assert r.status_code == 201


async def test_delete_note(client):
    c, pool = client
    r = await c.delete("/api/data/notes/abc123")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    pool.execute.assert_called_once()


async def test_agent_stream_returns_sse(client):
    c, pool = client
    mock_stream = AsyncMock()
    mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
    mock_stream.__aexit__ = AsyncMock(return_value=False)

    async def _aiter():
        return
        yield  # make it an async generator

    mock_stream.__aiter__ = lambda s: _aiter()
    mock_stream.get_final_message = AsyncMock(return_value=MagicMock(
        stop_reason="end_turn",
        content=[MagicMock(type="text", text="Hi")],
    ))

    with patch("main.anthropic_client") as mock_client:
        mock_client.messages.stream.return_value = mock_stream
        r = await c.post(
            "/api/agents/jobsearch/stream",
            json={"messages": [{"role": "user", "content": "hello"}]},
        )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
cd apps/jobsearch
pytest tests/ -v
```

Expected: all FAIL (main.py doesn't exist).

---

### Task 4: Implement agent.py

**Files:**
- Create: `apps/jobsearch/agent.py`

- [ ] **Step 1: Create agent.py**

```python
"""Agent tool definitions and agentic loop for the jobsearch CRM."""
import json
import secrets
from typing import Any

import asyncpg

INSTRUCTIONS = """You are a job search CRM assistant. You help log and track every event in a structured job search pipeline.

## Database tables
- companies: the employers
- contacts: people at companies you've reached out to or met
- job_postings: listings you've found or applied to
- interactions: every message sent (out) or received (in)

## Core rule
Always call upsert_company first to get a company_id before creating a contact or job posting.
upsert_* tools search before inserting — they never create duplicates.

## The four flows you handle

### 1. Paste a job posting (found on YC, HN, LinkedIn, etc.)
→ upsert_company(name, website)
→ upsert_job_posting(company_id, title, link, source, status: "new")

### 2. Log an application (you submitted)
→ upsert_company(name, website)
→ upsert_job_posting(company_id, title, source, status: "applied")
→ log_interaction(contact_id, direction: "out", notes: "Applied via [source]")

### 3. Log outreach to a person
→ upsert_company(name, website)
→ upsert_contact(name, company_id, role, source, stage: "Outreached")
→ log_interaction(contact_id, direction: "out", notes: <summary>)

### 4. Log a reply or inbound event
→ query_db to find the contact by name
→ update_stage(contact_id, stage: "Responded" | "Ongoing")
→ log_interaction(contact_id, direction: "in", notes: <what happened>)

## Stages: Outreached → Responded → Ongoing → Dead
## Sources (contacts): LinkedIn | YC | Cold Email | Referral | Event
## Sources (job_postings): YC | HN | RemoteOK | SimplifyJobs | LinkedIn | CompanySite
## Use search_notes when the user asks what they saved or noted about a topic.
## Use query_db for read-only lookups."""

TOOLS = [
    {
        "name": "upsert_company",
        "description": "Create or update a company. Always run before creating contacts or job postings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "website": {"type": "string"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "upsert_contact",
        "description": "Create or update a contact. Use after upsert_company.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "company_id": {"type": "string"},
                "role": {"type": "string"},
                "source": {"type": "string", "enum": ["LinkedIn", "YC", "Cold Email", "Referral", "Event"]},
                "stage": {"type": "string", "enum": ["Outreached", "Responded", "Ongoing", "Dead"]},
                "notes": {"type": "string"},
            },
            "required": ["name", "company_id", "source"],
        },
    },
    {
        "name": "upsert_job_posting",
        "description": "Create or update a job posting. Use after upsert_company.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"},
                "title": {"type": "string"},
                "link": {"type": "string"},
                "source": {"type": "string", "enum": ["YC", "HN", "RemoteOK", "SimplifyJobs", "LinkedIn", "CompanySite"]},
                "status": {"type": "string", "enum": ["new", "applied", "dropped"]},
                "description": {"type": "string"},
            },
            "required": ["company_id", "title", "source"],
        },
    },
    {
        "name": "update_stage",
        "description": "Move a contact to a new pipeline stage.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "stage": {"type": "string", "enum": ["Outreached", "Responded", "Ongoing", "Dead"]},
            },
            "required": ["contact_id", "stage"],
        },
    },
    {
        "name": "log_interaction",
        "description": "Record a message sent or received. direction: out=you sent, in=they replied.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "direction": {"type": "string", "enum": ["in", "out"]},
                "notes": {"type": "string"},
            },
            "required": ["contact_id", "direction", "notes"],
        },
    },
    {
        "name": "query_db",
        "description": "Run a read-only SQL query for lookups and stats.",
        "input_schema": {
            "type": "object",
            "properties": {"sql": {"type": "string"}},
            "required": ["sql"],
        },
    },
    {
        "name": "search_notes",
        "description": "Search saved notes by keyword.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
]


def _new_id() -> str:
    return secrets.token_hex(8)


async def run_tool(name: str, inp: dict[str, Any], pool: asyncpg.Pool) -> Any:
    if name == "upsert_company":
        row = await pool.fetchrow(
            "SELECT id FROM companies WHERE lower(name) = lower($1)", inp["name"]
        )
        if row:
            cid = row["id"]
            if inp.get("website"):
                await pool.execute(
                    "UPDATE companies SET website=$1 WHERE id=$2", inp["website"], cid
                )
            return {"action": "updated", "id": cid, "name": inp["name"]}
        cid = _new_id()
        await pool.execute(
            "INSERT INTO companies (id, name, website) VALUES ($1, $2, $3)",
            cid, inp["name"], inp.get("website"),
        )
        return {"action": "created", "id": cid, "name": inp["name"]}

    if name == "upsert_contact":
        row = await pool.fetchrow(
            "SELECT id FROM contacts WHERE lower(name)=lower($1) AND company_id=$2",
            inp["name"], inp["company_id"],
        )
        if row:
            cid = row["id"]
            await pool.execute(
                "UPDATE contacts SET role=COALESCE($1,role), stage=$2, notes=COALESCE($3,notes) WHERE id=$4",
                inp.get("role"), inp.get("stage", "Outreached"), inp.get("notes"), cid,
            )
            return {"action": "updated", "id": cid, "name": inp["name"]}
        cid = _new_id()
        await pool.execute(
            "INSERT INTO contacts (id,name,company_id,role,source,stage,outreach_date,notes)"
            " VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7)",
            cid, inp["name"], inp["company_id"], inp.get("role"),
            inp["source"], inp.get("stage", "Outreached"), inp.get("notes"),
        )
        return {"action": "created", "id": cid, "name": inp["name"]}

    if name == "upsert_job_posting":
        row = await pool.fetchrow(
            "SELECT id FROM job_postings WHERE company_id=$1 AND lower(title)=lower($2)",
            inp["company_id"], inp["title"],
        )
        if row:
            jid = row["id"]
            await pool.execute(
                "UPDATE job_postings SET status=$1, description=COALESCE($2,description) WHERE id=$3",
                inp.get("status", "new"), inp.get("description"), jid,
            )
            return {"action": "updated", "id": jid, "title": inp["title"]}
        jid = _new_id()
        await pool.execute(
            "INSERT INTO job_postings (id,company_id,title,link,source,scraped_date,status,description)"
            " VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,$7)",
            jid, inp["company_id"], inp["title"], inp.get("link"),
            inp["source"], inp.get("status", "new"), inp.get("description"),
        )
        return {"action": "created", "id": jid, "title": inp["title"]}

    if name == "update_stage":
        await pool.execute(
            "UPDATE contacts SET stage=$1 WHERE id=$2", inp["stage"], inp["contact_id"]
        )
        return {"action": "updated", "contact_id": inp["contact_id"], "stage": inp["stage"]}

    if name == "log_interaction":
        iid = _new_id()
        await pool.execute(
            "INSERT INTO interactions (id,contact_id,date,direction,notes)"
            " VALUES ($1,$2,CURRENT_DATE,$3,$4)",
            iid, inp["contact_id"], inp["direction"], inp["notes"],
        )
        return {"action": "created", "id": iid}

    if name == "query_db":
        async with pool.acquire() as conn:
            await conn.execute("SET TRANSACTION READ ONLY")
            rows = await conn.fetch(inp["sql"])
        return {"rows": [dict(r) for r in rows], "count": len(rows)}

    if name == "search_notes":
        NOTE_TSV = "to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(url,''))"
        rows = await pool.fetch(
            f"SELECT id,category,title,url,content,created_at FROM notes"
            f" WHERE {NOTE_TSV} @@ plainto_tsquery('english',$1)"
            f" ORDER BY ts_rank({NOTE_TSV}, plainto_tsquery('english',$1)) DESC LIMIT 10",
            inp["query"],
        )
        return [dict(r) for r in rows]

    return {"error": f"unknown tool: {name}"}


async def agentic_stream(messages: list[dict], pool: asyncpg.Pool, anthropic_client):
    """Async generator yielding SSE lines for the agent stream endpoint."""
    current_messages = list(messages)

    while True:
        async with anthropic_client.messages.stream(
            model="claude-opus-4-7",
            max_tokens=4096,
            system=INSTRUCTIONS,
            messages=current_messages,
            tools=TOOLS,
        ) as stream:
            async for event in stream:
                if (
                    getattr(event, "type", None) == "content_block_delta"
                    and getattr(getattr(event, "delta", None), "type", None) == "text_delta"
                ):
                    yield f"data: {json.dumps({'type': 'text-delta', 'payload': {'text': event.delta.text}})}\n\n"

            final = await stream.get_final_message()

        if final.stop_reason == "end_turn":
            yield "data: [DONE]\n\n"
            return

        if final.stop_reason == "tool_use":
            content_list = []
            for block in final.content:
                if block.type == "text":
                    content_list.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    content_list.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })
            current_messages.append({"role": "assistant", "content": content_list})

            tool_results = []
            for block in final.content:
                if block.type == "tool_use":
                    yield f"data: {json.dumps({'type': 'tool-call', 'payload': {'toolCallId': block.id, 'toolName': block.name, 'args': block.input}})}\n\n"
                    result = await run_tool(block.name, block.input, pool)
                    yield f"data: {json.dumps({'type': 'tool-result', 'payload': {'toolCallId': block.id, 'result': result}})}\n\n"
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })

            current_messages.append({"role": "user", "content": tool_results})
```

- [ ] **Step 2: Commit**

```bash
git add apps/jobsearch/agent.py
git commit -m "feat(jobsearch): agent tool definitions and agentic loop"
```

---

### Task 5: Implement main.py

**Files:**
- Create: `apps/jobsearch/main.py`

- [ ] **Step 1: Create main.py**

```python
import asyncio
from contextlib import asynccontextmanager
from typing import Any
import os
import secrets

import asyncpg
import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import anthropic

from agent import agentic_stream
from db import close_pool, get_pool, init_pool

UPLOADS_DIR = os.environ.get("UPLOADS_DIR", "/app/uploads")
LANGFUSE_HOST = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")
anthropic_client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(UPLOADS_DIR, exist_ok=True)
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


def _rows(records) -> list[dict[str, Any]]:
    result = []
    for r in records:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        result.append(d)
    return result


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"ok": True, "status": "healthy"}


# ── Data ──────────────────────────────────────────────────────────────────────

@app.get("/api/data/usage")
async def get_usage():
    auth = httpx.BasicAuth(
        os.environ.get("LANGFUSE_PUBLIC_KEY", ""),
        os.environ.get("LANGFUSE_SECRET_KEY", ""),
    )
    async with httpx.AsyncClient(auth=auth, timeout=10) as client:
        traces_r, daily_r = await asyncio.gather(
            client.get(f"{LANGFUSE_HOST}/api/public/traces?limit=50&orderBy=timestamp&order=DESC"),
            client.get(f"{LANGFUSE_HOST}/api/public/metrics/daily?limit=30"),
        )
    traces = traces_r.json().get("data", [])
    daily = daily_r.json().get("data", [])
    return {"traces": traces, "daily": daily}


@app.get("/api/data/pipeline")
async def get_pipeline(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("""
        SELECT c.id, c.name, c.role, c.source, c.stage,
               co.name as company, MAX(i.date) as last_contact
        FROM contacts c
        LEFT JOIN companies co ON c.company_id = co.id
        LEFT JOIN interactions i ON i.contact_id = c.id
        GROUP BY c.id, c.name, c.role, c.source, c.stage, co.name
        ORDER BY
          CASE c.stage WHEN 'Ongoing' THEN 1 WHEN 'Responded' THEN 2
                       WHEN 'Outreached' THEN 3 ELSE 4 END,
          MAX(i.date) DESC NULLS LAST
    """)
    return _rows(rows)


@app.get("/api/data/retro")
async def get_retro(pool: asyncpg.Pool = Depends(get_pool)):
    weekly, daily, by_source, stats, needs_action, alltime, recent = await asyncio.gather(
        pool.fetch("""SELECT to_char(date_trunc('week',date::timestamp),'YYYY-MM-DD') as week,
                             direction, COUNT(*) as n
                      FROM interactions GROUP BY week,direction ORDER BY week DESC"""),
        pool.fetch("""SELECT date::text, direction, COUNT(*) as n FROM interactions
                      WHERE date::date>=CURRENT_DATE-6 GROUP BY date,direction ORDER BY date ASC"""),
        pool.fetch("SELECT source,stage,COUNT(*) as n FROM contacts GROUP BY source,stage ORDER BY source,stage"),
        pool.fetchrow("""SELECT
            (SELECT COUNT(*) FROM interactions WHERE direction='out' AND date>=CURRENT_DATE-7) as sent_week,
            (SELECT COUNT(*) FROM interactions WHERE direction='in' AND date>=CURRENT_DATE-7) as received_week,
            (SELECT COUNT(*) FROM contacts WHERE stage IN ('Responded','Ongoing')) as active,
            (SELECT COUNT(*) FROM contacts WHERE stage!='Dead') as total_contacts"""),
        pool.fetch("""SELECT c.name, co.name as company, c.stage, MAX(i.date) as last_contact
                      FROM contacts c LEFT JOIN companies co ON c.company_id=co.id
                      LEFT JOIN interactions i ON i.contact_id=c.id
                      WHERE c.stage IN ('Responded','Ongoing')
                      GROUP BY c.id,c.name,co.name,c.stage
                      HAVING MAX(i.date)<CURRENT_DATE-3 OR MAX(i.date) IS NULL
                      ORDER BY last_contact ASC NULLS FIRST LIMIT 10"""),
        pool.fetchrow("""SELECT
            (SELECT COUNT(*) FROM interactions WHERE direction='out') as sent_total,
            (SELECT COUNT(*) FROM interactions WHERE direction='in') as received_total,
            (SELECT COUNT(*) FROM contacts) as contacts_total,
            (SELECT COUNT(*) FROM contacts WHERE stage='Dead') as dead_total,
            (SELECT MIN(date) FROM interactions) as first_interaction"""),
        pool.fetch("""SELECT i.date::text,i.direction,i.notes,c.name as contact,
                             co.name as company,c.stage
                      FROM interactions i JOIN contacts c ON i.contact_id=c.id
                      LEFT JOIN companies co ON c.company_id=co.id
                      WHERE i.date>=CURRENT_DATE-6 ORDER BY i.date DESC,i.id DESC"""),
    )
    return {
        "weekly": _rows(weekly),
        "daily": _rows(daily),
        "bySource": _rows(by_source),
        "stats": dict(stats) if stats else {},
        "needsAction": _rows(needs_action),
        "alltime": dict(alltime) if alltime else {},
        "recentActivity": _rows(recent),
    }


@app.get("/api/data/leads")
async def get_leads(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("""
        SELECT jp.id, jp.title, co.name as company, jp.source, jp.link, jp.scraped_date
        FROM job_postings jp LEFT JOIN companies co ON jp.company_id=co.id
        WHERE jp.status='new' ORDER BY jp.scraped_date DESC
    """)
    return _rows(rows)


@app.get("/api/data/applications")
async def get_applications(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("""
        SELECT jp.id, jp.title, co.name as company, jp.source, jp.link,
               jp.scraped_date, jp.resume_path
        FROM job_postings jp LEFT JOIN companies co ON jp.company_id=co.id
        WHERE jp.status='applied' ORDER BY jp.scraped_date DESC
    """)
    return _rows(rows)


@app.get("/api/data/content")
async def get_content(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch(
        "SELECT id,posted_date,content,impressions,engagements,comments"
        " FROM content_posts ORDER BY posted_date DESC"
    )
    return _rows(rows)


@app.get("/api/data/notes")
async def get_notes(q: str | None = None, pool: asyncpg.Pool = Depends(get_pool)):
    NOTE_COLS = "id, category, title, url, content, created_at"
    NOTE_TSV = "to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(url,''))"
    if q:
        rows = await pool.fetch(
            f"SELECT {NOTE_COLS} FROM notes WHERE {NOTE_TSV} @@ plainto_tsquery('english',$1)"
            f" ORDER BY ts_rank({NOTE_TSV}, plainto_tsquery('english',$1)) DESC LIMIT 15",
            q,
        )
    else:
        rows = await pool.fetch(f"SELECT {NOTE_COLS} FROM notes ORDER BY created_at DESC")
    return _rows(rows)


@app.post("/api/data/notes", status_code=201)
async def create_note(body: dict, pool: asyncpg.Pool = Depends(get_pool)):
    nid = secrets.token_hex(8)
    row = await pool.fetchrow(
        "INSERT INTO notes (id,category,title,url,content) VALUES ($1,$2,$3,$4,$5)"
        " RETURNING id,category,title,url,content,created_at",
        nid, body.get("category", "note"), body.get("title"), body.get("url"), body.get("content"),
    )
    d = dict(row)
    if hasattr(d.get("created_at"), "isoformat"):
        d["created_at"] = d["created_at"].isoformat()
    return d


@app.patch("/api/data/notes/{note_id}")
async def update_note(note_id: str, body: dict, pool: asyncpg.Pool = Depends(get_pool)):
    row = await pool.fetchrow(
        "UPDATE notes SET category=$1,title=$2,url=$3,content=$4 WHERE id=$5"
        " RETURNING id,category,title,url,content,created_at",
        body.get("category", "note"), body.get("title"), body.get("url"), body.get("content"), note_id,
    )
    if not row:
        raise HTTPException(404, "Not found")
    d = dict(row)
    if hasattr(d.get("created_at"), "isoformat"):
        d["created_at"] = d["created_at"].isoformat()
    return d


@app.delete("/api/data/notes/{note_id}")
async def delete_note(note_id: str, pool: asyncpg.Pool = Depends(get_pool)):
    await pool.execute("DELETE FROM notes WHERE id=$1", note_id)
    return {"ok": True}


@app.post("/api/data/resumes")
async def upload_resume(
    file: UploadFile = File(...),
    applicationId: str = Form(...),
    pool: asyncpg.Pool = Depends(get_pool),
):
    import os as _os
    ext = _os.path.splitext(file.filename or "")[1] or ".pdf"
    filename = f"{applicationId}{ext}"
    dest = _os.path.join(UPLOADS_DIR, filename)
    _os.makedirs(UPLOADS_DIR, exist_ok=True)
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)
    await pool.execute(
        "UPDATE job_postings SET resume_path=$1 WHERE id=$2", filename, applicationId
    )
    return {"path": filename}


# ── Agent ─────────────────────────────────────────────────────────────────────

@app.post("/api/agents/jobsearch/stream")
async def agent_stream(body: dict, pool: asyncpg.Pool = Depends(get_pool)):
    messages = body.get("messages", [])
    return StreamingResponse(
        agentic_stream(messages, pool, anthropic_client),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Static ────────────────────────────────────────────────────────────────────

if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
```

Note: the `get_retro` function uses `asyncio.gather` — add `import asyncio` at the top of main.py.

- [ ] **Step 2: Run tests — all should pass**

```bash
cd apps/jobsearch
pytest tests/ -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/jobsearch/main.py apps/jobsearch/db.py apps/jobsearch/requirements.txt apps/jobsearch/pytest.ini apps/jobsearch/tests/ apps/jobsearch/db/schema.sql
git commit -m "feat(jobsearch): FastAPI backend + Anthropic agent + tests"
```

---

### Task 6: Replace Dockerfile + update docker-compose

**Files:**
- Replace: `apps/jobsearch/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Replace Dockerfile**

```dockerfile
# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY packages/ui ./packages/ui
COPY apps/jobsearch/frontend/package.json apps/jobsearch/frontend/package-lock.json ./apps/jobsearch/frontend/
RUN cd apps/jobsearch/frontend && npm ci
COPY apps/jobsearch/frontend ./apps/jobsearch/frontend
RUN cd apps/jobsearch/frontend && npm run build

FROM python:3.12-slim AS runner
WORKDIR /app
COPY apps/jobsearch/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/jobsearch/main.py apps/jobsearch/db.py apps/jobsearch/agent.py ./
COPY --from=frontend-builder /app/apps/jobsearch/public ./public
ENV PORT=4111
EXPOSE 4111
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4111"]
```

- [ ] **Step 2: Update docker-compose.yml — replace DEEPSEEK_API_KEY with ANTHROPIC_API_KEY in jobsearch service**

In `docker-compose.yml`, in the `jobsearch` service environment block, replace:
```yaml
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
```
with:
```yaml
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
```

- [ ] **Step 3: Build locally**

```bash
docker build -f apps/jobsearch/Dockerfile -t jobsearch-test .
```

Expected: succeeds.

- [ ] **Step 4: Delete old files**

```bash
cd apps/jobsearch
rm -f package.json package-lock.json tsconfig.json
rm -rf src/ node_modules/ .mastra/
```

- [ ] **Step 5: Commit**

```bash
git add apps/jobsearch/Dockerfile docker-compose.yml
git rm -f apps/jobsearch/package.json apps/jobsearch/package-lock.json apps/jobsearch/tsconfig.json 2>/dev/null || true
git commit -m "chore(jobsearch): Python Dockerfile, swap DeepSeek→Anthropic in compose"
```
