# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
uvicorn main:app --reload --port 4111   # dev server (hot reload)
pytest                                   # run tests
pytest -v                               # verbose test output

npm run scrape:yc-deep           # YC deep scrape
npm run scrape:hn                # HN Who's Hiring
npm run scrape:remoteok          # RemoteOK public API
npm run scrape:simplify          # SimplifyJobs new grad listings
npm run scrape:jobspy            # Python: multi-board scraper (requires venv)
npm run db:query "SELECT ..."    # Query Postgres (needs SSH tunnel locally)
npm run db:backup                # Copy db/jobsearch.sqlite to db/backups/<date>.sqlite
```

Local DB queries require an SSH tunnel: `ssh -L 5432:localhost:5432 dima@46.225.78.10`

## Architecture

```
Browser → Caddy (jobsearch.dmytropetryshchuk.com, basicauth)
              → reverse_proxy localhost:4111
                    → FastAPI (uvicorn main:app)
                          ↕ asyncpg
                        Postgres
```

**One process.** FastAPI is the sole backend — it hosts the agent streaming endpoint, all API routes, and serves the React SPA.

### Backend (`main.py` + `agent.py` + `db.py`)

| File | Responsibility |
|---|---|
| `main.py` | Route definitions, lifespan (pool init/close), static file serving |
| `agent.py` | Anthropic agentic loop (`claude-opus-4-7`) — 8 CRM tools, SSE streaming |
| `db.py` | Singleton `asyncpg.Pool` — `init_pool()`, `close_pool()`, `get_pool()` dependency |

### Agent

`agent.py` implements a tool-use loop using the Anthropic Python SDK (`anthropic.AsyncAnthropic`). The `agentic_stream()` async generator yields SSE events:

- `data: {"type": "text-delta", "text": "..."}` — streamed text chunks
- `data: {"type": "tool-call", "name": "...", "input": {...}}` — tool being invoked
- `data: {"type": "tool-result", "name": "...", "result": "..."}` — tool result
- `data: [DONE]` — stream finished

**8 CRM tools:** `upsert_company`, `upsert_contact`, `upsert_job_posting`, `update_stage`, `log_interaction`, `log_content_post`, `search_notes`, `query_db`

Rule: `upsert_company` is always called first — tools search before inserting to avoid duplicates.

### API routes (all prefixed `/api/`)

Agent chat:
- `POST /api/agents/jobsearch/stream` — SSE streaming agent chat

Data endpoints:

| Path | What |
|---|---|
| `GET /data/pipeline` | Contacts with company + last-contact date, ordered by stage |
| `GET /data/retro` | Weekly/daily interaction volumes, by-source conversion, needs-action list, all-time stats |
| `GET /data/leads` | `job_postings` where `status = 'new'` |
| `GET /data/applications` | `job_postings` where `status = 'applied'`, includes `resume_path` |
| `GET /data/content` | Content posts ordered by date |
| `GET /data/notes[?q=]` | All notes; `?q=` does full-text search via `plainto_tsquery` |
| `POST /data/notes` | Create note (`category`, `title`, `url`, `content`) |
| `PATCH /data/notes/:id` | Update note |
| `DELETE /data/notes/:id` | Delete note |
| `POST /data/resumes` | Upload PDF (multipart), stored in `UPLOADS_DIR` |
| `GET /data/usage` | Placeholder usage stats |
| `GET /health` | `{"ok": true}` |

### Database (Postgres 16)

Schema in `db/schema.sql`. Key tables:

```
companies       id, name, website
contacts        id, name, company_id, role, source, stage, notes
                stage: Outreached → Responded → Ongoing → Dead
interactions    id, contact_id, date, direction (out/in), notes
job_postings    id, company_id, title, link, source, status (new/applied/dropped), resume_path
content_posts   id, posted_date, content, impressions, engagements, comments
notes           id, category, title, url, content, created_at
```

IDs are 16-char hex strings (`os.urandom(8).hex()`).

### Agent flows (4 core)

1. **Paste a job posting** → `upsert_company` → `upsert_job_posting`
2. **Log an application** → `upsert_company` → `upsert_job_posting(status: applied)` → `log_interaction(out)`
3. **Log outreach** → `upsert_company` → `upsert_contact(stage: Outreached)` → `log_interaction(out)`
4. **Log a reply** → `query_db` to find contact → `update_stage` → `log_interaction(in)`

### Frontend (`frontend/`)

React + Vite + Tailwind. Built output goes to `public/` at project root (`outDir: '../public'`). Served by FastAPI.

### Scrapers (`tools/`)

Run locally (not on VPS) via SSH tunnel. Write to Postgres. Apply filters: no defense, no high-travel roles, CA/remote only.

## Deploy

Push to `master` → GitHub Actions builds Docker image → pushes to GHCR → SSHs into VPS → `docker compose pull jobsearch && docker compose up -d jobsearch`.

VPS path: `/home/dima/ai-os/` (monorepo, Docker Compose stack).
Image: `ghcr.io/dpetryshchuk/ai-os/jobsearch:latest`

The Dockerfile uses `npm install` (not `npm ci`) for the frontend build step — the lock file has platform-specific packages that differ between macOS/Windows and Linux.

Full VPS ops: see `../docs/VPS-GUIDE.md`
