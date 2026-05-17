import os
import re
import subprocess
from pathlib import Path

import frontmatter
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from freewrite import router as freewrite_router

CONTENT_DIR = Path(os.environ.get("CONTENT_DIR", "/app/essays"))
REPO_DIR = os.environ.get("REPO_DIR")

app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
app.include_router(freewrite_router, prefix="/api/freewrite")


@app.exception_handler(HTTPException)
async def _http_exc(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"ok": False, "error": exc.detail},
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


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"ok": True, "status": "healthy"}


# ── Essays ────────────────────────────────────────────────────────────────────

@app.get("/api/essays")
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


@app.get("/api/essays/{folder}/{slug}")
def read_essay(folder: str, slug: str):
    _validate(folder)
    _validate(slug)
    path = _essay_path(folder, slug)
    if not path.exists():
        raise HTTPException(404, "Not found")
    post = frontmatter.load(str(path))
    return {"ok": True, "essay": {"folder": folder, "slug": slug, "frontmatter": post.metadata, "body": post.content}}


@app.put("/api/essays/{folder}/{slug}")
def write_essay(folder: str, slug: str, body: dict):
    _validate(folder)
    _validate(slug)
    meta = body.get("frontmatter", {})
    content = body.get("body", "")
    path = _essay_path(folder, slug)
    path.parent.mkdir(parents=True, exist_ok=True)
    post = frontmatter.Post(content, **meta)
    path.write_text(frontmatter.dumps(post))
    return {"ok": True}


@app.post("/api/essays")
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
    post = frontmatter.Post("", title=title)
    path.write_text(frontmatter.dumps(post))
    return {"ok": True, "essay": {"folder": folder, "slug": slug, "title": title}}


@app.delete("/api/essays/{folder}/{slug}")
def delete_essay(folder: str, slug: str):
    _validate(folder)
    _validate(slug)
    path = _essay_path(folder, slug)
    if path.exists():
        path.unlink()
    return {"ok": True}


@app.patch("/api/essays/{folder}/{slug}/move")
def move_essay(folder: str, slug: str, body: dict):
    _validate(folder)
    _validate(slug)
    target = body.get("folder")
    if not target:
        raise HTTPException(400, "folder required")
    _validate(target)
    src = _essay_path(folder, slug)
    dst = _essay_path(target, slug)
    if not src.exists():
        raise HTTPException(404, "Not found")
    dst.parent.mkdir(parents=True, exist_ok=True)
    src.rename(dst)
    return {"ok": True}


# ── Folders ───────────────────────────────────────────────────────────────────

@app.get("/api/folders")
def list_folders():
    if not CONTENT_DIR.exists():
        return {"ok": True, "folders": []}
    folders = sorted(d.name for d in CONTENT_DIR.iterdir() if d.is_dir())
    return {"ok": True, "folders": folders}


@app.post("/api/folders")
def create_folder(body: dict):
    name = body.get("name")
    if not name:
        raise HTTPException(400, "name required")
    _validate(name)
    (CONTENT_DIR / name).mkdir(parents=True, exist_ok=True)
    return {"ok": True}


@app.patch("/api/folders/{folder}")
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


@app.delete("/api/folders/{folder}")
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

def _remote_url() -> str:
    token = os.environ.get("GITHUB_TOKEN", "")
    repo = os.environ.get("GITHUB_REPO", "")  # "owner/repo"
    if not token or not repo:
        raise HTTPException(500, "GITHUB_TOKEN and GITHUB_REPO env vars are required")
    return f"https://x-access-token:{token}@github.com/{repo}.git"


@app.post("/api/git/pull")
def git_pull():
    try:
        remote = _remote_url()
        subprocess.run(["git", "fetch", remote], cwd=REPO_DIR, capture_output=True, text=True, check=True)
        result = subprocess.run(
            ["git", "reset", "--hard", "FETCH_HEAD"],
            cwd=REPO_DIR, capture_output=True, text=True, check=True
        )
        return {"ok": True, "output": result.stdout.strip()}
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, e.stderr or "git pull failed")


@app.post("/api/git/push")
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
            cwd=REPO_DIR, capture_output=True, text=True, check=True
        )
        return {"ok": True, "output": result.stdout.strip() or commit.stdout.strip()}
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, e.stderr.strip() or e.stdout.strip() or "git push failed")


# ── Static (SPA fallback — must be last) ─────────────────────────────────────

if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
