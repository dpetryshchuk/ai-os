# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
uvicorn main:app --reload --port 4113   # dev server (hot reload)
pytest                                   # run tests
pytest -v                               # verbose test output

cd frontend && npm run dev              # Vite dev server for frontend only
```

Tests use a mock asyncpg pool via `app.dependency_overrides[get_pool]` — no real database needed.

## Architecture

```
Browser → Caddy (log.dmytropetryshchuk.com)
              → reverse_proxy localhost:4113
                    → FastAPI (uvicorn main:app)
                          ↕ asyncpg
                        Postgres
```

**No build-time data fetching.** FastAPI serves the React SPA from `public/` and exposes the API.

### Backend (`main.py` + `db.py`)

| File | Responsibility |
|---|---|
| `main.py` | Route definitions, lifespan (pool init/close), static file serving |
| `db.py` | Singleton `asyncpg.Pool` — `init_pool()`, `close_pool()`, `get_pool()` FastAPI dependency |

All routes accept the pool via `Depends(get_pool)` for test injection.

### Database (Postgres)

Schema in `schema.sql`. Three tables:

- `entries` — one row per date, text fields `did_today` / `doing_tomorrow`
- `habit_types` — named habit definitions with `kind: 'boolean' | 'number'`
- `habit_logs` — (habit_type_id, date) composite PK, `value` stored as jsonb

`DATABASE_URL` in `.env` (local) or Docker Compose `environment` on VPS.

### API

| Method | Path | What |
|---|---|---|
| `GET` | `/api/day/:date` | Entry + habit logs for a date (YYYY-MM-DD) |
| `PUT` | `/api/day/:date` | Upsert entry text and/or habit log values |
| `GET` | `/api/calendar/:year/:month` | All days in month with entry/habit summary |
| `GET` | `/api/archive` | All dates with entries or habit logs, descending |
| `GET` | `/api/habits` | All habit type definitions |
| `POST` | `/api/habits` | Create a habit type |
| `PATCH` | `/api/habits/:id` | Update name or active status |
| `GET` | `/api/health` | `{"ok": true}` |

### Frontend (`frontend/`)

React + Vite + Tailwind. Built output goes to `public/` at project root (`outDir: '../public'` in `vite.config.ts`). Uses Geist variable font. SPA with client-side routing — FastAPI serves `index.html` for all non-API GET requests.

## Deploy

Push to `master` → GitHub Actions builds Docker image → pushes to GHCR → SSHs into VPS → `docker compose pull daily-log && docker compose up -d daily-log`.

VPS path: `/home/dima/ai-os/` (monorepo, Docker Compose stack).
Image: `ghcr.io/dpetryshchuk/ai-os/daily-log:latest`

Full VPS ops guide: `../docs/VPS-GUIDE.md`.
