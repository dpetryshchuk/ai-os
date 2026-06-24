"""Job-posting intake — find-or-create for companies and job_postings.

This is the dedup invariant that was previously written twice and had drifted:
``agent.run_tool`` did it with asyncpg, ``workers/scrapers/utils.sync_jobs_to_db``
did it with psycopg2 and an in-memory map. The invariant now lives here once,
with one adapter per driver:

- async (``find_or_create_company`` / ``find_or_create_job_posting``) — FastAPI / agent
- sync  (``*_sync``)                                                   — Celery scrapers

A company is keyed by ``lower(name)``; a posting is keyed by
``company_id + lower(title)``. Each adapter returns the existing row's id with a
``created`` flag (and, for postings, the existing row) so callers can apply
their own on-existing behaviour.
"""
import secrets


def _new_id() -> str:
    return secrets.token_hex(8)


# ── companies ─────────────────────────────────────────────────────────────────

def find_or_create_company_sync(conn, name: str, website: str | None) -> tuple[str, bool]:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM companies WHERE lower(name) = lower(%s)", (name,))
        row = cur.fetchone()
        if row:
            return row[0], False
        cid = _new_id()
        cur.execute(
            "INSERT INTO companies (id, name, website) VALUES (%s, %s, %s) "
            "ON CONFLICT (id) DO NOTHING",
            (cid, name, website),
        )
    conn.commit()
    return cid, True


async def find_or_create_company(pool, name: str, website: str | None) -> tuple[str, bool]:
    row = await pool.fetchrow("SELECT id FROM companies WHERE lower(name) = lower($1)", name)
    if row:
        return row["id"], False
    cid = _new_id()
    await pool.execute(
        "INSERT INTO companies (id, name, website) VALUES ($1, $2, $3)", cid, name, website
    )
    return cid, True


# ── job postings ──────────────────────────────────────────────────────────────

def find_or_create_job_posting_sync(
    conn,
    company_id: str,
    title: str,
    *,
    link: str | None = None,
    source: str | None = None,
    status: str = "new",
    description: str | None = None,
    location: str | None = None,
) -> tuple[str, bool, dict | None]:
    """Returns (id, created, existing_row). On create the row is inserted with
    the given fields; on hit the caller decides what (if anything) to update."""
    import psycopg2.extras

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, company_id, title, link, status FROM job_postings "
            "WHERE company_id = %s AND lower(title) = lower(%s)",
            (company_id, title),
        )
        existing = cur.fetchone()
    if existing:
        return existing["id"], False, existing

    from datetime import date, datetime, timezone

    jid = _new_id()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO job_postings "
            "(id, company_id, title, link, source, scraped_date, scraped_at, status, description, location) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                jid, company_id, title, link, source,
                date.today().isoformat(), datetime.now(timezone.utc),
                status, description, location,
            ),
        )
    conn.commit()
    return jid, True, None


async def find_or_create_job_posting(
    pool,
    company_id: str,
    title: str,
    *,
    link: str | None = None,
    source: str | None = None,
    status: str = "new",
    resume_path: str | None = None,
):
    """Returns (id, created, existing_row)."""
    existing = await pool.fetchrow(
        "SELECT id, status FROM job_postings WHERE company_id = $1 AND lower(title) = lower($2)",
        company_id, title,
    )
    if existing:
        return existing["id"], False, existing
    jid = _new_id()
    await pool.execute(
        "INSERT INTO job_postings (id, company_id, title, link, source, status, resume_path) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7)",
        jid, company_id, title, link, source, status, resume_path,
    )
    return jid, True, None
