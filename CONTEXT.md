# CONTEXT

Domain and architecture vocabulary for AI OS. Use these terms exactly in
conversation, commits, and code. The architecture words (module, interface,
adapter, seam, deep/shallow) carry their meaning from the
`improve-codebase-architecture` skill's LANGUAGE.md.

## Driver split (a load-bearing constraint)

The app reaches Postgres through **two drivers**: FastAPI routes use **asyncpg
pools**; Celery workers use **psycopg2 / `SyncSession`**. Any data-access module
shared by both is therefore a real **seam** with **two adapters** — one async,
one sync — that share an invariant but not the literal SQL string (paramstyles
differ). New shared modules follow this shape: `do_x(pool, ...)` (async) +
`do_x_sync(conn, ...)` (sync).

## Domain terms

- **OS Event** — a row in `os_events`: a unit of background work (`source`,
  `type`, `payload`, `status`). Created pending, processed by a Celery handler,
  ends `done` or `failed`. The contact/scraper/webhook/embedding pipelines all
  flow through it.
- **Contact pipeline** — a Contact moves `Outreached → Responded → Ongoing →
  Dead`.
- **Job Posting** — a scraped or agent-entered role, deduped per
  `company_id + lower(title)`.
- **Company** — deduped per `lower(name)`.
- **Scraped Job** (`ScrapedJob`) — a raw scrape result before it survives the
  filter chain and becomes a Job Posting.
- **Filter chain** — the four predicates (`is_defense`, `is_high_travel`,
  `is_non_ca_remote`, `matches_role`) deciding which Scraped Jobs enter the
  system.
- **Embedding** — a vector row in `embeddings`, deduped per
  `(source_type, source_id)`; powers semantic search.

## Modules (deepened seams)

- **Event emitter** (`events.py`) — the single seam for creating an OS Event and
  enqueuing it. `emit(pool, source, type, payload)` (async, routes) and
  `emit_sync(source, type, payload)` (sync, Celery). Owns the id scheme, the
  `pending` default, and the `process_event` enqueue coupling. Replaced
  hand-rolled `INSERT INTO os_events` at every call site.
- **Embedding store** (`services/embeddings.py`) — owns the `embeddings`-table
  contract. `upsert(pool, ...)` (async) and `upsert_sync(conn, ...)` (sync,
  caller owns the connection so a backfill loop reuses one). Replaced four
  copies of the same `INSERT … ON CONFLICT`.
- **Intake** (`intake.py`) — find-or-create for Companies and Job Postings; the
  dedup invariant that previously lived twice (agent via asyncpg, scraper via
  psycopg2) and had drifted. `find_or_create_company` / `_sync` and
  `find_or_create_job_posting` / `_sync`. Each returns `(id, created[, existing])`
  so callers apply their own on-existing policy. `upsert_contact` is **not**
  here — only the agent creates Contacts (one caller = hypothetical seam).
- **Agent tool registry** (`agent.py`) — Ima's tools dispatch through a
  `_TOOL_HANDLERS` dict (`name → async handler(inputs, pool)`), not an if/elif
  ladder. Adding a tool means registering an adapter. `test_agent_registry`
  pins the invariant that the registry covers exactly the declared `TOOLS`.

## Testing seam

No real Postgres in tests. `tests/conftest.py` provides an asyncpg pool fake
(AsyncMock) and a psycopg2 `FakeConn` that records SQL and serves staged
results. A module's invariant is exercised by injecting a fake across its
interface — including `sync_jobs_to_db(jobs, conn=...)`, whose filter chain and
dedup orchestration are now testable through the injected connection.
