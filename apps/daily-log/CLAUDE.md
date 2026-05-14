# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # ts-node-dev on server.ts (port 4113)
npm run build        # tsc → dist/, then frontend build → public/
npm test             # vitest run (requires DATABASE_URL or falls back to daily_log_test)
npm run test:watch   # vitest in watch mode

cd frontend && npm run dev   # Vite dev server for frontend only
```

Tests hit a real Postgres database (`daily_log_test` by default). The pool is shared via `src/db.ts` — tests pass an optional `pool` param to avoid global state leaks.

## Architecture

```
Browser → Caddy (log.dmytropetryshchuk.com)
              → reverse_proxy localhost:4113
                    → Express (dist/server.js)
                          ↕ pg
                        Postgres
```

**No build-time data fetching.** The Express server is the only backend — it serves the React SPA from `public/` and exposes the API.

### Backend (`server.ts` + `src/`)

| File | Responsibility |
|---|---|
| `server.ts` | Route definitions + static file serving |
| `src/db.ts` | Singleton `Pool` (lazy init from `DATABASE_URL`) |
| `src/entries.ts` | `entries` table — daily journal text |
| `src/habits.ts` | `habit_types` + `habit_logs` tables |
| `src/calendar.ts` | Calendar view aggregation query |

All module functions accept an optional `pool` parameter for test injection.

### Database (Postgres)

Schema in `schema.sql`. Three tables:

- `entries` — one row per date, text fields `did_today` / `doing_tomorrow`
- `habit_types` — named habit definitions with `kind: 'boolean' | 'number'`
- `habit_logs` — (habit_type_id, date) composite PK, `value` stored as jsonb

`DATABASE_URL` in `.env` (local) or `EnvironmentFile` on VPS.

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

### Frontend (`frontend/`)

React + Vite + Tailwind. Built output is copied to `public/` at project root by the `build` script. Uses Geist variable font (`@fontsource-variable/geist`). SPA with client-side routing — server catches all `GET *` and returns `index.html`.

## Deploy

Push to `master` → GitHub Actions builds Docker image → pushes to GHCR → SSHs into VPS → `docker compose pull daily-log && docker compose up -d daily-log`.

VPS path: `/home/dima/ai-os/` (monorepo, Docker Compose stack).
Image: `ghcr.io/dpetryshchuk/ai-os/daily-log:latest`

Full VPS ops guide: `../docs/VPS-GUIDE.md`.
