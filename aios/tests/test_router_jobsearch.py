from unittest.mock import AsyncMock


async def test_get_pipeline_empty(client, mock_jobsearch_pool):
    mock_jobsearch_pool.fetch = AsyncMock(return_value=[])
    r = await client.get("/api/jobsearch/pipeline")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "contacts": []}


async def test_get_leads_empty(client, mock_jobsearch_pool):
    mock_jobsearch_pool.fetch = AsyncMock(return_value=[])
    r = await client.get("/api/jobsearch/leads")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "leads": []}


async def test_get_applications_empty(client, mock_jobsearch_pool):
    mock_jobsearch_pool.fetch = AsyncMock(return_value=[])
    r = await client.get("/api/jobsearch/applications")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "applications": []}


async def test_get_notes_empty(client, mock_jobsearch_pool):
    mock_jobsearch_pool.fetch = AsyncMock(return_value=[])
    r = await client.get("/api/jobsearch/notes")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "notes": []}


async def test_get_notes_with_search(client, mock_jobsearch_pool):
    mock_jobsearch_pool.fetch = AsyncMock(return_value=[])
    r = await client.get("/api/jobsearch/notes?q=python")
    assert r.status_code == 200


async def test_get_events_empty(client, mock_jobsearch_pool):
    mock_jobsearch_pool.fetch = AsyncMock(return_value=[])
    r = await client.get("/api/jobsearch/events")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "events": []}


async def test_delete_note(client, mock_jobsearch_pool):
    mock_jobsearch_pool.execute = AsyncMock(return_value=None)
    r = await client.delete("/api/jobsearch/notes/abc123")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


async def test_agent_stream_missing_messages(client):
    r = await client.post("/api/jobsearch/agents/stream", json={})
    assert r.status_code == 400
