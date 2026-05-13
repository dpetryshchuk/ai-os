# Docker Compose Migration Design

**Date:** 2026-05-13
**Status:** Approved

## Goal

Migrate the ai-os monorepo from a systemd + host-Node.js + host-Caddy setup to a fully containerised Docker Compose stack. Every service — Caddy, Postgres, and all three apps — runs inside Docker. The result is a portable, stampable template for future AI app projects and client deployments.

## Architecture

```
Internet :80/:443
     ↓
  [caddy]          ← only container exposed to the outside
     ├──▶ writing-app:4112
     ├──▶ daily-log:4113
     └──▶ jobsearch:4111
               ↓
          [postgres:5432]   ← internal only, never exposed to host
```

Five containers on one internal Docker network: `caddy`, `writing-app`, `daily-log`, `jobsearch`, `postgres`.

## File Structure

```
ai-os/
├── docker-compose.yml          # defines all five services
├── caddy/
│   └── Caddyfile               # routes subdomains → containers, handles HTTPS
├── .env.example                # committed template; .env is never committed
├── apps/
│   ├── writing-app/
│   │   └── Dockerfile          # multi-stage: build → run
│   ├── daily-log-vps/
│   │   └── Dockerfile          # multi-stage: build → run
│   └── jobsearch-vps/
│       └── Dockerfile          # multi-stage: mastra build → run
└── .github/workflows/
    └── deploy.yml              # replaces the 3 existing per-app workflows
```

## Dockerfiles

All app Dockerfiles use a two-stage build to keep production images small:

- **Stage 1 (builder):** `node:20-alpine`, installs all deps, runs `npm run build` (tsc + Vite for writing-app and daily-log; `npx mastra build` for jobsearch)
- **Stage 2 (runner):** `node:20-alpine`, copies only compiled output and installs prod deps only (`npm ci --omit=dev`)
  - `writing-app` and `daily-log`: copies `dist/` + `public/`, runs `node dist/server.js`
  - `jobsearch`: copies `.mastra/output/` + `public/`, runs `node .mastra/output/index.mjs`

**jobsearch static files:** Mastra will serve the React frontend via a static file middleware added to `src/mastra/index.ts` (catch-all after all API routes). This makes the container fully self-contained — Caddy reverse-proxies all traffic to `:4111`.

## docker-compose.yml (outline)

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data          # persists Let's Encrypt certs

  writing-app:
    image: ghcr.io/dpetryshchuk/ai-os/writing-app:latest
    expose: ["4112"]

  daily-log:
    image: ghcr.io/dpetryshchuk/ai-os/daily-log:latest
    expose: ["4113"]
    depends_on: [postgres]

  jobsearch:
    image: ghcr.io/dpetryshchuk/ai-os/jobsearch:latest
    expose: ["4111"]
    depends_on: [postgres]
    volumes:
      - jobsearch_uploads:/app/uploads

  postgres:
    image: postgres:16-alpine
    expose: ["5432"]
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}

volumes:
  caddy_data:
  postgres_data:
  jobsearch_uploads:
```

## Caddyfile (outline)

```caddy
jobsearch.dmytropetryshchuk.com {
  basic_auth { dima {$CADDY_BASIC_AUTH_HASH} }
  reverse_proxy jobsearch:4111
}

write.dmytropetryshchuk.com {
  basic_auth { dima {$CADDY_BASIC_AUTH_HASH} }
  reverse_proxy writing-app:4112
}

log.dmytropetryshchuk.com {
  basic_auth { dima {$CADDY_BASIC_AUTH_HASH} }
  reverse_proxy daily-log:4113
}
```

Caddy resolves container names via the internal Docker network. HTTPS is handled automatically via Let's Encrypt.

## Environment Variables

`.env.example` at the repo root (committed). `.env` is never committed.

```
POSTGRES_PASSWORD=
CADDY_BASIC_AUTH_HASH=    # bcrypt hash, generated with: caddy hash-password
DEEPSEEK_API_KEY=         # used by jobsearch Mastra agent
```

For a new client project: clone repo → copy `.env.example` to `.env` → fill in values → `docker compose up -d`.

## GitHub Actions Deploy

The three existing per-app workflows are replaced by a single `deploy.yml` that remains path-filtered — only the changed app's image is rebuilt and redeployed.

**Per-app job (example for writing-app):**
1. Checkout code
2. Log in to ghcr.io (`GITHUB_TOKEN`)
3. Build and push image: `ghcr.io/dpetryshchuk/ai-os/writing-app:latest`
4. SSH into VPS
5. `docker compose pull writing-app`
6. `docker compose up -d writing-app`

Caddy and Postgres jobs trigger only when `caddy/Caddyfile` or `docker-compose.yml` changes.

## Image Registry

**GitHub Container Registry (ghcr.io)** — free, no separate account, integrated with GitHub Actions via `GITHUB_TOKEN`. No additional secrets needed for authentication.

Image naming: `ghcr.io/dpetryshchuk/ai-os/<service-name>:latest`

## What Is Not Changing

- App source code (Express + TypeScript + Vite stays as-is)
- Postgres database contents (migrated via `pg_dump` / `pg_restore`)
- Domain names and Caddy routing rules
- Basic auth credentials (same bcrypt hash, just moved into `.env`)

Future apps and client projects will use Next.js rather than Vite + Express. This Docker pattern is compatible with both — no infra changes needed when that switch happens.

## VPS Migration Steps (high-level)

1. Install Docker + Docker Compose plugin on VPS
2. Set up `.env` on VPS with real credentials
3. Confirm `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` secrets exist in GitHub repo settings (already present); `GITHUB_TOKEN` for ghcr.io push is automatic — no extra secret needed
4. First deploy: `docker compose up -d` (all services cold start)
5. Stop old systemd services: `sudo systemctl stop writing daily-log jobsearch`
6. Disable old systemd services
7. Verify all apps accessible via their domains
8. Remove old Node.js / Caddy host config (after confirming everything works)
