# daily-log FastAPI Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Express/TypeScript backend with a FastAPI/Python backend; keep the React/Vite frontend unchanged.

**Architecture:** FastAPI serves the same 7 API routes with identical response shapes. `asyncpg` replaces `pg`. A multistage Dockerfile builds the frontend with Node.js then runs the Python backend.

**Tech Stack:** Python 3.12, FastAPI 0.115, uvicorn, asyncpg 0.29, pytest + pytest-asyncio + httpx

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/daily-log/main.py` |
| Create | `apps/daily-log/db.py` |
| Create | `apps/daily-log/requirements.txt` |
| Create | `apps/daily-log/pytest.ini` |
| Create | `apps/daily-log/tests/__init__.py` |
| Create | `apps/daily-log/tests/test_main.py` |
| Replace | `apps/daily-log/Dockerfile` |
| Delete  | `apps/daily-log/server.ts`, `apps/daily-log/src/`, `apps/daily-log/package.json`, `apps/daily-log/package-lock.json`, `apps/daily-log/tsconfig.json` |

---

### Task 1: Project setup

**Files:**
- Create: `apps/daily-log/requirements.txt`
- Create: `apps/daily-log/pytest.ini`
- Create: `apps/daily-log/tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
asyncpg==0.29.0
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

- [ ] **Step 3: Create tests/__init__.py** (empty file)

- [ ] **Step 4: Install deps locally**

```bash
cd apps/daily-log
pip install -r requirements.txt
```

Expected: no errors, packages installed.

---

### Task 2: db.py

**Files:**
- Create: `apps/daily-log/db.py`

- [ ] **Step 1: Create db.py**

```python
import asyncpg
import os
from typing import Optional

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    return _pool  # type: ignore[return-value]


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
```

---

### Task 3: Write all tests (all must fail at this point)

**Files:**
- Create: `apps/daily-log/tests/test_main.py`

- [ ] **Step 1: Create tests/test_main.py**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport
from main import app, get_pool


def make_mock_pool():
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()

    conn = MagicMock()
    conn.execute = AsyncMock()
    txn = MagicMock()
    txn.__aenter__ = AsyncMock(return_value=None)
    txn.__aexit__ = AsyncMock(return_value=False)
    conn.transaction = MagicMock(return_value=txn)
    acquire_ctx = MagicMock()
    acquire_ctx.__aenter__ = AsyncMock(return_value=conn)
    acquire_ctx.__aexit__ = AsyncMock(return_value=False)
    pool.acquire = MagicMock(return_value=acquire_ctx)
    return pool, conn


@pytest.fixture
async def client():
    pool, conn = make_mock_pool()
    app.dependency_overrides[get_pool] = lambda: pool
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c, pool, conn
    app.dependency_overrides.clear()


async def test_list_habits_empty(client):
    c, pool, _ = client
    r = await c.get("/api/habits")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "habits": []}


async def test_create_habit_missing_kind(client):
    c, _, _ = client
    r = await c.post("/api/habits", json={"name": "exercise"})
    assert r.status_code == 400
    assert r.json()["ok"] is False


async def test_create_habit_invalid_kind(client):
    c, _, _ = client
    r = await c.post("/api/habits", json={"name": "exercise", "kind": "text"})
    assert r.status_code == 400


async def test_update_habit_not_found(client):
    c, pool, _ = client
    pool.fetchrow.return_value = None
    r = await c.patch("/api/habits/999", json={"active": False})
    assert r.status_code == 404
    assert r.json()["ok"] is False


async def test_get_day_no_data(client):
    c, pool, _ = client
    pool.fetchrow.return_value = None
    pool.fetch.return_value = []
    r = await c.get("/api/day/2024-01-01")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["entry"] is None
    assert data["habits"] == []


async def test_upsert_day_returns_ok(client):
    c, _, conn = client
    r = await c.put("/api/day/2024-01-01", json={"did_today": "coded"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    conn.execute.assert_called_once()


async def test_get_calendar_empty(client):
    c, pool, _ = client
    pool.fetch.return_value = []
    r = await c.get("/api/calendar/2024/1")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "days": []}


async def test_get_archive_empty(client):
    c, pool, _ = client
    pool.fetch.return_value = []
    r = await c.get("/api/archive")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "days": []}


