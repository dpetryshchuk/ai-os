# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
uvicorn main:app --reload --port 4114   # dev server (hot reload)
pytest                                   # run tests
pytest -v                               # verbose test output

cd frontend && npm run dev              # Vite dev server for frontend only

# Celery (requires Redis running)
celery -A tasks worker --loglevel=info   # start worker
celery -A tasks beat --loglevel=info     # start scheduler
```

## Architecture

```
Browser → Caddy (home.dmytropetryshchuk.com)
              → reverse_proxy localhost:4114
                    → FastAPI (uvicorn main:app)

Redis ← Celery Beat (60s schedule)
      ← Celery Worker → httpx.get each app's /api/health
```

**No database.** The home app polls other services over the internal Docker network.

### Backend (`main.py` + `tasks.py`)

| File | Responsibility |
|---|---|
| `main.py` | FastAPI routes: health, app registry, live system-health check |
| `tasks.py` | Celery app + Beat schedule: `check_app_health` task every 60 seconds |

### API

| Method | Path | What |
|---|---|---|
| `GET` | `/api/health` | `{"ok": true}` |
| `GET` | `/api/apps` | Static registry of all apps (name, url, description) |
| `GET` | `/api/system-health` | Live parallel health check of all apps via httpx |

`/api/system-health` pings each app's `/api/health` endpoint concurrently (3s timeout) and returns `{"ok": true, "apps": {"Job Search": "ok", ...}}`.

Internal URLs come from env vars `JOBSEARCH_URL`, `WRITING_APP_URL`, `DAILY_LOG_URL` (default to Docker service names).

### Celery

`tasks.py` defines a Celery app pointing at Redis (`REDIS_URL` env var, defaults to `redis://redis:6379/0`). The Beat schedule runs `check_app_health` every 60 seconds. The task does synchronous `httpx.get()` calls to all app health endpoints.

In Docker Compose, three services share the same image:
- `home` — runs FastAPI (uvicorn)
- `celery-worker` — `celery -A tasks worker`
- `celery-beat` — `celery -A tasks beat`

### Frontend (`frontend/`)

React + Vite + Tailwind. Shows a dashboard card for each app with live status dots (green = ok, red = error, gray = loading). Built output goes to `public/` at project root. Served by FastAPI.

## Deploy

Push to `master` → GitHub Actions builds Docker image → pushes to GHCR → SSHs into VPS → `docker compose pull home && docker compose up -d home`.

Deploying `home` also restarts `celery-worker` and `celery-beat` if their image has changed (they share the same image tag).

VPS path: `/home/dima/ai-os/` (monorepo, Docker Compose stack).
Image: `ghcr.io/dpetryshchuk/ai-os/home:latest`

Full VPS ops guide: `../docs/VPS-GUIDE.md`.
