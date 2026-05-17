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
