# writing-app FastAPI Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Express/TypeScript backend with FastAPI/Python. No database — essays live on the filesystem as markdown with YAML frontmatter; git ops via subprocess.

**Architecture:** FastAPI sync route functions handle filesystem I/O (FastAPI runs them in a thread pool). `python-frontmatter` replaces `gray-matter`. `subprocess` replaces `execSync`. Response shapes are identical to the existing Express routes.

**Tech Stack:** Python 3.12, FastAPI 0.115, uvicorn, python-frontmatter 1.1, pytest + pytest-asyncio + httpx

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/writing-app/main.py` |
| Create | `apps/writing-app/requirements.txt` |
| Create | `apps/writing-app/pytest.ini` |
| Create | `apps/writing-app/tests/__init__.py` |
| Create | `apps/writing-app/tests/test_main.py` |
| Replace | `apps/writing-app/Dockerfile` |
| Delete  | `apps/writing-app/server.ts`, `apps/writing-app/src/`, `apps/writing-app/package.json`, `apps/writing-app/package-lock.json`, `apps/writing-app/tsconfig.json` |

---

### Task 1: Project setup

**Files:**
- Create: `apps/writing-app/requirements.txt`
- Create: `apps/writing-app/pytest.ini`
- Create: `apps/writing-app/tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-frontmatter==1.1.0
python-dotenv==1.0.0
pytest==8.3.0
pytest-asyncio==0.23.8
httpx==0.27.0
anyio==4.4.0
```

- [ ] **Step 2: Create pytest.ini**

```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 3: Create tests/__init__.py** (empty)

- [ ] **Step 4: Install deps**

```bash
cd apps/writing-app
pip install -r requirements.txt
```

---

### Task 2: Write all tests (all must fail)

**Files:**
- Create: `apps/writing-app/tests/test_main.py`

- [ ] **Step 1: Create tests/test_main.py**

```python
import os
import tempfile
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def essay_dir(monkeypatch, tmp_path):
    content_dir = tmp_path / "essays"
    content_dir.mkdir()
    (content_dir / "blog").mkdir()

    # Pre-create one essay
    (content_dir / "blog" / "hello.md").write_text(
        "---\ntitle: Hello\n---\nBody text here\n"
    )

    monkeypatch.setenv("CONTENT_DIR", str(content_dir))
    monkeypatch.setenv("REPO_DIR", str(tmp_path))
    return content_dir


@pytest.fixture
async def client(essay_dir):
    # Import after env is set so CONTENT_DIR is available at module load
    import importlib
    import main as m
    importlib.reload(m)
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_list_essays(client):
    r = await client.get("/api/essays")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert any(e["slug"] == "hello" for e in data["essays"])


async def test_read_essay(client):
    r = await client.get("/api/essays/blog/hello")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["essay"]["frontmatter"]["title"] == "Hello"
    assert "Body text here" in data["essay"]["body"]


async def test_read_essay_not_found(client):
    r = await client.get("/api/essays/blog/nonexistent")
    assert r.status_code == 404


async def test_create_essay(client):
    r = await client.post("/api/essays", json={"folder": "blog", "title": "New Post"})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["essay"]["slug"] == "new-post"


async def test_create_essay_missing_fields(client):
    r = await client.post("/api/essays", json={"folder": "blog"})
    assert r.status_code == 400


async def test_write_essay(client):
    r = await client.put(
        "/api/essays/blog/hello",
        json={"frontmatter": {"title": "Updated"}, "body": "new body"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_delete_essay(client, essay_dir):
    (essay_dir / "blog" / "todelete.md").write_text("---\ntitle: Del\n---\n")
    r = await client.delete("/api/essays/blog/todelete")
    assert r.status_code == 200
    assert not (essay_dir / "blog" / "todelete.md").exists()


async def test_list_folders(client):
    r = await client.get("/api/folders")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert "blog" in data["folders"]


async def test_create_folder(client, essay_dir):
    r = await client.post("/api/folders", json={"name": "drafts"})
    assert r.status_code == 200
    assert (essay_dir / "drafts").is_dir()


async def test_delete_nonempty_folder_fails(client):
    r = await client.delete("/api/folders/blog")
    assert r.status_code == 400


async def test_path_traversal_rejected(client):
    # Folder name containing ".." should be rejected by _validate()
    r = await client.get("/api/essays/bad..folder/hello")
    assert r.status_code == 400


async def test_health(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "status": "healthy"}
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
cd apps/writing-app
pytest tests/ -v
```

