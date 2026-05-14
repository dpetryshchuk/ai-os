# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace overview

Three apps in a monorepo, all deployed to the same Hetzner VPS (`46.225.78.10`, `dmytropetryshchuk.com`).

| App | Dir | Port | Domain |
|---|---|---|---|
| Job search CRM | `apps/jobsearch/` | 4111 | `jobsearch.dmytropetryshchuk.com` |
| Writing app | `apps/writing-app/` | 4112 | `write.dmytropetryshchuk.com` |
| Daily log | `apps/daily-log/` | 4113 | `log.dmytropetryshchuk.com` |

Next available port: **4114**

See each app's own `CLAUDE.md` (e.g. `apps/jobsearch/CLAUDE.md`) for app-specific commands and architecture.

## Shared stack

All three apps follow the same pattern:

- **Backend:** Express + TypeScript, compiled to `dist/server.js` via `tsc` (jobsearch uses Mastra → `.mastra/output/index.mjs`)
- **Frontend:** React + Vite + Tailwind, built into `public/` at project root
- **Tests:** Vitest (`npm test`)
- **Deploy:** GitHub Actions builds Docker image → pushes to GHCR → `docker compose pull <app> && docker compose up -d <app>` on VPS

### Build pattern

```bash
npm run build        # tsc + cd frontend && npm run build (copies dist → ../public)
npm run dev          # ts-node-dev or tsx watch (backend only, port varies per app)
npm test             # vitest run
```

### Compiled path gotcha

`__dirname` in compiled TypeScript points to `dist/`, not the project root. Static files at `public/` are always referenced as `path.join(__dirname, '..', 'public')`.

## VPS infrastructure

**Server:** Hetzner CX22 — `46.225.78.10` (`dmytropetryshchuk.com`). SSH: `ssh dima@46.225.78.10`.

**Reverse proxy:** Caddy (Docker) — `caddy/Caddyfile`. Named `(auth)` snippet handles `basic_auth` for all subdomains.

**Containers:** Docker Compose — `docker-compose.yml`. One service per app plus `caddy` and `postgres`. All on an internal bridge network; only Caddy publishes ports 80/443.

**Full operations guide:** `docs/VPS-GUIDE.md` — server details, adding new apps, Caddy config, Docker Compose, GitHub Actions deploy, SSH key setup, DNS, port log, gotchas.

## Design language goal

The long-term goal is a shared design system across all three frontends. Current state: each app has its own Tailwind config and component code. Candidates for extraction:
- Typography (Geist variable font in daily-log, not yet consistent across apps)
- Color tokens and spacing scale
- Common UI patterns (forms, modals, empty states)

When making UI changes, prefer patterns that can eventually be lifted into a shared package.
