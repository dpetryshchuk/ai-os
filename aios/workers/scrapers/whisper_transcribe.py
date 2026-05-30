"""Whisper worker — transcribe audio files and save transcripts to the vault.

Runs inside Docker with whisper-venv mounted at /whisper-venv.
"""

import json
import os
import subprocess
import sys
from datetime import datetime

from config import settings

WHISPER_PYTHON = "/whisper-venv/bin/python"


def run(payload: dict, session) -> dict:
    """Transcribe an audio file and save to vault."""
    audio_path = payload.get("audio_path", "")
    title = payload.get("title", "Untitled Recording")
    source = payload.get("source", "upload")
    segment_start = payload.get("segment_start")
    segment_end = payload.get("segment_end")
    model = payload.get("model", "base")
    language = payload.get("language", "en")

    if not audio_path or not os.path.exists(audio_path):
        return {"error": f"Audio file not found: {audio_path}"}

    # Run transcription inline via faster-whisper Python API
    script = f'''
import json, sys, os, time
os.environ["HF_HUB_CACHE"] = "/whisper-models"
from faster_whisper import WhisperModel

model = WhisperModel("{model}", device="cpu", compute_type="int8",
                     download_root="/whisper-models")
segments_list, info = model.transcribe("{audio_path}", language="{language}",
                                        beam_size=5, vad_filter=True)
result = {{
    "language": info.language,
    "duration": info.duration,
    "segments": [
        {{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}}
        for s in segments_list
    ]
}}
print(json.dumps(result))
'''

    result = subprocess.run(
        [WHISPER_PYTHON, "-c", script],
        capture_output=True, text=True, timeout=600,
    )

    if result.returncode != 0:
        return {"error": f"Whisper failed: {result.stderr}"}

    data = json.loads(result.stdout)
    all_segments = data.get("segments", [])

    # Filter by segment
    if segment_start is not None or segment_end is not None:
        start = segment_start or 0
        end = segment_end or float("inf")
        segments = [s for s in all_segments if start <= s["start"] <= end]
    else:
        segments = all_segments

    # Build markdown
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    safe_title = "".join(c for c in title if c.isalnum() or c in " _-").rstrip()[:80]
    filename = f"{date_str} - {safe_title}.md"

    lines = [f"# {title}", ""]
    lines.append(f"**Date:** {date_str}")
    lines.append(f"**Source:** {source}")
    lines.append(f"**Duration:** {data.get('duration', 0):.0f}s")
    lines.append(f"**Language:** {data.get('language', language)}")
    lines.append(f"**Model:** {model}")
    if segment_start or segment_end:
        lines.append(f"**Segment:** {segment_start or 0:.0f}s – {segment_end or data.get('duration', 0):.0f}s")
    lines.append("")
    lines.append("## Transcript")
    lines.append("")

    for seg in segments:
        ts = f"[{seg['start']/60:.0f}:{seg['start']%60:02.0f}]"
        lines.append(f"**{ts}** {seg['text']}")
        lines.append("")

    note = "\n".join(lines)

    vault_path = settings.vault_dir
    talks_dir = os.path.join(vault_path, "Talks")
    os.makedirs(talks_dir, exist_ok=True)

    filepath = os.path.join(talks_dir, filename)
    with open(filepath, "w") as f:
        f.write(note)

    return {
        "saved_to": filepath,
        "title": title,
        "total_segments": len(all_segments),
        "saved_segments": len(segments),
        "duration": data.get("duration", 0),
        "model": model,
    }
