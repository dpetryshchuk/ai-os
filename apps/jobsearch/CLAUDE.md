# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                      # mastra dev (hot reload on port 4111)
npx mastra build                 # production build → .mastra/output/index.mjs
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
              ├── /api/*  → Mastra server (localhost:4111)
              └── static  → /home/dima/jobsearch/public/
```

**One process.** Mastra is the sole backend — it hosts the agent, all API routes, and Postgres storage. No separate Express server.

### Backend (`src/mastra/`)

| File | Responsibility |
|---|---|
| `index.ts` | Mastra instance: agent, Postgres storage, Langfuse observability, all custom API routes |
| `pool.ts` | Single shared `pg.Pool` (from `DATABASE_URL`) |
| `queries.ts` | All read queries: `getPipeline`, `getRetro`, `getLeads`, `getApplications`, `getNotes`, `searchNotes`, `getContentPosts` |
| `agents/jobsearch.ts` | CRM agent (DeepSeek model) — handles the 4 core flows |
| `tools/db.ts` | Mastra tools: `upsert_company`, `upsert_contact`, `upsert_job_posting`, `update_stage`, `log_interaction`, `log_content_post`, `search_notes`, `query_db` |

### API routes (all prefixed `/api/`)

Agent chat (Mastra native):
- `POST /api/agents/jobsearch/stream` — SSE streaming agent chat

Data endpoints (custom routes in `index.ts`):

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
| `POST /data/resumes` | Upload PDF (multipart), stored in `/home/dima/jobsearch/uploads/` |
| `GET /data/usage` | Langfuse traces + daily metrics |

### Database (Postgres 16)

Schema in `docs/schema.sql`. Key tables:

```
companies       id, name, website
contacts        id, name, company_id, role, source, stage, notes
                stage: Outreached → Responded → Ongoing → Dead
interactions    id, contact_id, date, direction (out/in), notes
job_postings    id, company_id, title, link, source, status (new/applied/dropped), resume_path
content_posts   id, posted_date, content, impressions, engagements, comments
notes           id, category, title, url, content, created_at
```

IDs are `lower(hex(randomblob(8)))` — 16-char hex strings.

### Agent flows (4 core)

1. **Paste a job posting** → `upsert_company` → `upsert_job_posting`
2. **Log an application** → `upsert_company` → `upsert_job_posting(status: applied)` → `log_interaction(out)`
3. **Log outreach** → `upsert_company` → `upsert_contact(stage: Outreached)` → `log_interaction(out)`
4. **Log a reply** → `query_db` to find contact → `update_stage` → `log_interaction(in)`

Rule: always call `upsert_company` first — tools search before inserting, never create duplicates.

### Frontend (`frontend/`)

React + Vite + Tailwind. Static output is built by GitHub Actions and served by Caddy from `public/` (file_server). Not served by the Mastra process.

### Scrapers (`tools/`)

Run locally (not on VPS) via SSH tunnel. Write to Postgres. Apply filters: no defense, no high-travel roles, CA/remote only.

## Deploy

Push to `master` → GitHub Actions builds Docker image → pushes to GHCR → SSHs into VPS → `docker compose pull jobsearch && docker compose up -d jobsearch`.

VPS path: `/home/dima/ai-os/` (monorepo, Docker Compose stack).
Image: `ghcr.io/dpetryshchuk/ai-os/jobsearch:latest`
Entry point: `node .mastra/output/index.mjs` (inside container)

Full VPS ops: see `../docs/VPS-GUIDE.md`
