"""Filters and DB sync helpers shared by all scrapers."""
import re
from dataclasses import dataclass
from typing import Optional

import psycopg2

import intake
from config import settings

DEFENSE_KEYWORDS = [
    "defense", "defence", "military", "weapon", "dod", "national security", "aerospace defense",
]

EXACT_ROLE_PHRASES = [
    "forward deployed", "fde", "solutions engineer", "sales engineer",
    "implementation engineer", "embedded engineer", "founder's associate", "founders associate",
    "ai product", "gtm engineer", "customer engineer", "technical account manager",
    "field engineer", "automation engineer", "ai product manager",
]

AI_ENGINEER_SIGNALS = [
    "ai", "ml", "machine learning", "automation", "llm", "nlp", "agentic", "agent", "robotics",
]

EXCLUDE_TITLE_PHRASES = [
    "founding engineer", "founding full stack", "founding fullstack", "founding backend",
    "founding frontend", "founding ml", "founding machine learning", "founding ai engineer",
    "founding software engineer", "founding ai software",
    "senior software engineer", "staff software engineer",
    "senior full stack", "senior fullstack", "senior backend", "senior frontend", "senior full-stack",
    "backend engineer", "frontend engineer", "fullstack engineer",
    "full stack engineer", "full-stack engineer",
    "software engineer, data", "data engineer", "data platform",
    "devops engineer", "infrastructure engineer",
    "research engineer", "ml researcher", "research scientist",
    "machine learning engineer", "ml engineer",
    "software / ai engineering", "voice ai",
]

EXCLUDE_TITLE_EXTRA = [
    "intern", "internship", "co-op", "principal ", "staff ml",
    "short-form content", "content creator", "data collection",
]


def is_defense(text: Optional[str]) -> bool:
    if not text:
        return False
    t = text.lower()
    return any(kw in t for kw in DEFENSE_KEYWORDS)


def is_high_travel(description: Optional[str]) -> bool:
    if not description:
        return False
    text = description.lower()
    if re.search(r"\b(5[0-9]|[6-9]\d|100)\s*[-–]?\s*\d*\s*%\s*travel", text):
        return True
    if re.search(r"\btravel\b.{0,20}\b(5[0-9]|[6-9]\d|100)\s*%", text):
        return True
    if re.search(r"\b(frequent|extensive|heavy|significant)\s+travel\b", text):
        return True
    if re.search(r"\btravel(ing)?\s+(to|for)\s+(customer|client)\s+(offices?|sites?|locations?)\b", text):
        if not re.search(r"\b(occasional|minimal|rare|limited|some)\s+travel\b", text):
            return True
    return False


def is_non_ca_remote(location: Optional[str]) -> bool:
    if not location:
        return False
    loc = location.lower()
    if "remote" in loc:
        return False
    if re.search(r"\b(san diego|los angeles|l\.?a\.|san francisco|s\.?f\.|bay area|california|, ca\b)", loc):
        return False
    if loc in ("us", "usa", "united states") or "nationwide" in loc:
        return False
    FOREIGN = [
        "london", "uk", "u.k.", "stockholm", "berlin", "paris", "amsterdam",
        "toronto", "canada", "india", "australia", "singapore", "ireland", "dublin",
        "germany", "france", "spain", "netherlands", "israel", "brazil", "latam",
    ]
    if any(s in loc for s in FOREIGN):
        return True
    NON_CA = [
        ", ny", ", tx", ", wa", ", il", ", ma", ", co", ", ga", ", fl",
        ", nc", ", az", ", or", ", nv", ", ut", ", va", ", oh", ", mn", ", pa",
        "new york", "chicago", "seattle", "boston", "denver", "atlanta",
        "austin", "dallas", "houston", "miami", "portland", "phoenix", "salt lake",
    ]
    return any(s in loc for s in NON_CA)


def matches_role(title: str) -> bool:
    if not title:
        return False
    lower = title.lower()
    if any(kw in lower for kw in EXCLUDE_TITLE_PHRASES):
        return False
    if any(kw in lower for kw in EXCLUDE_TITLE_EXTRA):
        return False
    if any(kw in lower for kw in EXACT_ROLE_PHRASES):
        return True
    if "engineer" in lower and any(kw in lower for kw in AI_ENGINEER_SIGNALS):
        return True
    return False


# ── DB sync ───────────────────────────────────────────────────────────────────

@dataclass
class ScrapedJob:
    company_name: str
    job_title: str
    job_link: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    source: str = "Unknown"
    is_yc: bool = False


def _passes_filters(job: ScrapedJob) -> bool:
    """The scraper filter chain: drop defense, high-travel, and non-CA-remote jobs."""
    text = f"{job.description or ''} {job.job_title}"
    if is_defense(text) or is_defense(job.company_name):
        return False
    if is_high_travel(job.description):
        return False
    if is_non_ca_remote(job.location):
        return False
    return True


def sync_jobs_to_db(jobs: list[ScrapedJob], conn=None) -> dict:
    """Run the filter chain and upsert surviving jobs via the intake module.

    Pass ``conn`` to inject a psycopg2 connection (tests); otherwise one is
    opened and closed here. Dedup of companies and postings lives in ``intake``;
    this function owns only the filter chain and the on-existing update policy.
    """
    own_conn = conn is None
    if own_conn:
        conn = psycopg2.connect(settings.jobsearch_database_url)
    created = updated = skipped = 0
    try:
        for job in jobs:
            if not _passes_filters(job):
                skipped += 1
                continue

            source = "YC" if job.is_yc else job.source
            company_id, _ = intake.find_or_create_company_sync(conn, job.company_name, job.website)
            job_id, was_created, existing = intake.find_or_create_job_posting_sync(
                conn, company_id, job.job_title,
                link=job.job_link, source=source,
                description=job.description, location=job.location,
            )

            if was_created:
                try:
                    from tasks import embed_document
                    embed_document.delay("job_posting", job_id, f"{job.job_title} {job.job_link or ''}")
                except Exception:
                    pass
                created += 1
            elif existing["status"] != "new":
                skipped += 1
            elif job.job_link and existing["link"] != job.job_link:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE job_postings SET link = %s, description = COALESCE(%s, description), "
                        "location = COALESCE(%s, location) WHERE id = %s",
                        (job.job_link, job.description, job.location, job_id),
                    )
                conn.commit()
                updated += 1
            else:
                skipped += 1
    finally:
        if own_conn:
            conn.close()

    return {"created": created, "updated": updated, "skipped": skipped}
