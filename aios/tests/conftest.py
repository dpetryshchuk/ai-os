import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


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
