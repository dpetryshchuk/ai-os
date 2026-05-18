"""YC scraper — rewrite of apps/jobsearch/tools/scrape-yc-deep.ts."""
import time
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from workers.scrapers.utils import ScrapedJob, is_defense, is_non_ca_remote, matches_role, sync_jobs_to_db

YC_API = "https://api.ycombinator.com/v0.1"
WAAS = "https://www.workatastartup.com"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
BATCHES = ["W26", "F25", "S25", "W25", "S24", "W24"]
FETCH_DELAY = 0.4


def _fetch_batch_companies(client: httpx.Client, batch: str) -> list[dict]:
    companies = []
    page, total_pages = 1, 1
    while page <= total_pages:
        r = client.get(
            f"{YC_API}/companies",
            params={"batch": batch, "page": page, "isHiring": "true"},
            headers={"User-Agent": UA},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        companies.extend(data.get("companies") or [])
        total_pages = data.get("totalPages", 1)
        page += 1
    return companies


def _fetch_company_jobs(client: httpx.Client, slug: str) -> list[dict]:
    try:
        r = client.get(f"{WAAS}/companies/{slug}", headers={"User-Agent": UA, "Accept": "text/html"}, timeout=10)
        if not r.is_success:
            return []
        html = r.text
        import re
        match = re.search(r'data-page="([^"]+)"', html)
        if not match:
            return []
        import json, html as html_lib
        data = json.loads(html_lib.unescape(match.group(1)))
        return (data.get("props") or {}).get("company", {}).get("jobs") or []
    except Exception:
        return []


def run(payload: dict, session: Session) -> None:
    all_jobs: list[ScrapedJob] = []
    seen: set[str] = set()

    with httpx.Client() as client:
        for batch in BATCHES:
            try:
                companies = _fetch_batch_companies(client, batch)
            except Exception as e:
                print(f"YC batch {batch} error: {e}")
                continue

            for company in companies:
                name = company.get("name", "")
                slug = company.get("slug", "")
                if is_defense(company.get("oneLiner")) or is_defense(name):
                    continue
                try:
                    jobs = _fetch_company_jobs(client, slug)
                    for job in jobs:
                        title = job.get("title", "")
                        if not matches_role(title):
                            continue
                        if is_defense(title):
                            continue
                        loc = job.get("location", "")
                        if loc and is_non_ca_remote(loc):
                            continue
                        key = f"{name.lower()}|{title.lower()}"
                        if key in seen:
                            continue
                        seen.add(key)
                        one_liner = company.get("oneLiner") or company.get("longDescription", "")[:200] or ""
                        all_jobs.append(ScrapedJob(
                            company_name=name,
                            job_title=title,
                            job_link=f"{WAAS}/jobs/{job['id']}" if job.get("id") else f"{WAAS}/companies/{slug}",
                            description=one_liner,
                            website=f"{WAAS}/companies/{slug}",
                            location=loc,
                            source="YC",
                            is_yc=True,
                        ))
                    time.sleep(FETCH_DELAY)
                except Exception:
                    continue

    if all_jobs:
        result = sync_jobs_to_db(all_jobs)
        print(f"YC scrape done: +{result['created']} new | ~{result['updated']} updated | {result['skipped']} skipped")
    else:
        print("YC scrape: no matches found")
