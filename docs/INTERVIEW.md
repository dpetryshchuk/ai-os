# ai-os — interview prep

Single-tenant AI operating system for one knowledge worker. The job-search CRM is the flagship; the rest of the surface (writing, daily log, ideas, look, events) sits on the same primitives. Designed so it can be **productized** as a per-business deployment on Hetzner.

---

## 30-second pitch

> "Self-hosted FastAPI + React app. Two Postgres DBs, Redis-backed Celery for scheduled scrapers and an LLM agent for the CRM. Deployed to a single Hetzner VPS behind Caddy via a GitHub Actions → GHCR pipeline. The Terraform module is built to spin up new tenants on demand."

---

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| API | FastAPI (Python 3.12) + uvicorn | async-native, type-safe with Pydantic |
| Frontend | React 19 + Vite + Tailwind | server-side mounted from FastAPI's `/public` |
| Data | Postgres 16 ×2 (`jobsearch`, `daily_log`) | hard isolation by domain |
| DB clients | asyncpg in routes, psycopg2 + SQLAlchemy in Celery | async for HTTP, sync for workers |
| Queue | Celery + Redis | event-driven scrapers + agentic background work |
| LLM | DeepSeek via LiteLLM | provider-agnostic, $0.27/M tokens, cheap iteration |
| Migrations | Alembic ×2 (one per DB) | source of truth in `alembic/versions/` |
| Deploy | GitHub Actions → GHCR → SSH `docker compose pull` | ~2 min from push to live |
| Reverse proxy | Caddy as host systemd service | auto-TLS, single Caddyfile for all subdomains |
| Infra-as-code | Terraform (hcloud + cloudflare + github providers) | seed of the productization play |

---

## Architecture

```
Browser → Caddy (basicauth, auto-TLS) → FastAPI :4116
                                          ↕ asyncpg pools (routes)
                                      jobsearch DB    daily_log DB
                                          ↕ SyncSession (Celery)
                                      celery-worker + celery-beat
                                          ↕ Redis
```

**Entry points:**
- API: [aios/main.py](../aios/main.py) — FastAPI lifespan opens/closes DB pools, mounts 7 routers, SPA-falls-back to `public/index.html`
- Celery: [aios/tasks.py](../aios/tasks.py) — `process_event` is the universal handler; `run_scheduled` is what beat fires
- Per-feature: one router under [aios/routers/](../aios/routers/), one folder under [aios/frontend/src/pages/](../aios/frontend/src/pages/)

**Universal event pattern.** UI/webhook/cron all flow through the same primitive:
```
trigger → events.create(pool, source, type, payload) → os_events row → process_event.delay(id) → handler in workers/* → updates row.status
```
That's why the Events page is a useful debugging surface — every async thing in the system shows up there.

---

## The flagship: job-search CRM (the bit the interviewer is going to walk through)

**Domain model** ([aios/alembic/versions/0002](../aios/alembic/versions/0002_create_jobsearch_schema.py)): `companies`, `contacts` (Outreached → Responded → Ongoing → Dead), `interactions`, `job_postings` (new → applied → dropped), `notes`, `content_posts`. Classic CRM funnel.

