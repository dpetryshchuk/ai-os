"""SD-area job scraper using python-jobspy (Indeed + LinkedIn)."""
import logging
import re
from datetime import date, datetime, timezone

from .utils import ScrapedJob, is_defense, sync_jobs_to_db

logger = logging.getLogger(__name__)

SD_LOCATIONS = [
    "San Diego, CA",
    "Carlsbad, CA",
    "Oceanside, CA",
]

SEARCH_TERMS = [
    "software engineer",
    "AI engineer",
    "machine learning",
    "software developer",
    "full stack",
]

# Roles to skip regardless of location
SKIP_TITLES = [
    "intern", "internship", "co-op", "principal ", "staff ",
    "vp of", "vice president", "director of", "head of engineering",
    "data collection", "content creator", "short-form",
]

SD_AREA_KEYWORDS = [
    "san diego", "carlsbad", "oceanside", "encinitas", "la jolla",
    "del mar", "escondido", "chula vista", "national city", "el cajon",
    "santee", "vista, ca", "solana beach", "coronado",
    "san marcos", "poway", "ramona", "lemon grove", "imperial beach",
    # also accept remote
    "remote",
]


def _is_sd_or_remote(location: str | None) -> bool:
    if not location:
        return False
    loc = location.lower()
    return any(kw in loc for kw in SD_AREA_KEYWORDS)


def _clean(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return None if s in ("nan", "", "None") else s


def _scrape_once(site: str, term: str, location: str) -> list[ScrapedJob]:
    from jobspy import scrape_jobs
    df = scrape_jobs(
        site_name=[site],
        search_term=term,
        location=location,
        results_wanted=30,
        hours_old=25,
        country_indeed="USA",
        verbose=0,
    )
    jobs: list[ScrapedJob] = []
    for _, row in df.iterrows():
        company = _clean(row.get("company") if hasattr(row, "get") else getattr(row, "company", None))
        title = _clean(row.get("title") if hasattr(row, "get") else getattr(row, "title", None))
        if not company or not title:
            continue

        title_lower = title.lower()
        if any(kw in title_lower for kw in SKIP_TITLES):
            continue
        if is_defense(title) or is_defense(company):
            continue

        loc = _clean(row.get("location") if hasattr(row, "get") else getattr(row, "location", None))
        if not _is_sd_or_remote(loc):
            continue

        jobs.append(ScrapedJob(
            company_name=company,
            job_title=title,
            job_link=_clean(row.get("job_url") if hasattr(row, "get") else getattr(row, "job_url", None)),
            description=(_clean(row.get("description") if hasattr(row, "get") else getattr(row, "description", None)) or "")[:3000] or None,
            website=_clean(row.get("company_url") if hasattr(row, "get") else getattr(row, "company_url", None)),
            location=loc,
            source="Indeed" if site == "indeed" else "LinkedIn",
        ))
    return jobs


def run(payload: dict, session) -> dict:
    try:
        import jobspy  # noqa: F401
    except ImportError:
        raise RuntimeError("python-jobspy not installed — add to requirements.txt")

    all_jobs: list[ScrapedJob] = []
    seen: set[str] = set()

    for site in ("indeed", "linkedin"):
        for term in SEARCH_TERMS:
            for location in SD_LOCATIONS:
                try:
                    batch = _scrape_once(site, term, location)
                    for job in batch:
                        key = f"{job.company_name.lower()}::{job.job_title.lower()}"
                        if key not in seen:
                            seen.add(key)
                            all_jobs.append(job)
                except Exception as exc:
                    logger.warning("jobspy %s/%s@%s: %s", site, term, location, exc)

    result = sync_jobs_to_db(all_jobs)
    logger.info("SD scrape complete: %s", result)

    if result.get("created", 0) > 0:
        _maybe_notify(result["created"], all_jobs[:result["created"]])

    return result


def _maybe_notify(count: int, new_jobs: list[ScrapedJob]) -> None:
    from config import settings
    if not settings.notify_email or not settings.smtp_user:
        return
    try:
        import smtplib
        from email.mime.text import MIMEText
        lines = [f"• {j.job_title} @ {j.company_name} — {j.location or 'SD area'}" for j in new_jobs[:20]]
        body = f"{count} new SD-area job(s) found:\n\n" + "\n".join(lines)
        msg = MIMEText(body)
        msg["Subject"] = f"[AI OS] {count} new SD job lead{'s' if count != 1 else ''}"
        msg["From"] = settings.smtp_user
        msg["To"] = settings.notify_email
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.sendmail(settings.smtp_user, [settings.notify_email], msg.as_string())
        logger.info("Notification sent to %s", settings.notify_email)
    except Exception as exc:
        logger.warning("Notification failed: %s", exc)
