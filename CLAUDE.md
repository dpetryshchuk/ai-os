# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace overview

Five apps in a monorepo, all deployed to the same Hetzner VPS (`46.225.78.10`, `dmytropetryshchuk.com`).

| App | Dir | Port | Domain |
|---|---|---|---|
| Job search CRM | `apps/jobsearch/` | 4111 | `jobsearch.dmytropetryshchuk.com` |
| Writing app | `apps/writing-app/` | 4112 | `write.dmytropetryshchuk.com` |
| Daily log | `apps/daily-log/` | 4113 | `log.dmytropetryshchuk.com` |
| Home dashboard | `apps/home/` | 4114 | `home.dmytropetryshchuk.com` |
| Freewrite | `apps/freewrite/` | 4115 | `freewrite.dmytropetryshchuk.com` |

Next available port: **4116**

See each app's own `CLAUDE.md` (e.g. `apps/jobsearch/CLAUDE.md`) for app-specific commands and architecture.

## Shared stack

All apps follow the same pattern:

- **Backend:** FastAPI (Python 3.12) + uvicorn, entry point `main.py`
- **Database:** asyncpg for Postgres-backed apps (jobsearch, daily-log); filesystem for writing-app and freewrite; no DB for home
- **Frontend:** React + Vite + Tailwind, built into `public/` at project root
- **Tests:** pytest + pytest-asyncio + httpx (`AsyncClient` with `ASGITransport`); run `pytest` from app dir
- **Deploy:** GitHub Actions builds Docker image → pushes to GHCR → `docker compose pull <app> && docker compose up -d <app>` on VPS

### Build pattern

```bash
# Backend dev
uvicorn main:app --reload --port <port>

# Frontend dev
cd frontend && npm run dev

# Tests
pytest

# Frontend build (CI / Docker)
cd frontend && npm run build   # outputs to ../public
```

### Python conventions

- Async routes use `asyncpg.Pool` injected via `Depends(get_pool)` (see `db.py` in each app)
- Sync routes (writing-app) run in FastAPI's thread pool — no `async def` needed
- `asyncio_mode = auto` in `pyproject.toml` so all pytest functions can be async
- Test fixtures override `app.dependency_overrides[get_pool]` with a mock pool

## VPS infrastructure

**Server:** Hetzner CX22 — `46.225.78.10` (`dmytropetryshchuk.com`). SSH: `ssh dima@46.225.78.10`.

**Reverse proxy:** Caddy (Docker) — `caddy/Caddyfile`. Named `(auth)` snippet handles `basic_auth` for all subdomains. Credentials stored in `caddy/auth_credentials` on the VPS (not in repo).

**Containers:** Docker Compose — `docker-compose.yml`. Services: 5 apps + caddy + postgres + redis + celery-worker + celery-beat. All on an internal bridge network; only Caddy publishes ports 80/443.

**Celery:** The `home` app runs Celery Beat (scheduler) + a worker for periodic health checks. Broker and result backend: Redis (`redis://redis:6379/0`).

**Full operations guide:** `docs/VPS-GUIDE.md` — server details, adding new apps, Caddy config, Docker Compose, GitHub Actions deploy, SSH key setup, DNS, port log, gotchas.

## Design language goal

The long-term goal is a shared design system across all frontends. Current state: each app has its own Tailwind config and component code. Candidates for extraction:
- Typography (Geist variable font in daily-log, not yet consistent across apps)
- Color tokens and spacing scale
- Common UI patterns (forms, modals, empty states)

When making UI changes, prefer patterns that can eventually be lifted into a shared package.
