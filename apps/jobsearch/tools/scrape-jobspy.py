#!/usr/bin/env python3
"""JobSpy scraper — LinkedIn + Indeed → Postgres"""

import os
import re
import secrets
import sys
from datetime import date
from pathlib import Path

import psycopg2
from dotenv import dotenv_values
from jobspy import scrape_jobs

sys.stdout.reconfigure(encoding='utf-8')

ENV = dotenv_values(Path(__file__).parent.parent / '.env')
DATABASE_URL = os.environ.get('DATABASE_URL') or ENV.get('DATABASE_URL')
TODAY = date.today().isoformat()
DRY_RUN = '--dry' in sys.argv

# ── Role filters ──────────────────────────────────────────────────────────────

EXACT_ROLE_PHRASES = [
    'forward deployed', 'fde', 'solutions engineer', 'sales engineer',
    'implementation engineer', "founder's associate", 'founders associate',
    'ai product', 'gtm engineer', 'customer engineer', 'technical account manager',
    'field engineer', 'automation engineer', 'ai product manager',
]

AI_ENGINEER_SIGNALS = [
    'ai', 'ml', 'machine learning', 'automation', 'llm', 'nlp', 'agentic', 'agent', 'robotics',
]

EXCLUDE_TITLE_PHRASES = [
    'founding engineer', 'founding full stack', 'founding fullstack', 'founding backend',
    'founding frontend', 'founding ml', 'founding machine learning', 'founding ai engineer',
    'founding software engineer', 'founding ai software',
    'senior software engineer', 'staff software engineer',
    'senior full stack', 'senior fullstack', 'senior backend', 'senior frontend', 'senior full-stack',
    'backend engineer', 'frontend engineer', 'fullstack engineer',
    'full stack engineer', 'full-stack engineer',
    'software engineer, data', 'data engineer', 'data platform',
    'devops engineer', 'infrastructure engineer',
    'research engineer', 'ml researcher', 'research scientist',
    'machine learning engineer', 'ml engineer',
    'software / ai engineering', 'voice ai',
]

EXCLUDE_TITLE_EXTRA = [
    'intern', 'internship', 'co-op', 'principal ', 'staff ml',
    'short-form content', 'content creator', 'data collection',
]

DEFENSE_KEYWORDS = [
    'defense', 'defence', 'military', 'weapon', 'dod', 'national security', 'aerospace defense',
]

FOREIGN_LOCATIONS = [
    'london', 'uk', 'u.k.', 'stockholm', 'berlin', 'paris', 'amsterdam',
    'toronto', 'canada', 'india', 'australia', 'singapore', 'ireland', 'dublin',
    'germany', 'france', 'spain', 'netherlands', 'israel', 'brazil', 'latam',
    'dubai', 'uae', 'philippines',
]

NON_CA_STATES = [
    ', ny', ', tx', ', wa', ', il', ', ma', ', co', ', ga', ', fl',
    ', nc', ', az', ', or', ', nv', ', ut', ', va', ', oh', ', mn', ', pa',
    'new york', 'chicago', 'seattle', 'boston', 'denver', 'atlanta',
    'austin', 'dallas', 'houston', 'miami', 'portland', 'phoenix', 'salt lake',
]


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
    if 'engineer' in lower and any(kw in lower for kw in AI_ENGINEER_SIGNALS):
        return True
    return False


def is_defense(text: str) -> bool:
    return any(kw in text.lower() for kw in DEFENSE_KEYWORDS)


def is_high_travel(text: str) -> bool:
    t = text.lower()
    if re.search(r'\b(5[0-9]|[6-9]\d|100)\s*[-–]?\s*\d*\s*%\s*travel', t):
        return True
    if re.search(r'\btravel\b.{0,20}\b(5[0-9]|[6-9]\d|100)\s*%', t):
        return True
    if re.search(r'\b(frequent|extensive|heavy|significant)\s+travel\b', t):
        return True
    if (re.search(r'\btravel(ing)?\s+(to|for)\s+(customer|client)\s+(offices?|sites?|locations?)\b', t) and
            not re.search(r'\b(occasional|minimal|rare|limited|some)\s+travel\b', t)):
        return True
    return False


def is_non_ca_remote(location: str) -> bool:
    loc = location.lower()
    if 'remote' in loc:
        return False
    if re.search(r'\b(san diego|los angeles|l\.?a\.|san francisco|s\.?f\.|bay area|california|, ca\b)', loc):
        return False
    if loc in ('us', 'usa', 'united states', 'us, us') or 'nationwide' in loc:
        return False
    if any(s in loc for s in FOREIGN_LOCATIONS):
        return True
    if any(s in loc for s in NON_CA_STATES):
        return True
    return False


# ── DB helpers ────────────────────────────────────────────────────────────────

def random_id() -> str:
    return secrets.token_hex(8)