Expected: all FAIL with import errors (main.py doesn't exist).

---

### Task 3: Implement main.py

**Files:**
- Create: `apps/writing-app/main.py`

- [ ] **Step 1: Create main.py**

```python
import os
import re
import subprocess
from pathlib import Path

import frontmatter
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

CONTENT_DIR = Path(os.environ.get("CONTENT_DIR", "/app/essays"))
REPO_DIR = os.environ.get("REPO_DIR")

app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


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

@app.post("/api/git/pull")
def git_pull():
    try:
        result = subprocess.run(
            ["git", "pull"], cwd=REPO_DIR, capture_output=True, text=True, check=True
        )
        return {"ok": True, "output": result.stdout.strip()}
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, e.stderr or "git pull failed")


@app.post("/api/git/push")
def git_push(body: dict):
    message = body.get("message") or "update essays"
    try:
        subprocess.run(["git", "add", "-A"], cwd=REPO_DIR, check=True)
        subprocess.run(["git", "commit", "-m", message], cwd=REPO_DIR, check=True)
        result = subprocess.run(
            ["git", "push"], cwd=REPO_DIR, capture_output=True, text=True, check=True
        )
        return {"ok": True, "output": result.stdout.strip()}
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, e.stderr or "git operation failed")


# ── Static (SPA fallback — must be last) ─────────────────────────────────────

if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
```

- [ ] **Step 2: Run tests — all should pass**

```bash
cd apps/writing-app
pytest tests/ -v
```

Expected: 12 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/writing-app/main.py apps/writing-app/requirements.txt apps/writing-app/pytest.ini apps/writing-app/tests/
git commit -m "feat(writing-app): FastAPI backend + tests"
```

---

### Task 4: Replace Dockerfile

**Files:**
- Replace: `apps/writing-app/Dockerfile`

- [ ] **Step 1: Replace Dockerfile**

```dockerfile
# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY packages/ui ./packages/ui
COPY apps/writing-app/frontend/package.json apps/writing-app/frontend/package-lock.json ./apps/writing-app/frontend/
RUN cd apps/writing-app/frontend && npm ci
COPY apps/writing-app/frontend ./apps/writing-app/frontend
RUN cd apps/writing-app/frontend && npm run build

FROM python:3.12-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client \
    && rm -rf /var/lib/apt/lists/*
RUN git config --global --add safe.directory /repo
WORKDIR /app
COPY apps/writing-app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/writing-app/main.py .
COPY --from=frontend-builder /app/apps/writing-app/public ./public
ENV PORT=4112
EXPOSE 4112
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4112"]
```

- [ ] **Step 2: Build locally to verify**

```bash
docker build -f apps/writing-app/Dockerfile -t writing-app-test .
```

Expected: build succeeds.

- [ ] **Step 3: Remove old Node.js backend files**

```bash
cd apps/writing-app
rm -f server.ts tsconfig.json package.json package-lock.json
rm -rf src/ node_modules/ dist/
```

- [ ] **Step 4: Commit**

```bash
git add apps/writing-app/Dockerfile
git rm -f apps/writing-app/server.ts apps/writing-app/tsconfig.json apps/writing-app/package.json apps/writing-app/package-lock.json 2>/dev/null || true
git commit -m "chore(writing-app): replace Node.js backend with Python Dockerfile"
```
