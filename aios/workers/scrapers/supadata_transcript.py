"""Supadata YouTube transcript worker — pull transcripts and save to vault.

Uses Supadata API (free tier: 100/month). Falls back gracefully.
"""

import json
import os
from datetime import datetime

import requests

from config import settings


def run(payload: dict, session) -> dict:
    """Pull YouTube transcript via Supadata and save to vault.

    Payload:
        video_id: str or url: str — YouTube video ID or full URL
        title: str — optional, auto-detected from video metadata
        segment_start: float — optional, only save from this offset (seconds)
        segment_end: float — optional
        include_summary: bool — also generate AI summary (default: False)
    """
    api_key = os.getenv("SUPADATA_API_KEY", "")
    if not api_key:
        api_key = settings.supadata_api_key if hasattr(settings, 'supadata_api_key') else ""

    if not api_key:
        return {"error": "SUPADATA_API_KEY not configured"}

    # Resolve URL → video ID
    raw = payload.get("url", "") or payload.get("video_id", "")
    if "youtu" in raw:
        if "v=" in raw:
            video_id = raw.split("v=")[-1].split("&")[0]
        else:
            video_id = raw.rstrip("/").split("/")[-1].split("?")[0]
    else:
        video_id = raw

    if not video_id:
        return {"error": "No video ID or URL provided"}

    headers = {"x-api-key": api_key}

    # ── Step 1: Video metadata ──
    try:
        r = requests.get(
            f"https://api.supadata.ai/v1/youtube/video",
            params={"id": video_id},
            headers=headers, timeout=15,
        )
        r.raise_for_status()
        meta = r.json()
    except Exception as e:
        return {"error": f"Video metadata failed: {e}"}

    title = payload.get("title") or meta.get("title", "Untitled")
    channel = meta.get("channel", {}).get("name", "")
    duration = meta.get("duration", 0)
    upload_date = meta.get("uploadDate", "")[:10]

    # ── Step 2: Transcript ──
    try:
        r = requests.get(
            f"https://api.supadata.ai/v1/youtube/transcript",
            params={"id": video_id},
            headers=headers, timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        segments = data.get("content", [])
    except Exception as e:
        return {"error": f"Transcript failed: {e}"}

    # ── Filter by segment ──
    segment_start = payload.get("segment_start")
    segment_end = payload.get("segment_end")
    if segment_start is not None or segment_end is not None:
        start = segment_start or 0
        end = segment_end or float("inf")
        segments = [
            s for s in segments
            if start * 1000 <= s.get("offset", 0) <= end * 1000
        ]

    # ── Build markdown ──
    date_str = upload_date or datetime.utcnow().strftime("%Y-%m-%d")
    safe_title = "".join(c for c in title if c.isalnum() or c in " _-").rstrip()[:80]
    filename = f"{date_str} - {safe_title}.md"

    lines = [
        "---",
        f'title: "{title}"',
        f"date: {date_str}",
        f"source: https://youtu.be/{video_id}",
        f"channel: {channel}",
        f"duration: {duration // 60} min",
        f"type: talk",
        "tags: []",
        "---",
        "",
        f"# {title}",
        "",
        f"**Channel:** {channel}  ",
        f"**Duration:** {duration // 60} min  ",
        f"**Original:** https://youtu.be/{video_id}",
        "",
    ]

    if segment_start or segment_end:
        lines.append(f"**Segment:** {segment_start or 0:.0f}s – {segment_end or duration:.0f}s")
        lines.append("")

    lines.append("## Transcript")
    lines.append("")

    for seg in segments:
        offset = seg.get("offset", 0)
        start_s = offset / 1000
        ts = f"[{start_s/60:.0f}:{start_s%60:02.0f}]"
        lines.append(f"**{ts}** {seg['text']}")
        lines.append("")

    note = "\n".join(lines)

    # ── Save to vault ──
    vault_path = settings.vault_dir
    talks_dir = os.path.join(vault_path, "Talks")
    os.makedirs(talks_dir, exist_ok=True)

    filepath = os.path.join(talks_dir, filename)
    with open(filepath, "w") as f:
        f.write(note)

    return {
        "saved_to": filepath,
        "title": title,
        "video_id": video_id,
        "segments": len(segments),
        "duration_s": duration,
    }
