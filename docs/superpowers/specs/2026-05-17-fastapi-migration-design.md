# FastAPI Migration Design

## Goal

Replace all three Express/Node.js backends with FastAPI (Python). Add a new home app (port 4114) with FastAPI backend, React frontend, Celery Beat scheduler, and Redis. Every app follows an identical Python project structure so future apps can be bootstrapped from a template.

---

## Architecture

```
Internet → Caddy Proxy
  home.dmytropetryshchuk.com    → localhost:4114  (FastAPI, NEW)
  jobsearch.dmytropetryshchuk.com → localhost:4111  (FastAPI, migrated)
  write.dmytropetryshchuk.com   → localhost:4112  (FastAPI, migrated)
  log.dmytropetryshchuk.com     → localhost:4113  (FastAPI, migrated)

Docker Compose services:
  home        :4114   FastAPI + uvicorn
  jobsearch   :4111   FastAPI + uvicorn
  writing-app :4112   FastAPI + uvicorn
  daily-log   :4113   FastAPI + uvicorn
  celery-worker       Python worker (no port, internal)
  celery-beat         Python beat scheduler (no port, internal)
  redis       :6379   Redis 7 (Celery broker + result backend)
  postgres    :5432   unchanged
  caddy       80/443  unchanged
```

---

## Standardized Python App Structure

Every app follows this layout:

```
apps/<app>/
├── main.py            # FastAPI app, all routes, lifespan startup
├── db.py              # asyncpg pool singleton (DB apps only)
├── requirements.txt   # pinned dependencies
├── Dockerfile         # python:3.12-slim + uvicorn
├── frontend/          # unchanged React/Vite
└── public/            # built frontend output (gitignored, served by main.py)
```

### Dockerfile template (all apps)

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "<PORT>"]
```

### requirements.txt baseline (all apps)

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-dotenv==1.0.0
```

DB apps add: `asyncpg==0.29.0`

### main.py pattern (all apps)

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup()
    yield
    await shutdown()

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ... routes ...

app.mount("/", StaticFiles(directory="public", html=True), name="static")
```

### db.py pattern (DB apps)

```python
import asyncpg, os
from typing import Optional

pool: Optional[asyncpg.Pool] = None

async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])
    return pool

async def close_pool():
    global pool
    if pool:
        await pool.close()
        pool = None
```

---

## Per-App Migration

### 1. daily-log (port 4113)

**DB:** PostgreSQL — tables: `entries`, `habit_types`, `habit_logs`

**Routes to implement:**

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/day/{date} | Entry + habit logs for YYYY-MM-DD |
| PUT | /api/day/{date} | Upsert entry text and/or habit log values |
| GET | /api/calendar/{year}/{month} | All days in month with summary |
| GET | /api/archive | All dates with entries/habits, descending |
| GET | /api/habits | All habit type definitions |
| POST | /api/habits | Create habit type |
| PATCH | /api/habits/{id} | Update name or active status |

**Additional deps:** `asyncpg==0.29.0`

**Remove:** `server.ts`, `src/db.ts`, `package.json` backend deps, `tsconfig.json` (keep `frontend/` intact)

---

### 2. writing-app (port 4112)

**DB:** None. Filesystem is authoritative. Essays are markdown files with YAML frontmatter.

**Routes to implement:**

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/essays | List all essays (metadata only) |
| GET | /api/essays/{folder}/{slug} | Read essay (frontmatter + body) |
| PUT | /api/essays/{folder}/{slug} | Write essay |
| POST | /api/essays | Create new essay (slugify title) |
| DELETE | /api/essays/{folder}/{slug} | Delete essay file |
| PATCH | /api/essays/{folder}/{slug}/move | Move to different folder |
| GET | /api/folders | List all folders |
| POST | /api/folders | Create folder |
| PATCH | /api/folders/{folder} | Rename folder |
| DELETE | /api/folders/{folder} | Delete folder |
| POST | /api/git/pull | `git pull` in REPO_DIR |
| POST | /api/git/push | Body: `{ "message": string }` → `git add -A && git commit -m <message> && git push` |

**Additional deps:** `python-frontmatter==1.1.0`

**Path safety:** Reject paths containing `..`, absolute paths — same logic as current Express impl.

**Git:** `subprocess.run(["git", ...], cwd=REPO_DIR, check=True)`

**Remove:** `server.ts`, `package.json` backend deps, `tsconfig.json` (keep `frontend/` intact)

---

### 3. jobsearch (port 4111)

**DB:** PostgreSQL — tables: `companies`, `contacts`, `job_postings`, `interactions`, `content_posts`, `events`, `notes`

**Routes to implement:**

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/data/usage | Langfuse traces + daily metrics |
| GET | /api/data/pipeline | Contacts with company, stage, last-contact |
| GET | /api/data/retro | Weekly/daily stats, conversion, all-time |
| GET | /api/data/leads | New job postings (status='new') |
| GET | /api/data/applications | Applied jobs with resume paths |
| GET | /api/data/content | Content posts by date |
| GET | /api/data/notes | All notes; optional `?q=` full-text search |
| POST | /api/data/notes | Create note (multipart: category, title, url, content) |
| PATCH | /api/data/notes/{id} | Update note |
| DELETE | /api/data/notes/{id} | Delete note |
| POST | /api/data/resumes | Upload PDF (multipart), store to /app/uploads |
| POST | /api/agents/jobsearch/stream | SSE streaming agent chat (Claude SDK) |

**Agent streaming:** Replace Mastra with `anthropic` Python SDK. Use `StreamingResponse` + `sse-starlette`. The agent receives user messages, calls DB query tools, streams back text deltas as SSE.

**SSE request/response contract (must match frontend exactly):**

Request body: `{ "messages": [{ "role": "user", "content": "..." }] }`

Response: newline-delimited SSE, each event on one line:
```
data: {"type":"text-delta","payload":{"text":"..."}}\n\n
data: {"type":"tool-call","payload":{"toolCallId":"...","toolName":"...","args":{}}}\n\n
data: {"type":"tool-result","payload":{"toolCallId":"...","result":{}}}\n\n
data: [DONE]\n\n
```

**Additional deps:**
```
asyncpg==0.29.0
anthropic==0.40.0
sse-starlette==2.1.0
python-multipart==0.0.9
httpx==0.27.0
langfuse==2.7.0
```

**Notes table DDL (missing from schema.sql, add it):**
```sql
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    category TEXT,
    title TEXT,
    url TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notes_fts ON notes USING GIN(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));
