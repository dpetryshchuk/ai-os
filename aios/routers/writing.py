import os
import re
import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles
import frontmatter
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from config import settings

router = APIRouter()

CONTENT_DIR = Path(settings.writing_dir) / "content" / "essays"
REPO_DIR = settings.writing_dir
FREEWRITE_DIR = Path(settings.freewrite_dir)

_FREEWRITE_ID_RE = re.compile(
    r"^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}"
    r"-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$",
    re.IGNORECASE,
)


def _validate(name: str) -> None:
    if not name or ".." in name or "/" in name or "\\" in name or os.path.isabs(name):
        raise HTTPException(400, f"Invalid path component: {name!r}")


def _essay_path(folder: str, slug: str) -> Path:
    return CONTENT_DIR / folder / f"{slug}.md"


def _slugify(title: str) -> str:
    s = re.sub(r"[^\w\s-]", "", title.lower().strip())
    s = re.sub(r"[\s_-]+", "-", s)
    return re.sub(r"^-+|-+$", "", s) or "untitled"


def _remote_url() -> str:
    token = settings.github_token
    repo = settings.github_repo
    if not token or not repo:
        raise HTTPException(500, "GITHUB_TOKEN and GITHUB_REPO are required")
    return f"https://x-access-token:{token}@github.com/{repo}.git"


# ── Essays ────────────────────────────────────────────────────────────────────

@router.get("/essays")
def list_essays():
    essays = []
    if not CONTENT_DIR.exists():
        return {"ok": True, "essays": essays}
    for folder_path in sorted(CONTENT_DIR.iterdir()):
        if not folder_path.is_dir():
            continue
        for md_file in sorted(folder_path.glob("*.md")):
            try:
                post = frontmatter.load(str(md_file))
                essays.append({"folder": folder_path.name, "slug": md_file.stem, **post.metadata})
            except Exception:
                pass
    return {"ok": True, "essays": essays}


@router.get("/essays/{folder}/{slug}")
def read_essay(folder: str, slug: str):
    _validate(folder)
    _validate(slug)
    path = _essay_path(folder, slug)
    if not path.exists():
        raise HTTPException(404, "Not found")
    post = frontmatter.load(str(path))
    return {"ok": True, "essay": {"folder": folder, "slug": slug, "frontmatter": post.metadata, "body": post.content}}


@router.put("/essays/{folder}/{slug}")
def write_essay(folder: str, slug: str, body: dict):
    _validate(folder)
    _validate(slug)
    path = _essay_path(folder, slug)
    path.parent.mkdir(parents=True, exist_ok=True)
    post = frontmatter.Post(body.get("body", ""), **body.get("frontmatter", {}))
    path.write_text(frontmatter.dumps(post))
    return {"ok": True}


@router.post("/essays")
def create_essay(body: dict):
    folder = body.get("folder")
    title = body.get("title")
    if not folder or not title:
        raise HTTPException(400, "folder and title required")
    _validate(folder)
    slug = _slugify(title)
    path = _essay_path(folder, slug)
    base, i = slug, 1
    while path.exists():
        slug = f"{base}-{i}"
        path = _essay_path(folder, slug)
        i += 1
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(frontmatter.dumps(frontmatter.Post("", title=title)))
    return {"ok": True, "essay": {"folder": folder, "slug": slug, "title": title}}


@router.delete("/essays/{folder}/{slug}")
def delete_essay(folder: str, slug: str):
    _validate(folder)
    _validate(slug)
    path = _essay_path(folder, slug)
    if path.exists():
        path.unlink()
    return {"ok": True}


@router.patch("/essays/{folder}/{slug}/move")
def move_essay(folder: str, slug: str, body: dict):
    _validate(folder)
    _validate(slug)
    target = body.get("folder")
    if not target:
        raise HTTPException(400, "folder required")
    _validate(target)
    src = _essay_path(folder, slug)
    if not src.exists():
        raise HTTPException(404, "Not found")
    dst = _essay_path(target, slug)
    dst.parent.mkdir(parents=True, exist_ok=True)
    src.rename(dst)
    return {"ok": True}


# ── Folders ───────────────────────────────────────────────────────────────────

@router.get("/folders")
def list_folders():
    if not CONTENT_DIR.exists():
        return {"ok": True, "folders": []}
    return {"ok": True, "folders": sorted(d.name for d in CONTENT_DIR.iterdir() if d.is_dir())}


@router.post("/folders")
def create_folder(body: dict):
    name = body.get("name")
    if not name:
        raise HTTPException(400, "name required")
    _validate(name)
    (CONTENT_DIR / name).mkdir(parents=True, exist_ok=True)
    return {"ok": True}


@router.patch("/folders/{folder}")
def rename_folder(folder: str, body: dict):
    _validate(folder)
    new_name = body.get("name")
    if not new_name:
        raise HTTPException(400, "name required")
    _validate(new_name)
    src = CONTENT_DIR / folder
    if not src.exists():
        raise HTTPException(404, "Not found")
    src.rename(CONTENT_DIR / new_name)
    return {"ok": True}


@router.delete("/folders/{folder}")
def delete_folder(folder: str):
    _validate(folder)
    path = CONTENT_DIR / folder
    if not path.exists():
        raise HTTPException(404, "Not found")
    if any(path.iterdir()):
        raise HTTPException(400, "Folder is not empty")
    path.rmdir()
    return {"ok": True}


