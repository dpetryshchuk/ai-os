"""Unit tests for the scraper filter chain — pure functions, no DB.

These four predicates decide which scraped jobs enter the system. They are
the cheapest possible test surface and were previously untested.
"""
from unittest.mock import patch

from workers.scrapers.utils import (
    ScrapedJob,
    is_defense,
    is_high_travel,
    is_non_ca_remote,
    matches_role,
    sync_jobs_to_db,
)


def test_is_defense_blocks_military():
    assert is_defense("defense contractor") is True
    assert is_defense("military software") is True
    assert is_defense("national security platform") is True
    assert is_defense("normal startup") is False
    assert is_defense(None) is False
    assert is_defense("") is False


def test_is_high_travel_blocks_heavy():
    assert is_high_travel("role requires 60% travel") is True
    assert is_high_travel("frequent travel required") is True
    assert is_high_travel("extensive travel to customer sites") is True
    assert is_high_travel("occasional travel") is False
    assert is_high_travel("minimal travel required") is False
    assert is_high_travel(None) is False


def test_is_non_ca_remote_filters_non_ca():
    assert is_non_ca_remote("New York, NY") is True
    assert is_non_ca_remote("Chicago, IL") is True
    assert is_non_ca_remote("London, UK") is True
    assert is_non_ca_remote("Toronto, Canada") is True
    assert is_non_ca_remote(None) is False


def test_is_non_ca_remote_keeps_ca_and_remote():
    assert is_non_ca_remote("Remote") is False
    assert is_non_ca_remote("San Francisco, CA") is False
    assert is_non_ca_remote("California") is False
    assert is_non_ca_remote("United States") is False


def test_matches_role_keeps_target_roles():
    assert matches_role("Forward Deployed Engineer") is True
    assert matches_role("Solutions Engineer") is True
    assert matches_role("AI Automation Engineer") is True
    assert matches_role("FDE") is True


def test_matches_role_drops_excluded_titles():
    assert matches_role("Senior Software Engineer") is False
    assert matches_role("Backend Engineer") is False
    assert matches_role("ML Engineer") is False
    assert matches_role("Intern") is False
    assert matches_role("founding engineer") is False
    assert matches_role("") is False


# ── sync_jobs_to_db orchestration (filter chain + dedup via injected conn) ─────


def test_sync_jobs_filters_and_creates(fake_conn):
    jobs = [
        ScrapedJob(company_name="Acme", job_title="AI Engineer", job_link="http://x", source="HN"),
        ScrapedJob(company_name="WarCorp", job_title="AI Engineer", description="military weapons", source="HN"),
    ]
    with patch("tasks.embed_document") as emb:
        result = sync_jobs_to_db(jobs, conn=fake_conn)

    assert result["created"] == 1       # Acme created
    assert result["skipped"] == 1       # WarCorp dropped by is_defense
    emb.delay.assert_called_once()       # embedding enqueued for the created posting


def test_sync_jobs_skips_existing_non_new(fake_conn):
    # Stage an existing posting whose status is already past 'new'
    fake_conn.stage_result(
        "SELECT id, company_id, title, link, status FROM job_postings",
        [{"id": "job-1", "company_id": "comp-1", "title": "AI Engineer",
          "link": "http://old", "status": "applied"}],
    )
    jobs = [ScrapedJob(company_name="Acme", job_title="AI Engineer", job_link="http://new", source="HN")]
    with patch("tasks.embed_document"):
        result = sync_jobs_to_db(jobs, conn=fake_conn)

    assert result == {"created": 0, "updated": 0, "skipped": 1}
