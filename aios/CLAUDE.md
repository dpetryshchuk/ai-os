# CLAUDE.md

This file provides guidance to Claude Code when working in `aios/`.

## Commands

```bash
# Backend dev
uvicorn main:app --reload --port 4116

# Frontend dev
cd frontend && npm run dev          # dev server on :5173, proxies /api → :4116

# Tests
pytest                              # from aios/
pytest -v -k test_name             # specific test

# Frontend build
cd frontend && npm run build        # outputs to ../public

# Celery worker (separate terminal)
celery -A tasks worker --loglevel=info

# Celery beat scheduler (separate terminal)
celery -A tasks beat --loglevel=info

# Alembic migrations (against JOBSEARCH_DATABASE_URL)
alembic upgrade head
alembic revision --autogenerate -m "description"
```

Local DB queries require an SSH tunnel: `ssh -L 5432:localhost:5432 dima@46.225.78.10`

## Architecture

```
Browser → Caddy (home.dmytropetryshchuk.com, basicauth)
              → reverse_proxy localhost:4116 (flush_interval -1 for SSE)
                    → FastAPI (uvicorn main:app)
                          ↕ asyncpg        ↕ asyncpg
                      jobsearch DB      daily_log DB
                          ↕ Celery tasks
                        Redis ← celery-worker + celery-beat
```

**Two separate Postgres databases**: `JOBSEARCH_DATABASE_URL` and `DAILY_LOG_DATABASE_URL`. They are never merged — this avoids a risky migration and keeps existing data intact.

**Event-driven workers**: Every task (scraper, health check) runs via `os_events` → Celery. UI triggers go through `POST /api/jobsearch/trigger/{task_type}` → `events.create()` → `process_event.delay(event_id)`.

## File layout

