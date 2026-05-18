from unittest.mock import AsyncMock


async def test_list_habits_empty(client, mock_daily_log_pool):
    mock_daily_log_pool.fetch = AsyncMock(return_value=[])
    r = await client.get("/api/daily-log/habits")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "habits": []}


async def test_create_habit_missing_fields(client, mock_daily_log_pool):
    r = await client.post("/api/daily-log/habits", json={"name": "exercise"})
    assert r.status_code == 400


async def test_create_habit_bad_kind(client, mock_daily_log_pool):
    r = await client.post("/api/daily-log/habits", json={"name": "exercise", "kind": "invalid"})
    assert r.status_code == 400


async def test_get_day_no_entry(client, mock_daily_log_pool):
    mock_daily_log_pool.fetchrow = AsyncMock(return_value=None)
    mock_daily_log_pool.fetch = AsyncMock(return_value=[])
    r = await client.get("/api/daily-log/day/2026-05-17")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["entry"] is None
    assert data["habits"] == []


async def test_get_archive_empty(client, mock_daily_log_pool):
    mock_daily_log_pool.fetch = AsyncMock(return_value=[])
    r = await client.get("/api/daily-log/archive")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "days": []}
