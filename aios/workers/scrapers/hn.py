"""HN 'Who is Hiring' scraper — rewrite of apps/jobsearch/tools/scrape-hn-jobs.ts."""
import re
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from workers.scrapers.utils import (
    EXACT_ROLE_PHRASES,
    ScrapedJob,
    is_defense,
    matches_role,
    sync_jobs_to_db,
)

ROLE_QUERIES = [
    "forward deployed engineer", "AI automation engineer", "solutions engineer AI",
    "sales engineer", "implementation engineer AI", "AI agent engineer",
    "customer engineer", "founder associate",
]


def _strip_html(html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"<p>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    for ent, rep in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                     ("&quot;", '"'), ("&#x27;", "'"), ("&#x2F;", "/"), ("&nbsp;", " ")]:
        text = text.replace(ent, rep)
    return text.strip()


def _parse_hn_comment(hit: dict) -> Optional[ScrapedJob]:
    raw = _strip_html(hit.get("comment_text") or "")
    lines = [l.strip() for l in raw.split("\n") if l.strip()]
    if not lines:
        return None

    first_line = lines[0]
    first_seg = first_line.split("|")[0]
    company_name = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", first_seg)
    company_name = re.sub(r"https?://\S+", "", company_name)
    company_name = re.sub(r"\([^)]*\)?", "", company_name)
    company_name = re.sub(r"[-–]\s*$", "", company_name)
    company_name = re.sub(r"\s+", " ", company_name).strip()

    if not company_name or len(company_name) > 70:
        return None

    header_lower = first_line.lower()
    has_ca = bool(re.search(
        r"\b(california|san francisco|\bsf\b|bay area|los angeles|\bla\b|san jose|palo alto|"
        r"menlo park|mountain view|santa clara|redwood city|sunnyvale|oakland|berkeley|"
        r"san diego|santa monica|cupertino)\b",
        header_lower,
    ))
    has_remote = bool(re.search(r"\bremote\b", first_line, re.IGNORECASE))
    has_non_us = bool(re.search(
        r"\b(india|uk|eu|europe|canada|australia|brazil|mexico|worldwide|global|anywhere in the world)\b",
        raw, re.IGNORECASE,
    ))
    has_remote_us = has_remote and not has_non_us

    if not has_ca and not has_remote_us:
        return None
    location = "California / Remote" if (has_ca and has_remote_us) else ("California" if has_ca else "Remote (US)")

    if is_defense(company_name) or is_defense(raw):
        return None

    role = ""
    for line in lines[:8]:
        for seg in re.split(r"[|,/]", line):
            seg = seg.strip()
            if 5 < len(seg) < 70 and matches_role(seg):
                role = re.sub(r"^[^a-zA-Z]+", "", seg).rstrip("*•-").strip()
                break
        if role:
            break

    if not role:
        snippet = raw[:300].lower()
        for phrase in EXACT_ROLE_PHRASES:
            if phrase in snippet:
                role = phrase.title()
                break

    if not role:
        return None

    desc_lines = [
        l for l in lines[1:]
        if not l.startswith("http") and len(l) > 30
        and not re.match(r"^(apply|email|contact|reach out|dm|send)", l, re.IGNORECASE)
    ]
    description = " ".join(desc_lines[:8])[:1500]

    urls = [m.group(0).rstrip(".,)") for m in re.finditer(r"https?://[^\s\n|)<>]+", raw)]
    careers_url = next(
        (u for u in urls if re.search(r"jobs|careers|apply|hire|work|join|ashby|greenhouse|lever|workable", u, re.IGNORECASE)),
        None,
    )
    job_link = careers_url or (urls[0] if urls else f"https://news.ycombinator.com/item?id={hit['objectID']}")

    return ScrapedJob(
        company_name=company_name,
        job_title=role,
        job_link=job_link,
        description=description,
        location=location,
        source="HN",
    )


def _get_latest_hiring_thread_id(client: httpx.Client) -> int:
    r = client.get("https://hacker-news.firebaseio.com/v0/user/whoishiring.json", timeout=10)
    r.raise_for_status()
    data = r.json()
    top_id = data["submitted"][0]
    item = client.get(f"https://hacker-news.firebaseio.com/v0/item/{top_id}.json", timeout=10).json()
    if "who is hiring" not in (item.get("title") or "").lower():
        raise ValueError(f"Top submission is not a Who is Hiring thread: {item.get('title')}")
    return top_id


def _search_algolia(client: httpx.Client, thread_id: int, query: str) -> list[dict]:
    url = (
        f"https://hn.algolia.com/api/v1/search"
        f"?tags=comment,story_{thread_id}&query={query}&hitsPerPage=50"
    )
    r = client.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
    r.raise_for_status()
    return r.json().get("hits") or []


def run(payload: dict, session: Session) -> None:
    with httpx.Client() as client:
        try:
            thread_id = _get_latest_hiring_thread_id(client)
        except Exception as e:
            print(f"HN: could not fetch thread: {e}")
            return

        seen_ids: set[str] = set()
        seen_companies: set[str] = set()
        all_jobs: list[ScrapedJob] = []

        for query in ROLE_QUERIES:
            try:
                hits = _search_algolia(client, thread_id, query)
                for hit in hits:
                    oid = hit.get("objectID", "")
                    if oid in seen_ids:
                        continue
                    seen_ids.add(oid)
                    job = _parse_hn_comment(hit)
                    if not job:
                        continue
                    if job.company_name.lower() in seen_companies:
                        continue
                    seen_companies.add(job.company_name.lower())
                    all_jobs.append(job)
            except Exception as e:
                print(f"HN Algolia error for '{query}': {e}")

    if all_jobs:
        result = sync_jobs_to_db(all_jobs)
        print(f"HN scrape done: +{result['created']} new | ~{result['updated']} updated | {result['skipped']} skipped")
    else:
        print("HN scrape: no matches found")
