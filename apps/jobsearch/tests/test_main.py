import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from main import app, get_pool


def make_mock_pool():
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()
    return pool


@pytest.fixture
async def client():
    pool = make_mock_pool()
    app.dependency_overrides[get_pool] = lambda: pool
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c, pool
    app.dependency_overrides.clear()


async def test_health(client):
    c, _ = client
    r = await c.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "status": "healthy"}


async def test_get_pipeline_empty(client):
    c, pool = client
    pool.fetch.return_value = []
    r = await c.get("/api/data/pipeline")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["contacts"] == []


async def test_get_leads_empty(client):
    c, pool = client
    pool.fetch.return_value = []
    r = await c.get("/api/data/leads")
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_get_applications_empty(client):
    c, pool = client
    pool.fetch.return_value = []
    r = await c.get("/api/data/applications")
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_get_notes_empty(client):
    c, pool = client
    pool.fetch.return_value = []
    r = await c.get("/api/data/notes")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["notes"] == []


async def test_create_note(client):
    c, pool = client
    pool.fetchrow.return_value = {
        "id": "abc123",
        "category": "note",
        "title": "Test Note",
        "url": None,
        "content": "Some content",
        "created_at": None,
    }
    r = await c.post("/api/data/notes", json={"title": "Test Note", "content": "Some content"})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["note"]["id"] == "abc123"


async def test_delete_note(client):
    c, pool = client
    r = await c.delete("/api/data/notes/abc123")
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_get_content_empty(client):
    c, pool = client
    pool.fetch.return_value = []
    r = await c.get("/api/data/content")
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_upload_resume_no_file(client):
    c, _ = client
    r = await c.post("/api/data/resumes")
    assert r.status_code == 422


async def test_agent_stream_requires_messages(client):
    c, _ = client
    r = await c.post("/api/agents/jobsearch/stream", json={})
    assert r.status_code == 400
