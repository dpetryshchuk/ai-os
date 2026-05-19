import mimetypes
import os
import secrets
from pathlib import Path

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
    "voice": ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/webm", "audio/ogg"],
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


@router.post("/items", status_code=201)
async def create_item(
    file: UploadFile = File(...),
    category: str = Form(...),
    note: str = Form(""),
    source: str = Form(""),
    pool: asyncpg.Pool = Depends(db.get_jobsearch_pool),
) -> LookItemResponse:
    LOOK_DIR.mkdir(parents=True, exist_ok=True)

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    ext = Path(file.filename).suffix if file.filename else mimetypes.guess_extension(mime) or ""
    item_id = secrets.token_hex(8)
    filename = f"{item_id}{ext}"
    dest = LOOK_DIR / filename

    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)

    row = await pool.fetchrow(
        """
        INSERT INTO look_items (id, category, media_type, file_path, mime_type, note, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, category, media_type, file_path, mime_type, note, source, created_at
        """,
        item_id,
        category,
        _media_type(mime),
        str(dest),
        mime,
        note or None,
        source or None,
    )
    return LookItemResponse(item=LookItemRow.model_validate(dict(row)))


@router.get("/items")
async def list_items(
    category: str = "",
    pool: asyncpg.Pool = Depends(db.get_jobsearch_pool),
) -> LookItemsResponse:
    if category:
        rows = await pool.fetch(
            "SELECT id, category, media_type, file_path, mime_type, note, source, created_at "
            "FROM look_items WHERE category = $1 ORDER BY created_at DESC",
            category,
        )
    else:
        rows = await pool.fetch(
            "SELECT id, category, media_type, file_path, mime_type, note, source, created_at "
            "FROM look_items ORDER BY created_at DESC"
        )
    return LookItemsResponse(items=[LookItemRow.model_validate(dict(r)) for r in rows])


@router.get("/items/{item_id}/file")
async def get_file(item_id: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    row = await pool.fetchrow(
        "SELECT file_path, mime_type FROM look_items WHERE id = $1", item_id
    )
    if not row:
        raise HTTPException(404, "Not found")
    path = Path(row["file_path"])
    if not path.exists():
        raise HTTPException(404, "File missing")
    return FileResponse(str(path), media_type=row["mime_type"] or "application/octet-stream")


@router.delete("/items/{item_id}")
async def delete_item(item_id: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> OkResponse:
    row = await pool.fetchrow("SELECT file_path FROM look_items WHERE id = $1", item_id)
    if not row:
        raise HTTPException(404, "Not found")
    await pool.execute("DELETE FROM look_items WHERE id = $1", item_id)
    try:
        os.unlink(row["file_path"])
    except FileNotFoundError:
        pass
    return OkResponse()
