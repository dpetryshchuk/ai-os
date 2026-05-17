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