# ── Git ───────────────────────────────────────────────────────────────────────

@router.post("/git/pull")
def git_pull():
    try:
        remote = _remote_url()
        subprocess.run(["git", "fetch", remote], cwd=REPO_DIR, capture_output=True, text=True, check=True)
        result = subprocess.run(
            ["git", "reset", "--hard", "FETCH_HEAD"],
            cwd=REPO_DIR, capture_output=True, text=True, check=True,
        )
        return {"ok": True, "output": result.stdout.strip()}
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, e.stderr or "git pull failed")


@router.post("/git/push")
def git_push(body: dict):
    message = body.get("message") or "update essays"
    try:
        remote = _remote_url()
        subprocess.run(["git", "add", "-A"], cwd=REPO_DIR, capture_output=True, text=True, check=True)
        commit = subprocess.run(
            ["git", "commit", "-m", message], cwd=REPO_DIR, capture_output=True, text=True
        )
        nothing_to_commit = commit.returncode != 0 and (
            "nothing to commit" in commit.stdout or "nothing to commit" in commit.stderr
        )
        if commit.returncode != 0 and not nothing_to_commit:
            raise HTTPException(400, commit.stderr.strip() or commit.stdout.strip() or "git commit failed")
        result = subprocess.run(
            ["git", "push", remote, "HEAD:main"],
            cwd=REPO_DIR, capture_output=True, text=True, check=True,
        )
        return {"ok": True, "output": result.stdout.strip() or commit.stdout.strip()}
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, e.stderr.strip() or e.stdout.strip() or "git push failed")


# ── Freewrite ─────────────────────────────────────────────────────────────────

def _fw_make_id() -> str:
    ts = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    return f"{str(uuid.uuid4()).upper()}-{ts}"


def _fw_entry_path(entry_id: str) -> Path:
    return FREEWRITE_DIR / f"{entry_id}.md"


def _fw_video_dir(entry_id: str) -> Path:
    return FREEWRITE_DIR / "videos" / entry_id


def _fw_video_path(entry_id: str) -> Path:
    return _fw_video_dir(entry_id) / f"{entry_id}.webm"


def _fw_validate_id(entry_id: str) -> None:
    if not _FREEWRITE_ID_RE.match(entry_id):
        raise HTTPException(400, "Invalid entry id")


@router.get("/freewrite/entries")
def list_freewrite_entries():
    d = FREEWRITE_DIR
    if not d.exists():
        return {"ok": True, "entries": []}
    entries = []
    for md_file in d.glob("*.md"):
        entry_id = md_file.stem
        if not _FREEWRITE_ID_RE.match(entry_id):
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


@router.post("/freewrite/entries")
def create_freewrite_entry():
    FREEWRITE_DIR.mkdir(parents=True, exist_ok=True)
    entry_id = _fw_make_id()
    _fw_entry_path(entry_id).write_text("\n\n", encoding="utf-8")
    return {"ok": True, "id": entry_id}


@router.get("/freewrite/entries/{entry_id}")
def get_freewrite_entry(entry_id: str):
    _fw_validate_id(entry_id)
    path = _fw_entry_path(entry_id)
    if not path.exists():
        raise HTTPException(404, "Not found")
    return {"ok": True, "text": path.read_text(encoding="utf-8")}


@router.put("/freewrite/entries/{entry_id}")
def save_freewrite_entry(entry_id: str, body: dict):
    _fw_validate_id(entry_id)
    path = _fw_entry_path(entry_id)
    if not path.exists():
        raise HTTPException(404, "Not found")
    path.write_text(body.get("text", ""), encoding="utf-8")
    return {"ok": True}


@router.delete("/freewrite/entries/{entry_id}")
def delete_freewrite_entry(entry_id: str):
    _fw_validate_id(entry_id)
    path = _fw_entry_path(entry_id)
    if path.exists():
        path.unlink()
    vdir = _fw_video_dir(entry_id)
    if vdir.exists():
        shutil.rmtree(vdir)
    return {"ok": True}


@router.post("/freewrite/entries/{entry_id}/video")
async def upload_freewrite_video(
    entry_id: str,
    video: UploadFile = File(...),
    transcript: str = Form(None),
):
    _fw_validate_id(entry_id)
    if not _fw_entry_path(entry_id).exists():
        raise HTTPException(404, "Entry not found")
    vdir = _fw_video_dir(entry_id)
    vdir.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(_fw_video_path(entry_id), "wb") as f:
        while chunk := await video.read(1024 * 1024):
            await f.write(chunk)
    if transcript:
        async with aiofiles.open(vdir / "transcript.md", "w", encoding="utf-8") as f:
            await f.write(transcript)
    async with aiofiles.open(_fw_entry_path(entry_id), "w", encoding="utf-8") as f:
        await f.write("Video Entry")
    return {"ok": True}


@router.get("/freewrite/entries/{entry_id}/video")
async def stream_freewrite_video(entry_id: str):
    _fw_validate_id(entry_id)
    vpath = _fw_video_path(entry_id)
    if not vpath.exists():
        raise HTTPException(404, "Video not found")

    async def _iter():
        async with aiofiles.open(vpath, "rb") as f:
            while chunk := await f.read(1024 * 1024):
                yield chunk

    return StreamingResponse(_iter(), media_type="video/webm")
