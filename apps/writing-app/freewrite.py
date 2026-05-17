import os
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

router = APIRouter()

_ID_RE = re.compile(
    r"^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}"
    r"-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$",
    re.IGNORECASE,
)


def _get_dir() -> Path:
    return Path(os.environ.get("FREEWRITE_DIR", "/tmp/freewrite"))


def _validate_id(entry_id: str) -> None:
    if not _ID_RE.match(entry_id):
        raise HTTPException(400, "Invalid entry id")


def _make_id() -> str:
    ts = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    return f"{str(uuid.uuid4()).upper()}-{ts}"


def _entry_path(d: Path, entry_id: str) -> Path:
    return d / f"{entry_id}.md"


def _video_dir(d: Path, entry_id: str) -> Path:
    return d / "videos" / entry_id


def _video_path(d: Path, entry_id: str) -> Path:
    return _video_dir(d, entry_id) / f"{entry_id}.webm"


def _transcript_path(d: Path, entry_id: str) -> Path:
    return _video_dir(d, entry_id) / "transcript.md"


@router.get("/entries")
def list_entries():
    d = _get_dir()
    if not d.exists():
        return {"ok": True, "entries": []}
    entries = []
    for md_file in d.glob("*.md"):
        entry_id = md_file.stem
        if not _ID_RE.match(entry_id):
            continue
        try:
            created_at = datetime.strptime(entry_id[-19:], "%Y-%m-%d-%H-%M-%S").isoformat()
        except ValueError:
            continue
        content = md_file.read_text(encoding="utf-8")
        is_video = content.strip() == "Video Entry"
        preview = "" if is_video else content.lstrip("\n").split("\n")[0][:100]
        entries.append({"id": entry_id, "created_at": created_at, "is_video": is_video, "preview": preview})
    entries.sort(key=lambda e: e["created_at"], reverse=True)
    return {"ok": True, "entries": entries}


@router.post("/entries")
def create_entry():
    d = _get_dir()
    d.mkdir(parents=True, exist_ok=True)
    entry_id = _make_id()
    _entry_path(d, entry_id).write_text("\n\n", encoding="utf-8")
    return {"ok": True, "id": entry_id}


@router.get("/entries/{entry_id}")
def get_entry(entry_id: str):
    _validate_id(entry_id)
    d = _get_dir()
    path = _entry_path(d, entry_id)
    if not path.exists():
        raise HTTPException(404, "Not found")
    return {"ok": True, "text": path.read_text(encoding="utf-8")}


@router.put("/entries/{entry_id}")
def save_entry(entry_id: str, body: dict):
    _validate_id(entry_id)
    d = _get_dir()
    path = _entry_path(d, entry_id)
    if not path.exists():
        raise HTTPException(404, "Not found")
    path.write_text(body.get("text", ""), encoding="utf-8")
    return {"ok": True}


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: str):
    _validate_id(entry_id)
    d = _get_dir()
    path = _entry_path(d, entry_id)
    if path.exists():
        path.unlink()
    vdir = _video_dir(d, entry_id)
    if vdir.exists():
        shutil.rmtree(vdir)
    return {"ok": True}


@router.post("/entries/{entry_id}/video")
async def upload_video(
    entry_id: str,
    video: UploadFile = File(...),
    transcript: str = Form(None),
):
    _validate_id(entry_id)
    d = _get_dir()
    if not _entry_path(d, entry_id).exists():
        raise HTTPException(404, "Entry not found")
    vdir = _video_dir(d, entry_id)
    vdir.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(_video_path(d, entry_id), "wb") as f:
        while chunk := await video.read(1024 * 1024):
            await f.write(chunk)
    if transcript:
        _transcript_path(d, entry_id).write_text(transcript, encoding="utf-8")
    _entry_path(d, entry_id).write_text("Video Entry", encoding="utf-8")
    return {"ok": True}


@router.get("/entries/{entry_id}/video")
async def stream_video(entry_id: str):
    _validate_id(entry_id)
    vpath = _video_path(_get_dir(), entry_id)
    if not vpath.exists():
        raise HTTPException(404, "Video not found")

    async def _iter():
        async with aiofiles.open(vpath, "rb") as f:
            while chunk := await f.read(1024 * 1024):
                yield chunk

    return StreamingResponse(_iter(), media_type="video/webm")
