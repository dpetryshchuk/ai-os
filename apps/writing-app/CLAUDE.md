# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # tsx watch server.ts (port 4112)
npm run build        # tsc → dist/, then cd frontend && npm install && npm run build
npm test             # vitest run

cd frontend && npm run dev   # Vite dev server for frontend only
```

Tests are in `tests/` and use Vitest. `git.ts` functions accept injectable `exec` params for testing without hitting real git.

## Architecture

```
Browser → Caddy (write.dmytropetryshchuk.com)
              → reverse_proxy localhost:4112
                    → Express (dist/server.js)
                          ├── reads/writes markdown files (CONTENT_DIR)
                          └── git push/pull (REPO_DIR)
```

The server bridges two filesystems: `CONTENT_DIR` (where essays live) and `REPO_DIR` (the git repo those files belong to, used for publishing to the personal site).

### Required env vars

| Var | What |
|---|---|
| `CONTENT_DIR` | Absolute path to the folder containing essay subdirectories |
| `REPO_DIR` | Absolute path to the git repo root (for `git add -A && git commit && git push`) |
| `PORT` | Optional, defaults to 4112 |

### Backend (`server.ts` + `src/`)

| File | Responsibility |
|---|---|
| `server.ts` | Route definitions + SPA fallback |
| `src/essays.ts` | Read/write/create/delete/move markdown files with gray-matter frontmatter |
| `src/folders.ts` | Folder CRUD under `CONTENT_DIR` |
| `src/git.ts` | `gitPull` / `gitPush` wrapping `execSync` with `cwd: REPO_DIR` |
| `src/types.ts` | Shared types: `Essay`, `EssayMeta`, `Frontmatter` |

Path safety: `src/essays.ts` rejects any path component containing `..`, `/`, `\`, or absolute paths before touching the filesystem.

### API

| Method | Path | What |
|---|---|---|
| `GET` | `/api/essays` | List all essays (metadata only, no body) |
| `GET` | `/api/essays/:folder/:slug` | Read full essay with frontmatter + body |
| `PUT` | `/api/essays/:folder/:slug` | Write essay (frontmatter + body) |
| `POST` | `/api/essays` | Create new essay (slugified from title) |
| `DELETE` | `/api/essays/:folder/:slug` | Delete essay file |
| `PATCH` | `/api/essays/:folder/:slug/move` | Move essay to different folder |
| `GET` | `/api/folders` | List all folders |
| `POST` | `/api/folders` | Create folder |
| `PATCH` | `/api/folders/:folder` | Rename folder |
| `DELETE` | `/api/folders/:folder` | Delete folder (must be empty) |
| `POST` | `/api/git/pull` | `git pull` in `REPO_DIR` |
| `POST` | `/api/git/push` | `git add -A && git commit -m <msg> && git push` in `REPO_DIR` |

### Frontend (`frontend/`)

React + Vite + Tailwind + CodeMirror 6 (markdown editor) + `marked` (preview rendering). Built output goes to `public/` at project root. SPA with `*` fallback to `index.html`.

## Content model

Essays are markdown files at `CONTENT_DIR/<folder>/<slug>.md`. Frontmatter (gray-matter) carries metadata like `title`, `date`, `published`. The folder/slug path is the canonical identifier — no database.

## Deploy

Push to `master` → GitHub Actions builds Docker image → pushes to GHCR → SSHs into VPS → `docker compose pull writing-app && docker compose up -d writing-app`.

VPS path: `/home/dima/ai-os/` (monorepo, Docker Compose stack).
Image: `ghcr.io/dpetryshchuk/ai-os/writing-app:latest`

Full VPS ops guide: `../docs/VPS-GUIDE.md`.
