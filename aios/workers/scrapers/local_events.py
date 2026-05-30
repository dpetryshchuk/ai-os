"""Local events RSS scraper — Menifee & Temecula, CA.

Pulls RSS feeds from city calendars, tourism board, and library system.
Normalizes into a common event schema, deduplicates, and saves to DB.
"""

import hashlib
import json
import re
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
import xml.etree.ElementTree as ET

from config import settings


# ── Feed definitions ──────────────────────────────────────────────────────────

FEEDS = [
    {
        "source": "Visit Temecula Valley",
        "url": "https://www.visittemeculavalley.com/event/rss/",
        "city": "Temecula",
        "type": "rss_simpleview",
        "category_hint": "tourism",
    },
    {
        "source": "City of Menifee Events",
        "url": "https://www.cityofmenifee.us/RSSFeed.aspx?ModID=58&CID=Events-27",
        "city": "Menifee",
        "type": "rss_civicengage",
        "category_hint": "municipal",
    },
    {
        "source": "City of Temecula Events",
        "url": "https://temeculaca.gov/RSSFeed.aspx?ModID=58&CID=Temecula-Events-23",
        "city": "Temecula",
        "type": "rss_civicengage",
        "category_hint": "municipal",
    },
    {
        "source": "Temecula Library",
        "url": "https://temeculaca.gov/RSSFeed.aspx?ModID=58&CID=Library-34",
        "city": "Temecula",
        "type": "rss_civicengage",
        "category_hint": "library",
    },
]

# CivicEngage uses different namespace URLs per city. We match by local-name
# since the prefix varies (calendarEvent, ev, etc.)
CIVIC_NS_LOCAL = "{https://www.cityofmenifee.us/Calendar.aspx}"
CIVIC_NS_TEMECULA = "{https://temeculaca.gov/Calendar.aspx}"


def _find_civic_element(item: ET.Element, local_name: str) -> Optional[ET.Element]:
    """Find a CivicEngage custom element regardless of namespace prefix."""
    for el in item:
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if tag == local_name:
            return el
    return None


def run(payload: dict, session) -> dict:
    """Pull all event feeds, normalize, deduplicate, return structured data.

    Returns a JSON-serializable list of events suitable for brief generation.
    """
    all_events = []
    now = datetime.utcnow()
    week_from_now = now + timedelta(days=7)

    for feed in FEEDS:
        try:
            events = _fetch_feed(feed, now, week_from_now)
            all_events.extend(events)
        except Exception as e:
            print(f"[events] Failed {feed['source']}: {e}")

    # Deduplicate by (normalized_title, date)
    seen = set()
    unique = []
    for ev in all_events:
        key = _dedup_key(ev)
        if key not in seen:
            seen.add(key)
            unique.append(ev)

    # Sort by date
    unique.sort(key=lambda e: e.get("start_date", "9999"))

    # ── Optional: save to vault ──
    if payload.get("save_to_vault"):
        _save_brief(unique, settings.vault_dir)

    return {
        "total_events": len(unique),
        "sources": len(FEEDS),
        "events": unique,
        "generated_at": now.isoformat(),
    }


def _fetch_feed(feed: dict, now: datetime, cutoff: datetime) -> list[dict]:
    """Fetch and parse a single RSS feed, return normalized event dicts."""
    resp = requests.get(feed["url"], timeout=30, headers={
        "User-Agent": "MenifeeEventsBot/1.0",
    })
    resp.raise_for_status()

    root = ET.fromstring(resp.content)
    events = []

    for item in root.findall(".//item"):
        event = _parse_item(item, feed, now, cutoff)
        if event and event.get("start_date") >= now.strftime("%Y-%m-%d"):
            if event["start_date"] <= cutoff.strftime("%Y-%m-%d"):
                events.append(event)

    return events


