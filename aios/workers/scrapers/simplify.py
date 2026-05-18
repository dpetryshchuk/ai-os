"""SimplifyJobs scraper — rewrite of apps/jobsearch/tools/scrape-simplifyjobs.ts."""
import re

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from workers.scrapers.utils import ScrapedJob, is_defense, is_non_ca_remote, matches_role, sync_jobs_to_db

README_URL = "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md"
MAX_AGE_DAYS = 2


def _parse_age(age_text: str) -> int:
    m = re.match(r"^(\d+)d$", age_text.strip())
    return int(m.group(1)) if m else 999


def _any_location_matches(location_text: str) -> bool:
    locations = [s.strip() for s in re.split(r"[\n,;]+", location_text) if s.strip()]
    if not locations:
        return True
    return any(not is_non_ca_remote(loc) for loc in locations)


def run(payload: dict, session: Session) -> None:
    try:
        with httpx.Client() as client:
            r = client.get(README_URL, timeout=30)
            r.raise_for_status()
            content = r.text
    except Exception as e:
        print(f"SimplifyJobs: failed to fetch README: {e}")
        return

    soup = BeautifulSoup(content, "html.parser")
    jobs: list[ScrapedJob] = []

    for row in soup.select("table tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        age = _parse_age(cells[4].get_text())
        if age > MAX_AGE_DAYS:
            continue

        role_raw = cells[1].get_text(strip=True)
        if "🔒" in role_raw:
            continue

        apply_link = cells[3].find("a")
        if not apply_link:
            continue
        apply_url = apply_link.get("href", "")

        company = (cells[0].find("a") or cells[0]).get_text(strip=True)
        role = re.sub(r"[🔥🇺🇸🛂🎓]", "", role_raw).strip()

        location_html = str(cells[2])
        location_text = re.sub(r"</?(?:br|BR)\s*/?>", "\n", location_html)
        location_text = re.sub(r"<[^>]+>", "", location_text).strip()

        if not company or not role:
            continue
        if is_defense(company) or is_defense(role):
            continue
        if not matches_role(role):
            continue
        if not _any_location_matches(location_text):
            continue

        jobs.append(ScrapedJob(
            company_name=company,
            job_title=role,
            job_link=apply_url,
            location=location_text.split("\n")[0].strip(),
            source="SimplifyJobs",
        ))

    if jobs:
        result = sync_jobs_to_db(jobs)
        print(f"SimplifyJobs done: +{result['created']} new | ~{result['updated']} updated | {result['skipped']} skipped")
    else:
        print("SimplifyJobs: no matches found")
