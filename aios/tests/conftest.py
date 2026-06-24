"""Shared test fixtures.

The app uses two data-access drivers — asyncpg pools (FastAPI routes) and
psycopg2/SyncSession (Celery workers). Tests don't touch a real Postgres;
instead they inject recording fakes that satisfy the same interface, so a
module's invariant can be exercised without a database.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


# ── asyncpg pool fakes (FastAPI side) ─────────────────────────────────────────

@pytest.fixture
def mock_jobsearch_pool():
    pool = AsyncMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock(return_value=None)
    pool.acquire = MagicMock()
    return pool


@pytest.fixture
def mock_daily_log_pool():
    pool = AsyncMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock(return_value=None)
    pool.acquire = MagicMock()
    return pool


@pytest.fixture
async def client(mock_jobsearch_pool, mock_daily_log_pool):
    with (
        patch("db.init_jobsearch_pool", new_callable=AsyncMock),
        patch("db.close_jobsearch_pool", new_callable=AsyncMock),
        patch("db.init_daily_log_pool", new_callable=AsyncMock),
        patch("db.close_daily_log_pool", new_callable=AsyncMock),
    ):
        import main
        import db
        main.app.dependency_overrides[db.get_jobsearch_pool] = lambda: mock_jobsearch_pool
        main.app.dependency_overrides[db.get_daily_log_pool] = lambda: mock_daily_log_pool
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as c:
            yield c
        main.app.dependency_overrides.clear()


# ── psycopg2 connection fake (Celery side) ────────────────────────────────────

class FakeCursor:
    """Records every execute() and serves canned fetch results."""

    def __init__(self, store):
        self._store = store
        self._result: list = []

    def execute(self, sql, params=None):
        self._store["calls"].append((" ".join(sql.split()), params))
        # let a test stage a result keyed by a substring of the SQL
        for needle, rows in self._store["results"].items():
            if needle in sql:
                self._result = rows
                break
        else:
            self._result = []

    def fetchall(self):
        return self._result

    def fetchone(self):
        return self._result[0] if self._result else None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeConn:
    """psycopg2-shaped connection that records SQL instead of running it."""

    def __init__(self):
        self.store = {"calls": [], "results": {}, "commits": 0, "closed": False}

    def stage_result(self, sql_needle: str, rows: list):
        self.store["results"][sql_needle] = rows

    def cursor(self, *a, **k):
        return FakeCursor(self.store)

    def commit(self):
        self.store["commits"] += 1

    def close(self):
        self.store["closed"] = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, *a):
        # psycopg2 `with conn:` commits on clean exit, rolls back on error
        if exc_type is None:
            self.commit()
        return False

    # convenience accessors for assertions
    @property
    def executed(self):
        return [sql for sql, _ in self.store["calls"]]


@pytest.fixture
def fake_conn():
    return FakeConn()
