# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
uvicorn main:app --reload --port 4112   # dev server (hot reload)
pytest                                   # run tests
pytest -v                               # verbose test output

cd frontend && npm run dev              # Vite dev server for frontend only
```

Tests use `tmp_path` fixtures and `monkeypatch` to point `CONTENT_DIR` at a temp directory — no real filesystem state needed.

## Architecture

```
Browser → Caddy (write.dmytropetryshchuk.com)
              → reverse_proxy localhost:4112
                    → FastAPI (uvicorn main:app)
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

### Backend (`main.py`)

All routes are sync (FastAPI runs them in the thread pool — no `async def` needed since all I/O is filesystem + subprocess).

| Responsibility | Notes |
|---|---|
| Essay CRUD | Read/write/create/delete/move markdown files via `python-frontmatter` |
| Folder CRUD | `os.makedirs` / `os.rmdir` under `CONTENT_DIR` |
| Git operations | `subprocess.run(["git", ...], cwd=REPO_DIR)` |
| Path safety | `_validate()` rejects `..`, `/`, `\`, and absolute paths before any filesystem op |

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
| `GET` | `/api/health` | `{"ok": true}` |

### Frontend (`frontend/`)

React + Vite + Tailwind + CodeMirror 6 (markdown editor) + `marked` (preview rendering). Built output goes to `public/` at project root (`outDir: '../public'`). SPA with `*` fallback to `index.html`.

## Content model

Essays are markdown files at `CONTENT_DIR/<folder>/<slug>.md`. Frontmatter (`python-frontmatter`) carries metadata like `title`, `date`, `published`. The folder/slug path is the canonical identifier — no database.

## Deploy

Push to `master` → GitHub Actions builds Docker image → pushes to GHCR → SSHs into VPS → `docker compose pull writing-app && docker compose up -d writing-app`.

VPS path: `/home/dima/ai-os/` (monorepo, Docker Compose stack).
Image: `ghcr.io/dpetryshchuk/ai-os/writing-app:latest`

The Docker image installs `git` and `openssh-client` for git operations inside the container.

Full VPS ops guide: `../docs/VPS-GUIDE.md`.
