# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace

One app (`aios/`) deployed to a Hetzner VPS.

| App | Dir | Port | Domain |
|---|---|---|---|
| AI OS (personal) | `aios/` | 4116 | `home.dmytropetryshchuk.com` |
| AI OS (business) | `aios/` | 4116 | `onekeyflow.com` |

Next available port: **4117**

## Commands

```bash
uvicorn main:app --reload --port 4116        # backend dev (from aios/)
cd aios/frontend && npm run dev              # frontend dev (:5173 → proxies /api → :4116)
cd aios/frontend && npm run build            # build → aios/public/
pytest                                       # tests (from aios/)
celery -A tasks worker --loglevel=info       # background worker
celery -A tasks beat --loglevel=info         # scheduler
alembic upgrade head                         # jobsearch DB migrations
alembic -c alembic_daily.ini upgrade head    # daily_log DB migrations
```

SSH tunnel for local DB access: `ssh -L 5432:localhost:5432 dima@46.225.78.10`

## Stack

- **Backend:** FastAPI (Python 3.12) + uvicorn, entry point `aios/main.py`
- **Databases:** Two Postgres 16 — `jobsearch` and `daily_log` (asyncpg async routes, psycopg2 Celery workers); SQLite via `aios/services/okf_db.py` for OKF data
- **Frontend:** React 19 + Vite + Tailwind + Geist + Instrument Serif, built into `aios/public/`
- **Workers:** Celery + Redis — scrapers and health checks as event-driven tasks
- **Migrations:** Alembic — `alembic/` jobsearch, `alembic_daily/` daily_log
- **Tests:** pytest + pytest-asyncio + httpx; run `pytest` from `aios/`
- **Deploy:** GitHub Actions → Docker image → GHCR → VPS via SSH

## Architecture

```
Browser → Caddy (basicauth) → FastAPI :4116
                                ↕ asyncpg          ↕ asyncpg
                            jobsearch DB        daily_log DB
                                ↕ SQLite (okf_db)
                                ↕ Celery (Redis broker)
                            celery-worker + celery-beat
```

**Two domains, one container.** `IS_OKF = hostname.includes('onekeyflow')` in the frontend applies `dark` class and different nav.

**Event pattern:** UI trigger → `POST /api/jobsearch/trigger/{type}` → `os_events` row → `process_event.delay(id)` → worker runs handler.

**Agent (Ima):** `aios/agent.py` — LiteLLM tool-use loop over DeepSeek, streaming SSE. Tools cover CRM, outreach, knowledge, shell execution, self-editing, memory.

## File layout

| Path | What it does |
|---|---|
| `aios/main.py` | FastAPI app + lifespan (pools, LiteLLM config) + router mounts |
| `aios/config.py` | All env vars with defaults |
| `aios/db.py` | asyncpg pools + `SyncSession` for Celery |
| `aios/agent.py` | Ima agentic loop + all tool implementations |
| `aios/tasks.py` | Celery app + `process_event` + beat schedule + proposal generation |
| `aios/services/` | `okf_db.py` (SQLite), `pandadoc.py`, `chat_sessions.py` |
| `aios/routers/` | One file per feature area |
| `aios/workers/` | `health.py` + `scrapers/*.py` |
| `aios/prompts/` | `ima.md` (system prompt), `skills/` (Ima skill files) |
| `aios/frontend/src/Shell.tsx` | App shell — sidebar nav, Ima top bar + drawer |
| `aios/frontend/src/App.tsx` | React Router routes |

## VPS infrastructure

**Server:** Hetzner CX22 — `46.225.78.10`. SSH: `ssh dima@46.225.78.10`.

**Reverse proxy:** Caddy — host-level systemd service. Config: `caddy/Caddyfile`. Reload: `sudo systemctl reload-or-restart caddy`.

**Docker Compose** runs: `aios`, `celery-worker`, `celery-beat`, `postgres`, `redis`. Internal bridge network. Volume: `${WRITING_DIR}:/repo` mounts the live repo into the container for Ima's self-editing.

## CI/CD

Two GitHub Actions jobs in `.github/workflows/deploy.yml`:

- **`deploy-app`**: `aios/**` changes → builds Docker image → pushes to GHCR → SSH deploy to VPS (`docker compose pull aios && docker compose up -d aios celery-worker celery-beat`)
- **`deploy-infra`**: `docker-compose.yml` or `caddy/**` changes → `docker compose up -d` + reload caddy

## Git remotes

- `origin` → `dpetryshchuk/ai-os` (public portfolio snapshot)
- `private` → `dpetryshchuk/aios-private` (working copy, used by VPS)

Always push to both: `git push private master && git push origin master`

## Database schemas

**jobsearch:** `companies`, `contacts`, `interactions`, `job_postings`, `content_posts`, `notes`, `os_events`
- Contact stages: `Outreached → Responded → Ongoing → Dead`

**daily_log:** `habit_types`, `entries`, `habit_logs`

**okf.db (SQLite):** `monthly_pl`, `events`, `outreach_contacts`, `outreach_sessions`

**sessions.db (SQLite):** `chat_sessions` — Ima conversation history, cross-domain persistence