def _parse_item(item: ET.Element, feed: dict, now: datetime, cutoff: datetime) -> Optional[dict]:
    """Parse an RSS <item> into a normalized event dict."""
    title_el = item.find("title")
    desc_el = item.find("description")
    link_el = item.find("link")
    pubdate_el = item.find("pubDate")

    title = title_el.text.strip() if title_el is not None and title_el.text else "Untitled"
    description = _strip_html(desc_el.text) if desc_el is not None and desc_el.text else ""
    link = link_el.text.strip() if link_el is not None and link_el.text else ""
    pubdate = pubdate_el.text if pubdate_el is not None and pubdate_el.text else ""

    # Extract date — CivicEngage puts it in a custom namespace
    start_date = None
    end_date = None

    if feed["type"] == "rss_civicengage":
        dates_el = _find_civic_element(item, "EventDates")
        times_el = _find_civic_element(item, "EventTimes")
        location_el = _find_civic_element(item, "Location")

        if dates_el is not None and dates_el.text:
            date_parts = dates_el.text.split(" to ")
            start_date = _parse_date(date_parts[0])
            if len(date_parts) > 1:
                end_date = _parse_date(date_parts[1])

        time_str = times_el.text if times_el is not None and times_el.text else ""
        location = location_el.text if location_el is not None and location_el.text else ""
    else:
        # SimpleView RSS: date embedded in description HTML or pubdate
        time_str = ""
        location = ""
        start_date = _extract_date_from_text(description + " " + pubdate)

    if not start_date:
        return None

    # Clean the description — strip image tags, excessive whitespace
    description = re.sub(r'\s+', ' ', description).strip()
    if len(description) > 500:
        description = description[:497] + "..."

    # Category inference
    cat = feed.get("category_hint", "general")
    text_lower = (title + " " + description).lower()
    if any(w in text_lower for w in ["concert", "music", "jazz", "band", "live"]):
        cat = "music"
    elif any(w in text_lower for w in ["market", "food", "wine", "beer", "brew", "dinner"]):
        cat = "food & drink"
    elif any(w in text_lower for w in ["art", "gallery", "paint", "museum", "exhibit"]):
        cat = "arts"
    elif any(w in text_lower for w in ["family", "kids", "storytime", "children"]):
        cat = "family"
    elif any(w in text_lower for w in ["sport", "yoga", "fitness", "run", "hike"]):
        cat = "sports & outdoors"
    elif any(w in text_lower for w in ["business", "chamber", "networking"]):
        cat = "business"
    elif any(w in text_lower for w in ["library", "reading", "book"]):
        cat = "library"
    elif any(w in text_lower for w in ["festival", "celebration", "juneteenth", "holiday"]):
        cat = "festival"

    return {
        "title": title,
        "description": description,
        "url": link,
        "start_date": start_date,
        "end_date": end_date or start_date,
        "time": time_str,
        "location": location,
        "city": feed["city"],
        "source": feed["source"],
        "category": cat,
    }


def _parse_date(s: str) -> Optional[str]:
    """Parse various date formats to YYYY-MM-DD."""
    s = s.strip()
    formats = [
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m/%d/%y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%A, %B %d, %Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _extract_date_from_text(text: str) -> Optional[str]:
    """Try to extract a date from free text."""
    # Look for patterns like "June 15, 2026" or "06/15/2026"
    months = r"(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
    m = re.search(rf"{months}\s+\d{{1,2}},\s+\d{{4}}", text)
    if m:
        return _parse_date(m.group())
    m = re.search(r"\d{1,2}/\d{1,2}/\d{4}", text)
    if m:
        return _parse_date(m.group())
    return None


def _strip_html(text: str) -> str:
    """Remove HTML tags from text."""
    return re.sub(r"<[^>]+>", "", text)


def _dedup_key(event: dict) -> str:
    """Create a deduplication key from normalized title + date."""
    title = re.sub(r"[^a-z0-9]", "", event.get("title", "").lower())[:50]
    return f"{title}|{event.get('start_date', '')}"


def _save_brief(events: list[dict], vault_dir: str):
    """Save a markdown brief to the vault."""
    import os
    from datetime import datetime

    now = datetime.utcnow()
    week_end = now + timedelta(days=7)
    filename = f"events-{now.strftime('%Y-%m-%d')}.md"
    path = os.path.join(vault_dir, "Briefs", filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    # Group by day
    by_day = {}
    for ev in events:
        day = ev["start_date"]
        by_day.setdefault(day, []).append(ev)

    lines = [
        f"# Events This Week: {now.strftime('%b %d')} – {week_end.strftime('%b %d, %Y')}",
        "",
        f"Menifee & Temecula, CA",
        f"Generated: {now.strftime('%A %B %d, %Y')}",
        "",
    ]

    for day in sorted(by_day):
        day_events = by_day[day]
        day_name = datetime.strptime(day, "%Y-%m-%d").strftime("%A, %B %d")
        lines.append(f"## {day_name}")
        lines.append("")
        for ev in day_events:
            time_str = f" — {ev['time']}" if ev.get("time") else ""
            loc = f" 📍 {ev['location']}" if ev.get("location") else ""
            lines.append(f"### {ev['title']}")
            lines.append(f"**{ev['city']}**{loc}{time_str} | [{ev['source']}]({ev['url']})")
            if ev.get("description"):
                lines.append(f"> {ev['description'][:200]}")
            lines.append("")

    with open(path, "w") as f:
        f.write("\n".join(lines))
