"""Fathom webhook worker — saves meeting summaries/transcripts to the vault."""

import json
import os
from datetime import datetime

from config import settings


def run(payload: dict, session) -> dict:
    """Process a Fathom webhook payload (Meeting object).

    Saves a markdown note to the vault at {vault_dir}/Meetings/.
    """
    meeting_title = payload.get("meeting_title") or payload.get("title", "Untitled")
    recording_id = payload.get("recording_id", "unknown")
    created_at = payload.get("created_at", datetime.utcnow().isoformat())
    share_url = payload.get("share_url", "")
    url = payload.get("url", "")
    scheduled_start = payload.get("scheduled_start_time", "")
    scheduled_end = payload.get("scheduled_end_time", "")
    recorded_by = payload.get("recorded_by", {})

    # ── Summary ──
    summary = payload.get("default_summary", {}) or {}
    summary_md = summary.get("markdown_formatted", "")

    # ── Action items ──
    action_items = payload.get("action_items") or []
    action_md = ""
    if action_items:
        action_md = "\n".join(f"- {item.get('text', '')}" for item in action_items)

    # ── Transcript ──
    transcript_items = payload.get("transcript") or []
    transcript_md = ""
    if transcript_items:
        lines = []
        for item in transcript_items:
            speaker = item.get("speaker_name", "Unknown")
            text = item.get("text", "")
            ts = item.get("start_time", 0)
            minutes = int(ts // 60)
            seconds = int(ts % 60)
            lines.append(f"**[{minutes:02d}:{seconds:02d}] {speaker}:** {text}")
        transcript_md = "\n".join(lines)

    # ── Invitees ──
    invitees = payload.get("calendar_invitees") or []
    invitee_md = ""
    if invitees:
        invitee_md = ", ".join(
            inv.get("name") or inv.get("email", "?") for inv in invitees
        )

    # ── Build markdown ──
    recorded_by_name = recorded_by.get("name", "") or recorded_by.get("email", "Unknown")
    date_str = ""
    if scheduled_start:
        try:
            dt = datetime.fromisoformat(scheduled_start.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            date_str = scheduled_start[:10]

    note = f"""---
meeting_title: "{meeting_title}"
recording_id: {recording_id}
date: {date_str}
recorded_by: "{recorded_by_name}"
invitees: "{invitee_md}"
source: fathom
share_url: {share_url}
fathom_url: {url}
---

# {meeting_title}

**Date:** {date_str}  
**Recorded by:** {recorded_by_name}  
**Attendees:** {invitee_md or "N/A"}  
**Fathom link:** {url}  
**Share link:** {share_url}

---

## Summary

{summary_md or '_No summary available_'}

## Action Items

{action_md or '_No action items_'}

## Transcript

{transcript_md or '_No transcript available_'}
"""

    # ── Write to vault ──
    vault_path = settings.vault_dir
    safe_title = "".join(c for c in meeting_title if c.isalnum() or c in " _-").rstrip()
    safe_title = safe_title[:80]  # prevent absurdly long filenames
    filename = f"{date_str} - {safe_title}.md"

    meetings_dir = os.path.join(vault_path, "Meetings")
    os.makedirs(meetings_dir, exist_ok=True)

    filepath = os.path.join(meetings_dir, filename)
    with open(filepath, "w") as f:
        f.write(note)

    return {
        "saved_to": filepath,
        "meeting_title": meeting_title,
        "recording_id": recording_id,
        "has_summary": bool(summary_md),
        "has_transcript": bool(transcript_items),
        "action_item_count": len(action_items),
    }
