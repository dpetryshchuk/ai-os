"""Tests for the event emitter — the single seam for creating an os_event.

emit() is the async adapter (FastAPI routes, asyncpg pool); emit_sync() is the
sync adapter (Celery, SyncSession ORM). Both own the same invariant: a
token_hex(8) id, status defaulting to 'pending', and a process_event enqueue.
"""
import json
from unittest.mock import MagicMock, patch

import events


async def test_emit_inserts_and_enqueues(mock_jobsearch_pool):
    with patch("events._enqueue") as enq:
        eid = await events.emit(mock_jobsearch_pool, "ui", "scrape.sd", {"a": 1})

    assert len(eid) == 16  # token_hex(8)
    sql, *args = mock_jobsearch_pool.execute.call_args.args
    assert "INSERT INTO os_events" in sql
    assert args == [eid, "ui", "scrape.sd", json.dumps({"a": 1})]
    enq.assert_called_once_with(eid)


async def test_emit_defaults_payload_to_empty(mock_jobsearch_pool):
    with patch("events._enqueue"):
        await events.emit(mock_jobsearch_pool, "webhook", "fathom.received")
    _, _, _, _, payload = mock_jobsearch_pool.execute.call_args.args
    assert payload == "{}"


def test_emit_sync_persists_and_enqueues():
    session = MagicMock()
    session_cm = MagicMock()
    session_cm.__enter__.return_value = session
    session_cm.__exit__.return_value = False

    with (
        patch("events.SyncSession", return_value=session_cm),
        patch("events._enqueue") as enq,
    ):
        eid = events.emit_sync("schedule", "scrape.yc", {})

    assert len(eid) == 16
    added = session.add.call_args.args[0]
    assert added.id == eid
    assert added.source == "schedule"
    assert added.type == "scrape.yc"
    assert added.status == "pending"
    session.commit.assert_called_once()
    enq.assert_called_once_with(eid)