def load_existing(cur):
    cur.execute('SELECT id, name FROM companies')
    company_map = {row[1].lower(): row[0] for row in cur.fetchall()}
    cur.execute('SELECT id, company_id, title, link, status FROM job_postings')
    posting_map = {}
    for row in cur.fetchall():
        key = f"{row[1]}::{(row[2] or '').lower()}"
        posting_map[key] = {'id': row[0], 'link': row[3], 'status': row[4]}
    return company_map, posting_map


def upsert_company(cur, company_map, name: str) -> str:
    if name.lower() in company_map:
        return company_map[name.lower()]
    cid = random_id()
    cur.execute('INSERT INTO companies (id, name) VALUES (%s, %s)', (cid, name))
    company_map[name.lower()] = cid
    return cid


def sync_to_db(jobs: list[dict]) -> tuple[int, int, int]:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    company_map, posting_map = load_existing(cur)
    created = updated = skipped = 0

    for job in jobs:
        title = job['title']
        company = job['company']
        location = job['location']
        description = job['description']
        url = job['url']
        source = job['source']

        if is_defense(f"{title} {company} {description}"):
            skipped += 1
            continue
        if is_high_travel(description):
            print(f'  ✗ SKIP {company} — high travel')
            skipped += 1
            continue
        if is_non_ca_remote(location):
            print(f'  ✗ SKIP {company} — location: {location}')
            skipped += 1
            continue

        company_id = upsert_company(cur, company_map, company)
        key = f"{company_id}::{title.lower()}"
        existing = posting_map.get(key)

        if not existing:
            pid = random_id()
            cur.execute(
                "INSERT INTO job_postings (id, company_id, title, link, source, scraped_date, status, description)"
                " VALUES (%s, %s, %s, %s, %s, %s, 'new', %s)",
                (pid, company_id, title, url or None, source, TODAY, description[:1500] if description else None),
            )
            posting_map[key] = {'id': pid, 'link': url, 'status': 'new'}
            print(f'  ✓ NEW  {company} — {title}')
            created += 1
        elif existing['status'] != 'new':
            skipped += 1
        elif url and existing['link'] != url:
            cur.execute(
                'UPDATE job_postings SET link = COALESCE(%s, link), description = COALESCE(%s, description) WHERE id = %s',
                (url or None, description[:1500] if description else None, existing['id']),
            )
            print(f'  ↑ UPD  {company} — {title}')
            updated += 1
        else:
            skipped += 1

    conn.commit()
    cur.close()
    conn.close()
    return created, updated, skipped


# ── Search config ─────────────────────────────────────────────────────────────

SEARCHES = [
    ('forward deployed engineer',       ['linkedin', 'indeed'], 'United States'),
    ('solutions engineer AI',           ['linkedin'],           'United States'),
    ('GTM engineer',                    ['linkedin'],           'United States'),
    ('sales engineer AI',               ['linkedin'],           'United States'),
    ('automation engineer AI',          ['linkedin', 'indeed'], 'United States'),
    ('technical account manager AI',    ['linkedin'],           'United States'),
    ('AI engineer',                     ['linkedin', 'indeed'], 'San Diego, CA'),
    ('solutions engineer',              ['linkedin'],           'San Diego, CA'),
    ('forward deployed engineer',       ['linkedin'],           'San Diego, CA'),
]


def clean(val) -> str:
    s = str(val) if val is not None else ''
    return '' if s == 'nan' else s


def run():
    seen_urls: set[str] = set()
    all_jobs: list[dict] = []

    for search_term, sites, search_location in SEARCHES:
        is_sd = 'San Diego' in search_location
        print(f'Searching {", ".join(sites)} [{search_location}]: "{search_term}"...')
        try:
            df = scrape_jobs(
                site_name=sites,
                search_term=search_term,
                location=search_location,
                results_wanted=20,
                hours_old=72,
                country_indeed='USA',
                linkedin_fetch_description=True,
            )
            matches = 0
            for _, row in df.iterrows():
                url = clean(row.get('job_url'))
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)

                title = clean(row.get('title'))
                if not matches_role(title) and not is_sd:
                    continue

                row_location = clean(row.get('location'))
                if row.get('is_remote'):
                    row_location = f'Remote, {row_location}' if row_location else 'Remote'

                site = clean(row.get('site'))
                source = {'linkedin': 'LinkedIn', 'indeed': 'Indeed'}.get(site, site.capitalize())

                all_jobs.append({
                    'title': title,
                    'company': clean(row.get('company')),
                    'location': row_location,
                    'description': clean(row.get('description')),
                    'url': url,
                    'source': source,
                })
                matches += 1
            print(f'  {matches} role matches ({len(df)} total fetched)')
        except Exception as e:
            print(f'  Error: {e}')

    print(f'\nTotal unique role matches: {len(all_jobs)}')

    if DRY_RUN:
        for job in all_jobs:
            print(f"  {job['company']} — {job['title']} ({job['location']})")
            print(f"    {job['url']}")
        return

    created, updated, skipped = sync_to_db(all_jobs)
    print(f'Done. +{created} new | ~{updated} updated | {skipped} skipped')


if __name__ == '__main__':
    run()
