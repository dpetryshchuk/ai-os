"""Router smoke test: POST /trigger/{task_type} crosses the event emitter seam."""
from unittest.mock import patch


async def test_trigger_emits_event(client, mock_jobsearch_pool):
    with patch("events._enqueue") as enq:
        resp = await client.post("/api/jobsearch/trigger/scrape.sd")

    assert resp.status_code == 200
    eid = resp.json()["event_id"]
    sql, *args = mock_jobsearch_pool.execute.call_args.args
    assert "INSERT INTO os_events" in sql
    assert args[:3] == [eid, "ui", "scrape.sd"]
    enq.assert_called_once_with(eid)


async def test_trigger_rejects_unknown_type(client):
    resp = await client.post("/api/jobsearch/trigger/bogus.task")
    assert resp.status_code == 400