| File / Dir | Responsibility |
|---|---|
| `main.py` | FastAPI app, lifespan (open/close pools), router mounts |
| `config.py` | Pydantic settings — env vars with defaults |
| `db.py` | Two asyncpg pools (`jobsearch`, `daily_log`); `SyncSession` for Celery |
| `models.py` | SQLAlchemy `OsEvent` model (for Celery's sync ORM access) |
| `events.py` | `async create(pool, source, type, payload)` — inserts into `os_events` |
| `agent.py` | LiteLLM + tool-use loop; `agentic_stream()` async generator → SSE |
| `tasks.py` | Celery app + `process_event` + `run_scheduled` + beat schedule |
| `routers/jobsearch.py` | All `/api/jobsearch/*` endpoints |
| `routers/writing.py` | All `/api/writing/*` endpoints (essays + freewrite) |
| `routers/daily_log.py` | All `/api/daily-log/*` endpoints |
| `routers/home.py` | `/api/home/health-checks` endpoint |
| `routers/webhooks.py` | `/webhooks/*` (future) |
| `workers/health.py` | `run(payload, session)` — pings all app health endpoints |
| `workers/scrapers/*.py` | `run(payload, session)` — YC, HN, RemoteOK, Simplify |
| `alembic/` | Alembic env + migration for `os_events` table |
| `tests/` | pytest test suite |
| `frontend/` | React 19 + Vite + Tailwind SPA |

## API routes

All responses: `{"ok": True, ...data}` or `{"ok": False, "error": "..."}`.

### JobSearch (`/api/jobsearch/`)

| Method | Path | Description |
|---|---|---|
| POST | `/agents/stream` | SSE streaming agent (LiteLLM + DeepSeek, 8 CRM tools) |
| GET | `/pipeline` | Contacts with company + last_contact, ordered by stage |
| GET | `/retro` | `weekly`, `daily`, `by_source`, `needs_action`, `stats` |
| GET | `/leads` | `job_postings` where `status = 'new'` |
| GET | `/applications` | `job_postings` where `status = 'applied'`, includes `resume_path` |
| GET | `/notes[?q=]` | Notes; `?q=` does full-text search via `plainto_tsquery` |
| POST | `/notes` | Create note (`category`, `title`, `url`, `content`) |
| PATCH | `/notes/:id` | Update note |
| DELETE | `/notes/:id` | Delete note |
| POST | `/resumes` | Upload PDF — stored in `UPLOADS_DIR` |
| GET | `/content` | Content posts ordered by date |
| GET | `/events` | Recent `os_events` (default limit 50) |
| POST | `/trigger/:task_type` | Trigger task — `scrape.yc`, `scrape.hn`, `scrape.remoteok`, `scrape.simplify`, `health.check` |

### Writing (`/api/writing/`)

Essays live in `{WRITING_DIR}/content/essays/{folder}/{slug}.md` (YAML frontmatter + markdown body).

| Method | Path | Description |
|---|---|---|
| GET | `/essays` | List all essays (frontmatter metadata only) |
| GET | `/essays/:folder/:slug` | Full essay (frontmatter + body) |
| POST | `/essays` | Create — `{title, folder}` required |
| PATCH | `/essays/:folder/:slug` | Update frontmatter + body |
| DELETE | `/essays/:folder/:slug` | Delete file |
| GET | `/folders` | List folders |
| POST | `/folders` | Create folder |
| DELETE | `/folders/:name` | Delete empty folder |
| POST | `/essays/:folder/:slug/move` | Move to different folder |
| POST | `/git/pull` | `git pull` in writing repo |
| POST | `/git/push` | Commit + push with message |
| GET | `/freewrite/entries` | List freewrite entries (newest first) |
| GET | `/freewrite/entries/:id` | Get full entry |
| POST | `/freewrite/entries` | Create entry (`{title?}`) |
| PATCH | `/freewrite/entries/:id` | Update entry (`{title?, body?}`) |
| DELETE | `/freewrite/entries/:id` | Delete entry |

### Daily Log (`/api/daily-log/`)

Uses `daily_log` Postgres DB.

| Method | Path | Description |
|---|---|---|
| GET | `/day/:date` | Entry + habit logs for a date (ISO format `YYYY-MM-DD`) |
| PUT | `/day/:date` | Upsert `did_today`, `doing_tomorrow`, habits map |
| GET | `/calendar/:year/:month` | Days with entry/habit presence for calendar view |
| GET | `/archive` | All days with full content |
| GET | `/habits` | List habit types |
| POST | `/habits` | Create habit (`name`, `kind: boolean\|number`) |
| PATCH | `/habits/:id` | Update habit (name, active) |

### Home (`/api/home/`)

| Method | Path | Description |
|---|---|---|
| GET | `/health-checks` | Recent health check results from `os_events` |

## Agent (jobsearch)

`agent.py` uses LiteLLM to call DeepSeek (`deepseek/deepseek-chat`). The agentic loop runs tools until no more tool calls, then yields SSE events:

- `data: {"type": "text-delta", "text": "..."}` — streamed text
- `data: {"type": "tool-call", "name": "...", "input": {...}}` — tool invoked
- `data: {"type": "tool-result", "name": "...", "result": "..."}` — tool result
- `data: [DONE]` — stream finished

**8 CRM tools:** `upsert_company`, `upsert_contact`, `upsert_job_posting`, `update_stage`, `log_interaction`, `log_content_post`, `search_notes`, `query_db`

Rule: always call `upsert_company` first — every tool searches before inserting.

## Celery tasks

Two task types, dispatched via event ID:

- `events.process` — picks up `os_events` row, runs handler, updates status
- `events.run_scheduled` — creates `os_events` row then calls `process_event.delay()`

Beat schedule (UTC):
- 08:00 → `scrape.yc`
- 08:05 → `scrape.hn`
- 14:00 → `scrape.remoteok`
- 14:05 → `scrape.simplify`
- every 60s → `health.check`

## Database schemas

### jobsearch DB (`JOBSEARCH_DATABASE_URL`)

Schema in `apps/jobsearch/db/schema.sql`. Key tables:

```
companies       id (hex16), name, website
contacts        id, name, company_id, role, source, stage, notes
                stage: Outreached → Responded → Ongoing → Dead
interactions    id, contact_id, date, direction (out/in), notes
job_postings    id, company_id, title, link, source, status (new/applied/dropped), resume_path
content_posts   id, posted_date, content, impressions, engagements, comments
notes           id, category, title, url, content, created_at
os_events       id, source, type, status, payload, error, created_at, started_at, completed_at
```

The `os_events` table is created by Alembic: `alembic/versions/0001_create_os_events.py`.

### daily_log DB (`DAILY_LOG_DATABASE_URL`)

```
habit_types   id (serial), name, kind (boolean|number), active, created_at
entries       date (PK), did_today, doing_tomorrow, updated_at
habit_logs    habit_type_id + date (PK), value (jsonb)
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `JOBSEARCH_DATABASE_URL` | `postgresql://...` | Jobsearch Postgres DB |
| `DAILY_LOG_DATABASE_URL` | `postgresql://...` | Daily log Postgres DB |
| `REDIS_URL` | `redis://redis:6379/0` | Celery broker + backend |
| `DEEPSEEK_API_KEY` | `""` | DeepSeek API key (LiteLLM) |
| `LANGFUSE_PUBLIC_KEY` | `""` | Optional LLM observability |
| `LANGFUSE_SECRET_KEY` | `""` | Optional LLM observability |
| `UPLOADS_DIR` | `/app/uploads` | Resume upload storage |
| `WRITING_DIR` | `/repo` | Git repo for essays |
| `FREEWRITE_DIR` | `/freewrite` | Directory for freewrite entries |
| `GITHUB_TOKEN` | `""` | For git push from writing app |
| `GITHUB_REPO` | `""` | `owner/repo` for writing git push |

## Frontend (`frontend/`)

React 19 + Vite + Tailwind + shadcn/ui components. Built output → `../public/` (served by FastAPI).

Routes (React Router v7):
- `/` → Home
- `/events` → OS events log
- `/jobsearch/chat` → Agent chat (SSE streaming)
- `/jobsearch/pipeline` → Contacts pipeline
- `/jobsearch/leads` → New job leads
- `/jobsearch/applications` → Applied jobs
- `/jobsearch/notes` → Notes with search + AI ask
- `/jobsearch/retro` → Weekly/daily activity retro
- `/writing/essays` → Essay editor (CodeMirror 6 + markdown)
- `/writing/freewrite` → Freewrite journal
- `/daily-log` → Daily log calendar + day editor

Shell.tsx: persistent sidebar with section headers and nav links. Handles layout only — each page is self-contained.

All pages use the pattern: `fetch('/api/...')` → `.then(d => d.data ?? [])` (responses are `{ok: true, ...fields}`, not direct arrays).

## Deploy

Push to `master` → GitHub Actions detects `aios/**` changes → builds Docker image → pushes to `ghcr.io/dpetryshchuk/ai-os/aios:latest` → SSH to VPS → `docker compose pull aios && docker compose up -d aios && docker compose up -d celery-worker celery-beat`.

VPS path: `/home/dima/ai-os/` — `docker-compose.yml` at root.

Full ops guide: `docs/VPS-GUIDE.md`

### First deploy checklist

1. Add DNS A record `home.dmytropetryshchuk.com → 46.225.78.10`
2. Run Alembic migration on VPS to create `os_events` table:
   ```bash
   ssh dima@46.225.78.10
   cd ai-os
   docker compose exec aios alembic upgrade head
   ```
3. Verify `caddy/auth_credentials` exists on VPS (shared with other apps)
