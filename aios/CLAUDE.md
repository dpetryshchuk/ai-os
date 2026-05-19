# CLAUDE.md

Guidance for Claude Code when working in `aios/`.

## Commands

```bash
uvicorn main:app --reload --port 4116        # backend dev
cd frontend && npm run dev                   # frontend dev (:5173 → proxies /api → :4116)
cd frontend && npm run build                 # build → ../public/
pytest                                       # tests (from aios/)
celery -A tasks worker --loglevel=info       # background worker
celery -A tasks beat --loglevel=info         # scheduler
alembic upgrade head                         # jobsearch DB migrations
alembic -c alembic_daily.ini upgrade head    # daily_log DB migrations
```

SSH tunnel for local DB access: `ssh -L 5432:localhost:5432 dima@46.225.78.10`

## Architecture

```
Browser → Caddy (basicauth) → FastAPI :4116
                                ↕ asyncpg          ↕ asyncpg
                            jobsearch DB        daily_log DB
                                ↕ Celery (Redis broker)
                            celery-worker + celery-beat
```

**Two DBs, never merged.** Routes use asyncpg pools. Celery workers use a sync SQLAlchemy session (`SyncSession` in `db.py`) — different client, same DB.

**Event pattern:** UI trigger → `POST /api/jobsearch/trigger/{type}` → `os_events` row → `process_event.delay(id)` → worker runs handler → updates row status. Beat scheduler does the same on cron.

**Agent:** `agent.py` runs a LiteLLM tool-use loop over DeepSeek, streaming SSE events (`text-delta`, `tool-call`, `tool-result`, `[DONE]`). 8 CRM tools, all search-before-insert.

**API convention:** all responses `{"ok": true/false, ...fields}` — never bare arrays.

**Frontend:** all pages do `fetch('/api/...').then(d => d.data ?? [])`.

## File layout

| Path | What it does |
|---|---|
| `main.py` | FastAPI app + lifespan (opens/closes DB pools) + router mounts |
| `config.py` | All env vars with defaults |
| `db.py` | asyncpg pools + `SyncSession` for Celery |
| `events.py` | `create(pool, source, type, payload)` — inserts `os_events` row |
| `agent.py` | LiteLLM agentic loop + all 8 CRM tool implementations |
| `tasks.py` | Celery app + `process_event` + `run_scheduled` + beat schedule |
| `models.py` | SQLAlchemy `OsEvent` model (Celery only) |
| `routers/` | One file per feature area — see files for full route list |
| `workers/` | `health.py` + `scrapers/*.py` — each exports `run(payload, session)` |
| `alembic/` | jobsearch DB migrations |
| `alembic_daily/` | daily_log DB migrations |
| `frontend/src/pages/` | One folder per feature area |
| `frontend/src/Shell.tsx` | Sidebar nav — add links here for new pages |
| `frontend/src/main.tsx` | React Router routes |

## Database schemas

Managed by Alembic — source of truth is `alembic/versions/` and `alembic_daily/versions/`.

**jobsearch:** `companies`, `contacts`, `interactions`, `job_postings`, `content_posts`, `notes`, `os_events`
- Contact stages: `Outreached → Responded → Ongoing → Dead`

**daily_log:** `habit_types`, `entries`, `habit_logs`

## Deploy

Push to `master` → GitHub Actions:
- `aios/**` changes → builds Docker image → `docker compose pull aios && docker compose up -d aios celery-worker celery-beat`
- `docker-compose.yml` or `caddy/**` changes → `docker compose up -d --pull=never` + `sudo systemctl reload-or-restart caddy`

VPS: `46.225.78.10`, app at `/home/dima/ai-os/`. Caddy is a **systemd service**, not Docker.

**Migrations on VPS (fresh):**
```bash
docker compose exec aios alembic upgrade head
docker compose exec aios alembic -c alembic_daily.ini upgrade head
```
