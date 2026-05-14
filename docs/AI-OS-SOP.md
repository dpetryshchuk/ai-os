# AI OS — Standard Operating Procedure

A personal/client operating system of self-hosted AI apps. One VPS, one repo, N apps.

---

## Infrastructure

| Layer | Choice | Why |
|---|---|---|
| VPS | Hetzner CX22 (~€4/mo) | Cheap, fast, bare metal |
| Containers | Docker Compose | One file, reproducible everywhere |
| Reverse proxy | Caddy | Auto-HTTPS, zero config |
| Registry | GHCR (free) | Tied to GitHub, no extra auth |
| CI/CD | GitHub Actions | Path-filtered per app, push to deploy |

All apps share one VPS, one Caddy instance, one Postgres container.

---

## Repo Structure

```
ai-os/
├── apps/
│   └── <app-name>/          # one dir per app
│       ├── Dockerfile
│       ├── server.ts         # Express or Mastra entry
│       ├── frontend/         # Vite + React
│       └── CLAUDE.md
├── packages/
│   └── ui/
│       ├── src/tokens.css    # HSL design tokens (light mode)
│       └── tailwind.config.base.mjs
├── caddy/Caddyfile
├── postgres/init.sh
├── docker-compose.yml
├── .env.example
└── .github/workflows/deploy.yml
```

---

## App Anatomy

**Backend:** Express + TypeScript → `dist/server.js`  
**Frontend:** Vite + React + Tailwind → `public/` (served by the backend)  
**AI backend:** Mastra (Hono-based) → `.mastra/output/index.mjs` when agent-first  
**Database:** Postgres (shared container, per-app user + database)

New apps use **Next.js** instead of Vite + Express (simpler, same Docker pattern).

---

## Deploy Pattern

1. Push to `master`
2. GitHub Actions detects which `apps/<name>/**` changed
3. Builds Docker image → pushes to `ghcr.io/<owner>/ai-os/<app>:latest`
4. SSHs into VPS → `docker compose pull <app> && docker compose up -d <app>`

Caddy and Postgres only redeploy when `caddy/**` or `docker-compose.yml` change.

---

## Security

- Caddy `basicauth` on every subdomain (single shared password)
- VPS firewall: only ports 80 and 443 open (`ufw`)
- Postgres never exposed to host — internal Docker network only
- Local DB access via SSH tunnel: `ssh -L 5432:localhost:5432 user@host`
- No secrets in repo — `.env` on VPS only, `.env.example` committed

---

## Observability

- **Langfuse** — LLM trace logging (per-agent, drill into prompt steps)
- **Sentry** — runtime error alerting (add to each app's server entry point)

---

## Starting a New App

1. `mkdir apps/<name>` — scaffold Express/TS or Next.js
2. Add `Dockerfile` (copy from an existing app, swap port and entry point)
3. Add service block to `docker-compose.yml` (next available port from `CLAUDE.md`)
4. Add subdomain block to `caddy/Caddyfile`
5. Add `apps/<name>/**` path filter to `.github/workflows/deploy.yml`
6. Add database user to `postgres/init.sh` if needed
7. Update `CLAUDE.md` — increment the port log
8. Push → GitHub Actions builds and deploys

---

## Context: When to Add Supabase

Self-hosted Postgres is the default. Switch to **Supabase** for client projects that need:
- Auth (social login, magic links)
- Realtime subscriptions
- Public API access without a custom backend

Keep Supabase out of personal apps — it adds a paid dependency and a third-party trust boundary.