**Six pages** ([aios/frontend/src/pages/JobSearch/](../aios/frontend/src/pages/JobSearch/)):
- **Pipeline** — contacts grouped by stage, inline stage editor, collapsed Dead section
- **Leads** — scraped postings, trash icon = soft-drop (sets `status='dropped'` so the scraper's dedup skips on rescrape)
- **Applications** — applied jobs with inline status + resume upload
- **Notes** — FTS over a free-form notes table
- **Retro** — funnel conversion %, weekly/daily activity, "needs action" contacts (no touch in 7+ days)
- **Chat (Jobby)** — full-page agent conversation

**The clever bit — soft delete for scraper dedup.** [workers/scrapers/utils.py:189](../aios/workers/scrapers/utils.py#L189): when rescraping, the worker checks `(company_id, title)` against existing `job_postings` and skips if status != 'new'. So clicking trash on a lead permanently removes it from future scrapes without losing the row. That's a design decision worth pointing out.

---

## Jobby (the agent)

[aios/agent.py](../aios/agent.py) — LiteLLM tool-use loop, streaming SSE.

**Loop shape:**
1. POST `/api/jobsearch/agents/stream` with messages
2. `litellm.acompletion(..., stream=True, tools=TOOLS)` against DeepSeek
3. Stream `text-delta`, `tool-call`, `tool-result` chunks as SSE
4. When the assistant emits tool calls, accumulate them, run them sequentially against the DB, append `{"role": "tool", ...}` messages, loop again
5. When the assistant returns text without tool calls, emit `[DONE]`

**11 tools** ([agent.py:26-227](../aios/agent.py#L26)): `upsert_company`, `upsert_contact`, `upsert_job_posting` (all search-before-insert), `update_stage`, `log_interaction`, `log_content_post`, `search_notes`, `query_db` (read-only SELECT), `update_lead_status`, `get_scraper_settings`, `update_scraper_settings`.

**System prompt** ([agent.py:9-58](../aios/agent.py#L9)) is **grill-style**: one question at a time, search-before-insert, restate-before-write, never fabricate. This is the prompt that does the heavy lifting on quality — the model is fine; the discipline is in the instructions.

---

## Background work

**Scrapers** ([aios/workers/scrapers/](../aios/workers/scrapers/)):
- `jobspy_scraper.py` — Indeed + LinkedIn for SD-area jobs. Config now lives in `scraper_settings` table (jsonb), editable from the UI's settings drawer. Defaults fall back to module constants if no row exists.
- `yc.py`, `hn.py` — RSS-style sources
- `local_events.py` — Menifee/Temecula/Murrieta events
- `fathom.py` — webhook handler for meeting summaries
- `whisper_transcribe.py`, `supadata_transcript.py` — audio/video transcription

**Beat schedule** ([tasks.py:89-115](../aios/tasks.py#L89)): SD scrape twice daily, YC + HN once a day, health check every 60s. All cron jobs go through the same event row, so failures are inspectable.

---

## Deploy

**CI** ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)) — three parallel jobs:
- `deploy-app` — `aios/**` changed → build image, push to GHCR, SSH `docker compose pull aios && up -d aios celery-worker celery-beat`
- `deploy-onekeyflow` — same pattern for the OKF image (separate repo, deployed alongside)
- `deploy-infra` — `docker-compose.yml` or `caddy/**` changed → SSH `docker compose up -d --pull=never` + `systemctl reload-or-restart caddy`

**VPS**: single Hetzner CX22 (€4/mo) running Docker Compose: app, two celery containers, postgres, redis, OKF, OKF worker. Caddy runs as a host systemd service (not in compose) so it owns 80/443 directly.

**Migrations** are NOT auto-run on deploy. After any new Alembic revision: `docker compose exec aios alembic upgrade head`.

---

## Infrastructure-as-code → productization

[infra/terraform/](../infra/terraform/) currently models the existing single-tenant deployment. The vision: turn it into a multi-tenant module so I can spin up an AIOS for any business with one `terraform apply -var tenant=acme`.

**What's there today:** `hcloud_server` + firewall + SSH key + `cloudflare_record` for each subdomain + `github_actions_secret` for deploy keys + cloud-init that installs Docker, Caddy, clones the repo.

**Productization roadmap:**
1. Extract everything into `modules/aios-tenant/` — a reusable unit
2. Root `main.tf` becomes one `module "tenant" {...}` per customer
3. Cloud-init upgrade: drop in `docker-compose.yml` + a Caddyfile templated with the tenant's domain, generate random Postgres passwords + a basic-auth credential, run alembic, **print the first-boot credentials**
4. Per-tenant state file (Terraform workspaces) — destroying tenant A can't touch B
5. DNS strategy: wildcard `*.aios.dmytropetryshchuk.com` controlled by me, or BYO-domain via CNAME

**Cost model:** ~€4/mo Hetzner floor cost per tenant. Trades isolation for density vs the alternative (single multi-tenant instance with `tenant_id` columns). I picked isolation; cheaper to operate, simpler mental model, defensible privacy story.

---

## Honest tech debt (interview gold — name your own gaps)

- **No auth at the app layer.** Caddy basic-auth gates the whole site. Fine for solo; a tenant model needs real per-user auth (Clerk, OAuth, or password+session).
- **No LLM observability.** No Langfuse/LangSmith. Adding LiteLLM callbacks would surface prompt/response pairs, token costs, latency.
- **No tests on the agent loop.** `aios/tests/test_router_jobsearch.py` covers HTTP shape but not the multi-turn tool flow.
- **Beat alongside the worker is fragile.** If the beat container restarts mid-cron, missed runs aren't replayed.
- **`query_db` tool lets the agent run arbitrary SELECT.** Whitelisted to SELECT in [agent.py:262](../aios/agent.py#L262), but no schema-aware safety; nothing stops `SELECT pg_sleep(1000)`.
- **No connection pooling at the worker layer.** Each `SyncSession` opens fresh, which is fine for 5 jobs/min but won't scale.
- **Frontend bundle is 1MB ungzipped.** Vite warns. Worth a code-split pass before a real launch.
- **No staging environment.** Pushes to master deploy straight to prod.

---

## Interview talking-points cheat sheet

> **"Why two Postgres DBs?"** Hard isolation by domain. The daily log is personal/private; jobsearch is operational. Keeps schemas focused and lets me reason about migrations independently. Costs one extra `\c` mentally, that's it.

> **"Why asyncpg AND psycopg2?"** Routes are async — asyncpg pools live inside FastAPI's event loop. Celery workers are sync processes — psycopg2 via SQLAlchemy `SyncSession` is the right tool there. Different runtimes, different clients.

> **"Why DeepSeek?"** Cheapest model with tool-use that doesn't fall apart at low context. $0.27/M in, $1.10/M out. LiteLLM means switching to GPT-4o is one string change. I optimized for iteration speed, not model quality.

> **"Why the universal event pattern?"** Every async thing — UI button, cron tick, webhook — creates the same `os_events` row. One audit trail, one debugging surface, one retry primitive. Adding a new scraper means adding one handler entry to `_import_handlers()`.

> **"Why FastAPI serves the React bundle?"** One container, one port, one TLS cert. Vite builds into `public/`; FastAPI's `StaticFiles` mount serves it; a catch-all route returns `index.html` for client-side routing. No nginx, no separate web server.

> **"How would you make this multi-tenant?"** Two paths. Cheap path: `tenant_id` columns everywhere, single DB, RLS in Postgres. Expensive but bulletproof: separate VPS per tenant, which is the Terraform module. I picked the second because each tenant gets a defensible "your data lives on your box" story, and the per-tenant floor cost is €4/mo on Hetzner.

> **"What about scale?"** This is built for one-user / one-tenant throughput. The bottlenecks would hit in this order: SQLite-style write contention on Postgres in the worker DBs (need PgBouncer at ~20 concurrent jobs), Celery beat single-point-of-failure (move to Celery Beat HA), single-VPS blast radius (multi-AZ with managed Postgres + Redis). I'd defer all of those until I'm bleeding.

> **"What's next?"** Multi-tenant Terraform refactor — the productization play. Then cloning the jobsearch CRM into OKF as a LinkedIn outreach machine — same primitives, different funnel.
