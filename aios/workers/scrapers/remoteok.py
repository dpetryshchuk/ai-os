"""RemoteOK scraper — rewrite of apps/jobsearch/tools/scrape-remoteok.ts."""
import re
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from workers.scrapers.utils import ScrapedJob, is_defense, matches_role, sync_jobs_to_db

TAG_QUERIES = ["engineer", "engineer,ai", "technical,ai", "executive,ai"]
MAX_AGE_DAYS = 2


def _is_recent(epoch: Optional[int]) -> bool:
    if not epoch:
        return True
    age_seconds = time.time() - epoch
    return age_seconds <= MAX_AGE_DAYS * 86400


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "").strip()


def _fetch_remoteok(client: httpx.Client, tags: str) -> list[dict]:
    r = client.get(
        f"https://remoteok.com/api?tags={tags}",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()
    return data[1:] if isinstance(data, list) else []


def run(payload: dict, session: Session) -> None:
    seen: set[str] = set()
    all_jobs: list[ScrapedJob] = []

    with httpx.Client() as client:
        for i, tags in enumerate(TAG_QUERIES):
            if i > 0:
                time.sleep(10)
            try:
                raw_jobs = _fetch_remoteok(client, tags)
                for job in raw_jobs:
                    jid = str(job.get("slug") or job.get("id") or "")
                    if jid in seen:
                        continue
                    seen.add(jid)
                    if not _is_recent(job.get("epoch")):
                        continue
                    description = _strip_html(job.get("description") or "")[:1500]
                    company_name = job.get("company") or ""
                    job_title = job.get("position") or ""
                    if not matches_role(job_title):
                        continue
                    if is_defense(description) or is_defense(company_name):
                        continue
                    all_jobs.append(ScrapedJob(
                        company_name=company_name,
                        job_title=job_title,
                        job_link=job.get("apply_url") or job.get("url") or f"https://remoteok.com/l/{job.get('slug', '')}",
                        description=description,
                        location=job.get("location") or "Remote",
                        source="RemoteOK",
                    ))
            except Exception as e:
                print(f"RemoteOK error for tags={tags}: {e}")

    if all_jobs:
        result = sync_jobs_to_db(all_jobs)
        print(f"RemoteOK done: +{result['created']} new | ~{result['updated']} updated | {result['skipped']} skipped")
    else:
        print("RemoteOK: no matches found")
