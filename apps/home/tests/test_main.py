import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_health(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "status": "healthy"}


async def test_get_apps(client):
    r = await client.get("/api/apps")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    apps = data["apps"]
    assert len(apps) == 3
    names = [a["name"] for a in apps]
    assert "Job Search" in names
    assert "Writing" in names
    assert "Daily Log" in names


async def test_get_health_aggregation(client):
    """health endpoint polls the 3 apps and returns a status map."""
    mock_response = MagicMock()
    mock_response.status_code = 200

    with patch("main.httpx.AsyncClient") as mock_client_cls:
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_ctx.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_ctx

        r = await client.get("/api/system-health")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert "apps" in data
    assert all(v in ("ok", "error") for v in data["apps"].values())