async def test_health(client):
    c, _, _ = client
    r = await c.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "status": "healthy"}
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
cd apps/daily-log
pytest tests/ -v
```

Expected: all tests FAIL with `ModuleNotFoundError` or `ImportError` (main.py doesn't exist yet).

---

### Task 4: Implement main.py

**Files:**
- Create: `apps/daily-log/main.py`

- [ ] **Step 1: Create main.py**

```python
from contextlib import asynccontextmanager
from typing import Any
import json
import os

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from db import close_pool, get_pool, init_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.exception_handler(HTTPException)
async def _http_exc(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"ok": False, "error": exc.detail},
    )


def _row(record) -> dict[str, Any]:
    d = dict(record)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"ok": True, "status": "healthy"}


# ── Habits ────────────────────────────────────────────────────────────────────

@app.get("/api/habits")
async def list_habits(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch(
        "SELECT id, name, kind, active, created_at FROM habit_types ORDER BY id"
    )
    return {"ok": True, "habits": [_row(r) for r in rows]}


@app.post("/api/habits", status_code=201)
async def create_habit(body: dict, pool: asyncpg.Pool = Depends(get_pool)):
    name, kind = body.get("name"), body.get("kind")
    if not name or not kind:
        raise HTTPException(400, "name and kind are required")
    if kind not in ("boolean", "number"):
        raise HTTPException(400, "kind must be boolean or number")
    row = await pool.fetchrow(
        "INSERT INTO habit_types (name, kind) VALUES ($1, $2)"
        " RETURNING id, name, kind, active, created_at",
        name, kind,
    )
    return {"ok": True, "habit": _row(row)}


@app.patch("/api/habits/{habit_id}")
async def update_habit(
    habit_id: int, body: dict, pool: asyncpg.Pool = Depends(get_pool)
):
    name = body.get("name")
    active = body.get("active")
    row = await pool.fetchrow(
        """UPDATE habit_types
              SET name   = COALESCE($2, name),
                  active = COALESCE($3, active)
            WHERE id = $1
        RETURNING id, name, kind, active, created_at""",
        habit_id,
        name if name is not None else None,
        active if active is not None else None,
    )
    if not row:
        raise HTTPException(404, f"Habit type {habit_id} not found")
    return {"ok": True, "habit": _row(row)}


# ── Day ───────────────────────────────────────────────────────────────────────

@app.get("/api/day/{date}")
async def get_day(date: str, pool: asyncpg.Pool = Depends(get_pool)):
    entry_row = await pool.fetchrow(
        "SELECT date, did_today, doing_tomorrow, updated_at FROM entries WHERE date = $1",
        date,
    )
    habit_rows = await pool.fetch(
        "SELECT habit_type_id, date, value FROM habit_logs WHERE date = $1",
        date,
    )
    entry = _row(entry_row) if entry_row else None
    habits = [
        {"habit_type_id": r["habit_type_id"], "date": str(r["date"]), "value": r["value"]}
        for r in habit_rows
    ]
    return {"ok": True, "entry": entry, "habits": habits}


@app.put("/api/day/{date}")
async def upsert_day(date: str, body: dict, pool: asyncpg.Pool = Depends(get_pool)):
    did_today = body.get("did_today")
    doing_tomorrow = body.get("doing_tomorrow")
    habits = body.get("habits")

    async with pool.acquire() as conn:
        async with conn.transaction():
            if did_today is not None or doing_tomorrow is not None:
                await conn.execute(
                    """INSERT INTO entries (date, did_today, doing_tomorrow)
                       VALUES ($1, $2, $3)
                       ON CONFLICT (date) DO UPDATE SET
                         did_today      = COALESCE($2, entries.did_today),
                         doing_tomorrow = COALESCE($3, entries.doing_tomorrow),
                         updated_at     = now()""",
                    date, did_today, doing_tomorrow,
                )
            if habits:
                for habit_type_id_str, value in habits.items():
                    await conn.execute(
                        """INSERT INTO habit_logs (habit_type_id, date, value)
                           VALUES ($1, $2, $3::jsonb)
                           ON CONFLICT (habit_type_id, date) DO UPDATE SET value = $3::jsonb""",
                        int(habit_type_id_str), date, json.dumps(value),
                    )
    return {"ok": True}


# ── Calendar ──────────────────────────────────────────────────────────────────

@app.get("/api/calendar/{year}/{month}")
async def get_calendar(year: int, month: int, pool: asyncpg.Pool = Depends(get_pool)):
    start = f"{year}-{month:02d}-01"
    end = f"{year + 1}-01-01" if month == 12 else f"{year}-{month + 1:02d}-01"

    entry_rows = await pool.fetch(
        "SELECT date FROM entries WHERE date >= $1 AND date < $2", start, end
    )
    log_rows = await pool.fetch(
        "SELECT date, habit_type_id, value FROM habit_logs WHERE date >= $1 AND date < $2",
        start, end,
    )

    day_map: dict[str, dict] = {}
    for r in entry_rows:
        d = str(r["date"])
        if d not in day_map:
            day_map[d] = {"date": d, "entry": False, "habits": {}}
        day_map[d]["entry"] = True
    for r in log_rows:
        d = str(r["date"])
        if d not in day_map:
            day_map[d] = {"date": d, "entry": False, "habits": {}}
        day_map[d]["habits"][str(r["habit_type_id"])] = r["value"]

    days = sorted(day_map.values(), key=lambda x: x["date"])
    return {"ok": True, "days": days}


# ── Archive ───────────────────────────────────────────────────────────────────

@app.get("/api/archive")
async def get_archive(pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("""
        SELECT
          d.date,
          e.did_today,
          e.doing_tomorrow,
          COALESCE(
            json_object_agg(hl.habit_type_id::text, hl.value)
              FILTER (WHERE hl.habit_type_id IS NOT NULL),
            '{}'::json
          ) AS habits
        FROM (
          SELECT date FROM entries
          UNION
          SELECT date FROM habit_logs
        ) d
        LEFT JOIN entries e ON e.date = d.date
        LEFT JOIN habit_logs hl ON hl.date = d.date
        GROUP BY d.date, e.did_today, e.doing_tomorrow
        ORDER BY d.date DESC
    """)
    days = [
        {
            "date": str(r["date"]),
            "did_today": r["did_today"],
            "doing_tomorrow": r["doing_tomorrow"],
            "habits": r["habits"] if r["habits"] is not None else {},
        }
        for r in rows
    ]
    return {"ok": True, "days": days}


# ── Static (SPA fallback — must be last) ─────────────────────────────────────

if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
```

- [ ] **Step 2: Run tests — all should pass**

```bash
cd apps/daily-log
pytest tests/ -v
```

Expected: 9 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/daily-log/main.py apps/daily-log/db.py apps/daily-log/requirements.txt apps/daily-log/pytest.ini apps/daily-log/tests/
git commit -m "feat(daily-log): FastAPI backend + tests"
```

---

### Task 5: Replace Dockerfile

**Files:**
- Replace: `apps/daily-log/Dockerfile`

- [ ] **Step 1: Replace Dockerfile**

```dockerfile
# Build context: repo root
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY packages/ui ./packages/ui
COPY apps/daily-log/frontend/package.json apps/daily-log/frontend/package-lock.json ./apps/daily-log/frontend/
RUN cd apps/daily-log/frontend && npm ci
COPY apps/daily-log/frontend ./apps/daily-log/frontend
RUN cd apps/daily-log/frontend && npm run build

FROM python:3.12-slim AS runner
WORKDIR /app
COPY apps/daily-log/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/daily-log/main.py apps/daily-log/db.py ./
COPY --from=frontend-builder /app/apps/daily-log/public ./public
ENV PORT=4113
EXPOSE 4113
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4113"]
```

- [ ] **Step 2: Build the image locally to verify**

```bash
# From repo root
docker build -f apps/daily-log/Dockerfile -t daily-log-test .
```

Expected: build succeeds, no errors.

- [ ] **Step 3: Remove old Node.js backend files**

```bash
cd apps/daily-log
rm -f server.ts tsconfig.json package.json package-lock.json
rm -rf src/ node_modules/ dist/
```

- [ ] **Step 4: Commit**

```bash
git add apps/daily-log/Dockerfile
git rm -f apps/daily-log/server.ts apps/daily-log/tsconfig.json apps/daily-log/package.json apps/daily-log/package-lock.json 2>/dev/null || true
git commit -m "chore(daily-log): replace Node.js backend with Python Dockerfile"
```
