"""Filters and DB sync helpers shared by all scrapers."""
import re
import secrets
from dataclasses import dataclass, field
from typing import Optional

import psycopg2
import psycopg2.extras

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


def _new_id() -> str:
    return secrets.token_hex(8)


def sync_jobs_to_db(jobs: list[ScrapedJob]) -> dict:
    conn = psycopg2.connect(settings.jobsearch_database_url)
    created = updated = skipped = 0
    try:
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT id, name FROM companies")
                company_map = {r["name"].lower(): r["id"] for r in cur.fetchall()}
                cur.execute("SELECT id, company_id, title, link, status FROM job_postings")
                posting_map = {
                    f"{r['company_id']}::{(r['title'] or '').lower()}": r
                    for r in cur.fetchall()
                }

            for job in jobs:
                text = f"{job.description or ''} {job.job_title}"
                if is_defense(text) or is_defense(job.company_name):
                    skipped += 1
                    continue
                if is_high_travel(job.description):
                    skipped += 1
                    continue
                if is_non_ca_remote(job.location):
                    skipped += 1
                    continue

                source = "YC" if job.is_yc else job.source

                company_id = company_map.get(job.company_name.lower())
                if not company_id:
                    company_id = _new_id()
                    with conn.cursor() as cur:
                        cur.execute(
                            "INSERT INTO companies (id, name, website) VALUES (%s, %s, %s) "
                            "ON CONFLICT (id) DO NOTHING",
                            (company_id, job.company_name, job.website),
                        )
                    conn.commit()
                    company_map[job.company_name.lower()] = company_id

                key = f"{company_id}::{job.job_title.lower()}"
                existing = posting_map.get(key)

                if not existing:
                    with conn.cursor() as cur:
                        from datetime import date
                        cur.execute(
                            "INSERT INTO job_postings (id, company_id, title, link, source, scraped_date, status, description) "
                            "VALUES (%s, %s, %s, %s, %s, %s, 'new', %s)",
                            (
                                _new_id(), company_id, job.job_title, job.job_link,
                                source, date.today().isoformat(), job.description,
                            ),
                        )
                    conn.commit()
                    created += 1
                elif existing["status"] != "new":
                    skipped += 1
                elif job.job_link and existing["link"] != job.job_link:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE job_postings SET link = %s, description = COALESCE(%s, description) WHERE id = %s",
                            (job.job_link, job.description, existing["id"]),
                        )
                    conn.commit()
                    updated += 1
                else:
                    skipped += 1
    finally:
        conn.close()

    return {"created": created, "updated": updated, "skipped": skipped}
