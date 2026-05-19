import json

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

import db
from schemas import (
    ArchiveDay,
    ArchiveResponse,
    CalendarDay,
    CalendarResponse,
    DayResponse,
    DayUpsert,
    EntryRow,
    HabitCreate,
    HabitLogRow,
    HabitResponse,
    HabitRow,
    HabitsResponse,
    HabitUpdate,
    OkResponse,
)

router = APIRouter()


# ── Habits ────────────────────────────────────────────────────────────────────

@router.get("/habits")
async def list_habits(pool: asyncpg.Pool = Depends(db.get_daily_log_pool)) -> HabitsResponse:
    rows = await pool.fetch(
        "SELECT id, name, kind, active, created_at FROM habit_types ORDER BY id"
    )
    return HabitsResponse(habits=[HabitRow.model_validate(dict(r)) for r in rows])


@router.post("/habits", status_code=201)
async def create_habit(body: HabitCreate, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)) -> HabitResponse:
    row = await pool.fetchrow(
        "INSERT INTO habit_types (name, kind) VALUES ($1, $2)"
        " RETURNING id, name, kind, active, created_at",
        body.name, body.kind,
    )
    return HabitResponse(habit=HabitRow.model_validate(dict(row)))


@router.patch("/habits/{habit_id}")
async def update_habit(habit_id: int, body: HabitUpdate, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)) -> HabitResponse:
    row = await pool.fetchrow(
        """UPDATE habit_types
              SET name   = COALESCE($2, name),
                  active = COALESCE($3, active)
            WHERE id = $1
        RETURNING id, name, kind, active, created_at""",
        habit_id,
        body.name,
        body.active,
    )
    if not row:
        raise HTTPException(404, f"Habit type {habit_id} not found")
    return HabitResponse(habit=HabitRow.model_validate(dict(row)))


# ── Day ───────────────────────────────────────────────────────────────────────

@router.get("/day/{date}")
async def get_day(date: str, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)) -> DayResponse:
    entry_row = await pool.fetchrow(
        "SELECT date, did_today, doing_tomorrow, updated_at FROM entries WHERE date = $1", date
    )
    habit_rows = await pool.fetch(
        "SELECT habit_type_id, date, value FROM habit_logs WHERE date = $1", date
    )
    return DayResponse(
        entry=EntryRow.model_validate(dict(entry_row)) if entry_row else None,
        habits=[HabitLogRow.model_validate(dict(r)) for r in habit_rows],
    )


@router.put("/day/{date}")
async def upsert_day(date: str, body: DayUpsert, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)) -> OkResponse:
    async with pool.acquire() as conn:
        async with conn.transaction():
            if body.did_today is not None or body.doing_tomorrow is not None:
                await conn.execute(
                    """INSERT INTO entries (date, did_today, doing_tomorrow)
                       VALUES ($1, $2, $3)
                       ON CONFLICT (date) DO UPDATE SET
                         did_today      = COALESCE($2, entries.did_today),
                         doing_tomorrow = COALESCE($3, entries.doing_tomorrow),
                         updated_at     = now()""",
                    date, body.did_today, body.doing_tomorrow,
                )
            if body.habits:
                for habit_type_id_str, value in body.habits.items():
                    await conn.execute(
                        """INSERT INTO habit_logs (habit_type_id, date, value)
                           VALUES ($1, $2, $3::jsonb)
                           ON CONFLICT (habit_type_id, date) DO UPDATE SET value = $3::jsonb""",
                        int(habit_type_id_str), date, json.dumps(value),
                    )
    return OkResponse()


# ── Calendar ──────────────────────────────────────────────────────────────────

@router.get("/calendar/{year}/{month}")
async def get_calendar(year: int, month: int, pool: asyncpg.Pool = Depends(db.get_daily_log_pool)) -> CalendarResponse:
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

    days = [CalendarDay.model_validate(v) for v in sorted(day_map.values(), key=lambda x: x["date"])]
    return CalendarResponse(days=days)


# ── Archive ───────────────────────────────────────────────────────────────────

@router.get("/archive")
async def get_archive(pool: asyncpg.Pool = Depends(db.get_daily_log_pool)) -> ArchiveResponse:
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
        ArchiveDay(
            date=str(r["date"]),
            did_today=r["did_today"],
            doing_tomorrow=r["doing_tomorrow"],
            habits=r["habits"] if r["habits"] is not None else {},
        )
        for r in rows
    ]
    return ArchiveResponse(days=days)
