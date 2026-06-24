"""Tests for the embedding store's sync adapter.

upsert_sync() is the psycopg2-side mirror of the async upsert(). It owns the
embeddings-table contract (column set, ON CONFLICT key, text truncation, vector
formatting) so the Celery tasks no longer each re-type the same INSERT.
"""
from unittest.mock import patch

from services import embeddings


def test_upsert_sync_embeds_and_upserts(fake_conn):
    with patch("services.embeddings.embed_sync", return_value=[0.1, 0.2, 0.3]) as emb:
        embeddings.upsert_sync(fake_conn, "note", "note-1", "hello world")

    emb.assert_called_once_with("hello world")
    sql, params = fake_conn.store["calls"][-1]
    assert "INSERT INTO embeddings" in sql
    assert "ON CONFLICT (source_type, source_id)" in sql

    eid, source_type, source_id, chunk, vec = params
    assert len(eid) == 16
    assert source_type == "note"
    assert source_id == "note-1"
    assert chunk == "hello world"
    assert vec == "[0.10000000,0.20000000,0.30000000]"
    assert fake_conn.store["commits"] >= 1


def test_upsert_sync_truncates_chunk_to_4000(fake_conn):
    long_text = "x" * 9000
    with patch("services.embeddings.embed_sync", return_value=[0.0]):
        embeddings.upsert_sync(fake_conn, "vault", "big.md", long_text)
    _, params = fake_conn.store["calls"][-1]
    assert len(params[3]) == 4000
