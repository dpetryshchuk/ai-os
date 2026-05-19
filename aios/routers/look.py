import mimetypes
import os
import secrets
from pathlib import Path
from typing import Optional

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

import db
from config import settings
from schemas import LookItemResponse, LookItemRow, LookItemsResponse, OkResponse

router = APIRouter()

LOOK_DIR = Path(settings.uploads_dir) / "look"
MEDIA_TYPE_MAP = {
    "image": ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"],
    "video": ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
    "voice": ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/webm", "audio/ogg", "audio/aac"],
}


def _media_type(mime: str) -> str:
    for kind, mimes in MEDIA_TYPE_MAP.items():
        if mime in mimes:
            return kind
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "voice"
    return "image"


async def _save_file(upload: UploadFile, prefix: str = "") -> tuple[str, str]:
    """Save an uploaded file and return (path, mime_type)."""
    LOOK_DIR.mkdir(parents=True, exist_ok=True)
    mime = upload.content_type or mimetypes.guess_type(upload.filename or "")[0] or "application/octet-stream"
    ext = Path(upload.filename).suffix if upload.filename else (mimetypes.guess_extension(mime) or "")
    filename = f"{prefix}{secrets.token_hex(6)}{ext}"
    dest = LOOK_DIR / filename
    with open(dest, "wb") as f:
        f.write(await upload.read())
    return str(dest), mime


@router.post("/items", status_code=201)
async def create_item(
    file: UploadFile = File(...),
    category: str = Form(...),
    note: str = Form(""),
    source: str = Form(""),
    voice_note: Optional[UploadFile] = File(None),
    pool: asyncpg.Pool = Depends(db.get_jobsearch_pool),
) -> LookItemResponse:
    item_id = secrets.token_hex(8)
    file_path, mime = await _save_file(file, prefix=item_id + "_")

    voice_path: str | None = None
    voice_mime: str | None = None
    if voice_note and voice_note.filename:
        voice_path, voice_mime = await _save_file(voice_note, prefix=item_id + "_voice_")

    row = await pool.fetchrow(
        """
        INSERT INTO look_items
            (id, category, media_type, file_path, mime_type, note, source, voice_path, voice_mime)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id, category, media_type, file_path, mime_type, note, source,
                  voice_path, voice_mime, created_at
        """,
        item_id,
        category,
        _media_type(mime),
        file_path,
        mime,
        note or None,
        source or None,
        voice_path,
        voice_mime,
    )
    return LookItemResponse(item=LookItemRow.model_validate(dict(row)))


@router.get("/items")
async def list_items(
    category: str = "",
    pool: asyncpg.Pool = Depends(db.get_jobsearch_pool),
) -> LookItemsResponse:
    if category:
        rows = await pool.fetch(
            "SELECT id, category, media_type, file_path, mime_type, note, source, "
            "voice_path, voice_mime, created_at "
            "FROM look_items WHERE category = $1 ORDER BY created_at DESC",
            category,
        )
    else:
        rows = await pool.fetch(
            "SELECT id, category, media_type, file_path, mime_type, note, source, "
            "voice_path, voice_mime, created_at FROM look_items ORDER BY created_at DESC"
        )
    return LookItemsResponse(items=[LookItemRow.model_validate(dict(r)) for r in rows])


@router.get("/items/{item_id}/file")
async def get_file(item_id: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    row = await pool.fetchrow("SELECT file_path, mime_type FROM look_items WHERE id = $1", item_id)
    if not row:
        raise HTTPException(404, "Not found")
    path = Path(row["file_path"])
    if not path.exists():
        raise HTTPException(404, "File missing")
    return FileResponse(str(path), media_type=row["mime_type"] or "application/octet-stream")


@router.get("/items/{item_id}/voice")
async def get_voice(item_id: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    row = await pool.fetchrow("SELECT voice_path, voice_mime FROM look_items WHERE id = $1", item_id)
    if not row or not row["voice_path"]:
        raise HTTPException(404, "No voice note")
    path = Path(row["voice_path"])
    if not path.exists():
        raise HTTPException(404, "File missing")
    return FileResponse(str(path), media_type=row["voice_mime"] or "audio/mpeg")


@router.delete("/items/{item_id}")
async def delete_item(item_id: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> OkResponse:
    row = await pool.fetchrow(
        "SELECT file_path, voice_path FROM look_items WHERE id = $1", item_id
    )
    if not row:
        raise HTTPException(404, "Not found")
    await pool.execute("DELETE FROM look_items WHERE id = $1", item_id)
    for p in [row["file_path"], row["voice_path"]]:
        if p:
            try:
                os.unlink(p)
            except FileNotFoundError:
                pass
    return OkResponse()
