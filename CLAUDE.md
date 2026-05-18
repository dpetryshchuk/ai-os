# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace overview

One app (`aios/`) deployed to a Hetzner VPS.

| App | Dir | Port | Domain |
|---|---|---|---|
| AI OS | `aios/` | 4116 | `home.dmytropetryshchuk.com` |

Next available port: **4117**

See `aios/CLAUDE.md` for commands, architecture, and full API reference.

## Stack

- **Backend:** FastAPI (Python 3.12) + uvicorn, entry point `aios/main.py`
- **Databases:** Two Postgres 16 databases — `jobsearch` and `daily_log` — accessed via asyncpg (async routes) and psycopg2 (Celery workers)
- **Frontend:** React 19 + Vite + Tailwind, built into `aios/public/` and served by FastAPI
- **Workers:** Celery + Redis — scrapers and health checks run as event-driven tasks
- **Migrations:** Alembic — `alembic/` for jobsearch DB, `alembic_daily/` for daily_log DB
- **Tests:** pytest + pytest-asyncio + httpx; run `pytest` from `aios/`
- **Deploy:** GitHub Actions → Docker image → GHCR → VPS via SSH

## VPS infrastructure

**Server:** Hetzner CX22 — `46.225.78.10`. SSH: `ssh dima@46.225.78.10`.

**Reverse proxy:** Caddy — host-level systemd service (`caddy.service`). Config: `caddy/Caddyfile`. Reload: `sudo systemctl reload-or-restart caddy`. Credentials: `caddy/auth_credentials` on VPS (not in repo).

**Docker Compose** (`docker-compose.yml`) runs: `aios`, `celery-worker`, `celery-beat`, `postgres`, `redis`. All on an internal bridge network — only ports exposed to the host are the app ports bound to 127.0.0.1.

**Postgres init:** `postgres/init.sh` creates the `jobsearch` and `daily_log` databases on first boot.

## CI/CD

Two GitHub Actions jobs in `.github/workflows/deploy.yml`:

- **`deploy-app`**: triggers on `aios/**` changes → builds Docker image → pushes to `ghcr.io/dpetryshchuk/ai-os/aios:latest` → deploys to VPS
- **`deploy-infra`**: triggers on `docker-compose.yml` or `caddy/**` changes → restarts postgres/redis, reloads caddy
