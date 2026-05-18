import json
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

import db

router = APIRouter()


def _row(record) -> dict[str, Any]:
    d = dict(record)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


# ── Habits ────────────────────────────────────────────────────────────────────

@router.get("/habits")
async def list_habits(pool: asyncpg.Pool = Depends(db.get_daily_log_pool)):
    rows = await pool.fetch(
        "SELECT id, name, kind, active, created_at FROM habit_types ORDER BY id"
    )
    return {"ok": True, "habits": [_row(r) for r in rows]}


@router.post("/habits", status_code=201)
async def create_habit(body: dict, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)):
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


@router.patch("/habits/{habit_id}")
async def update_habit(habit_id: int, body: dict, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)):
    row = await pool.fetchrow(
        """UPDATE habit_types
              SET name   = COALESCE($2, name),
                  active = COALESCE($3, active)
            WHERE id = $1
        RETURNING id, name, kind, active, created_at""",
        habit_id,
        body.get("name"),
        body.get("active"),
    )
    if not row:
        raise HTTPException(404, f"Habit type {habit_id} not found")
    return {"ok": True, "habit": _row(row)}


# ── Day ───────────────────────────────────────────────────────────────────────

@router.get("/day/{date}")
async def get_day(date: str, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)):
    entry_row = await pool.fetchrow(
        "SELECT date, did_today, doing_tomorrow, updated_at FROM entries WHERE date = $1", date
    )
    habit_rows = await pool.fetch(
        "SELECT habit_type_id, date, value FROM habit_logs WHERE date = $1", date
    )
    habits = [
        {"habit_type_id": r["habit_type_id"], "date": str(r["date"]), "value": r["value"]}
        for r in habit_rows
    ]
    return {"ok": True, "entry": _row(entry_row) if entry_row else None, "habits": habits}


@router.put("/day/{date}")
async def upsert_day(date: str, body: dict, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)):
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

@router.get("/calendar/{year}/{month}")
async def get_calendar(year: int, month: int, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)):
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
        day_map.setdefault(d, {"date": d, "entry": False, "habits": {}})["entry"] = True
    for r in log_rows:
        d = str(r["date"])
        day_map.setdefault(d, {"date": d, "entry": False, "habits": {}})["habits"][
            str(r["habit_type_id"])
        ] = r["value"]

    return {"ok": True, "days": sorted(day_map.values(), key=lambda x: x["date"])}


# ── Archive ───────────────────────────────────────────────────────────────────

@router.get("/archive")
async def get_archive(pool: asyncpg.Pool = Depends(db.get_daily_log_pool)):
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
    return {
        "ok": True,
        "days": [
            {
                "date": str(r["date"]),
                "did_today": r["did_today"],
                "doing_tomorrow": r["doing_tomorrow"],
                "habits": r["habits"] if r["habits"] is not None else {},
            }
            for r in rows
        ],
    }
