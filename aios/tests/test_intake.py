"""Tests for the job-posting intake module.

intake owns find-or-create for `companies` and `job_postings` — the dedup
invariant that previously lived twice (agent.run_tool via asyncpg, and
sync_jobs_to_db via psycopg2) and had drifted. One interface, two adapters.
"""
from unittest.mock import AsyncMock, patch

import intake


# ── company: sync adapter ─────────────────────────────────────────────────────

def test_find_or_create_company_sync_creates_when_absent(fake_conn):
    cid, created = intake.find_or_create_company_sync(fake_conn, "Acme", "acme.com")
    assert created is True
    assert len(cid) == 16
    inserts = [s for s in fake_conn.executed if "INSERT INTO companies" in s]
    assert len(inserts) == 1


def test_find_or_create_company_sync_reuses_existing(fake_conn):
    fake_conn.stage_result("SELECT id FROM companies", [("comp-1",)])
    cid, created = intake.find_or_create_company_sync(fake_conn, "Acme", "acme.com")
    assert (cid, created) == ("comp-1", False)
    assert not any("INSERT INTO companies" in s for s in fake_conn.executed)


# ── company: async adapter ────────────────────────────────────────────────────

async def test_find_or_create_company_creates_when_absent(mock_jobsearch_pool):
    cid, created = await intake.find_or_create_company(mock_jobsearch_pool, "Acme", "acme.com")
    assert created is True
    assert len(cid) == 16
    assert "INSERT INTO companies" in mock_jobsearch_pool.execute.call_args.args[0]


async def test_find_or_create_company_reuses_existing(mock_jobsearch_pool):
    mock_jobsearch_pool.fetchrow = AsyncMock(return_value={"id": "comp-1"})
    cid, created = await intake.find_or_create_company(mock_jobsearch_pool, "Acme", None)
    assert (cid, created) == ("comp-1", False)
    mock_jobsearch_pool.execute.assert_not_called()


# ── job posting: sync adapter ─────────────────────────────────────────────────

def test_find_or_create_job_posting_sync_creates_when_absent(fake_conn):
    jid, created, existing = intake.find_or_create_job_posting_sync(
        fake_conn, "comp-1", "AI Engineer", link="http://x", source="YC"
    )
    assert created is True
    assert existing is None
    assert len(jid) == 16
    assert any("INSERT INTO job_postings" in s for s in fake_conn.executed)


def test_find_or_create_job_posting_sync_returns_existing(fake_conn):
    fake_conn.stage_result(
        "SELECT id, company_id, title, link, status FROM job_postings",
        [{"id": "job-1", "company_id": "comp-1", "title": "AI Engineer",
          "link": "http://old", "status": "new"}],
    )
    jid, created, existing = intake.find_or_create_job_posting_sync(
        fake_conn, "comp-1", "AI Engineer"
    )
    assert (jid, created) == ("job-1", False)
    assert existing["status"] == "new"
    assert not any("INSERT INTO job_postings" in s for s in fake_conn.executed)


# ── job posting: async adapter ────────────────────────────────────────────────

async def test_find_or_create_job_posting_creates_when_absent(mock_jobsearch_pool):
    jid, created, existing = await intake.find_or_create_job_posting(
        mock_jobsearch_pool, "comp-1", "AI Engineer", status="new"
    )
    assert created is True and existing is None
    assert "INSERT INTO job_postings" in mock_jobsearch_pool.execute.call_args.args[0]


async def test_find_or_create_job_posting_returns_existing(mock_jobsearch_pool):
    mock_jobsearch_pool.fetchrow = AsyncMock(return_value={"id": "job-1", "status": "applied"})
    jid, created, existing = await intake.find_or_create_job_posting(
        mock_jobsearch_pool, "comp-1", "AI Engineer"
    )
    assert (jid, created) == ("job-1", False)
    assert existing["status"] == "applied"
    mock_jobsearch_pool.execute.assert_not_called()