```

**Remove:** All of `src/`, `package.json`, `tsconfig.json`, `.mastra/` (keep `frontend/` and `db/schema.sql`)

---

### 4. home (NEW, port 4114)

**Purpose:** Central dashboard — navigation hub, per-app health status, Celery Beat scheduler for future workflows.

**DB:** Uses shared `postgres` container, new database `home` with user `home`.

**Routes:**

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Aggregate health: polls /api/health on all 3 apps, returns status map |
| GET | /api/apps | Static registry of all apps (name, url, port, description) |

**Frontend:** React/Vite (same pattern as other apps). Shows:
- Grid of app cards with live health indicators
- App name, description, link
- System status summary

**Celery Beat:** Runs as a separate Docker service (`celery-beat`). Initially has one periodic task: `health_check` every 60s that writes results to Redis. Beat config lives in `apps/home/tasks.py`.

**Additional deps:**
```
asyncpg==0.29.0
celery[redis]==5.3.6
redis==5.0.0
httpx==0.27.0
```

---

## Docker Compose Changes

### New services to add

```yaml
redis:
  image: redis:7-alpine
  networks: [internal]

celery-worker:
  build: ./apps/home
  command: celery -A tasks worker --loglevel=info
  environment:
    - REDIS_URL=redis://redis:6379/0
  depends_on: [redis]
  networks: [internal]

celery-beat:
  build: ./apps/home
  command: celery -A tasks beat --loglevel=info
  environment:
    - REDIS_URL=redis://redis:6379/0
  depends_on: [redis, celery-worker]
  networks: [internal]

home:
  build: ./apps/home
  environment:
    - DATABASE_URL=postgresql://home:home@postgres/home
    - REDIS_URL=redis://redis:6379/0
  depends_on: [postgres, redis]
  networks: [internal]
```

### Modify existing services

Change `build` context for `daily-log`, `writing-app`, `jobsearch` to use the Python Dockerfile. Remove `node`-specific build args.

### Postgres init

Add to `postgres/init.sh`:
```bash
psql -U postgres -c "CREATE USER home WITH PASSWORD 'home';"
psql -U postgres -c "CREATE DATABASE home OWNER home;"
```

---

## Caddy Changes

Add one line:
```
home.dmytropetryshchuk.com {
  import auth
  reverse_proxy localhost:4114
}
```

---

## GitHub Actions Changes

Each app's build/push workflow stays the same structure — just the Dockerfile changes. No workflow file changes needed unless a job currently runs `npm install` at repo root (check per app).

---

## Testing Approach

Each app gets a `tests/` directory. Tests use `pytest` + `httpx.AsyncClient` with `ASGITransport`.

```python
import pytest
from httpx import AsyncClient, ASGITransport
from main import app

@pytest.mark.anyio
async def test_get_habits():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/api/habits")
    assert r.status_code == 200
```

**pytest.ini** (each app):
```ini
[pytest]
asyncio_mode = auto
```

---

## Migration Order

1. **daily-log** — simplest, isolated, no external deps
2. **writing-app** — no DB, filesystem only
3. **jobsearch** — most complex (agent, Langfuse, multipart)
4. **home** — new app, depends on all three being up

Each migration: delete Node.js files → write Python files → update Dockerfile → update docker-compose → test locally → commit.

---

## Out of Scope

- Alembic migrations (keep app-managed schema init for now)
- Shared Python package (inline per app, extract later)
- Authentication changes (Caddy basic_auth unchanged)
- Frontend changes (all React/Vite code untouched)
