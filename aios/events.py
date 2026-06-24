"""Event emitter — the single seam for creating an os_event and enqueuing it.

The system has two callers with different drivers: FastAPI routes (asyncpg
pool) and Celery (SyncSession ORM). Both must produce the same os_event row
and enqueue the same `process_event` task. This module owns that invariant once
and exposes one adapter per driver:

- ``emit(pool, ...)``      — async, for FastAPI routes
- ``emit_sync(...)``       — sync, for Celery tasks (self-manages a session)

The os_event contract — a ``token_hex(8)`` id, ``status`` defaulting to
``'pending'`` (DB ``server_default``), payload as JSON — lives here, not at
each call site.
"""
import json
import secrets

from db import SyncSession
from models import OsEvent


def new_event_id() -> str:
    return secrets.token_hex(8)


def _enqueue(event_id: str) -> None:
    # Lazy import: tasks.py imports this module, so importing it at module
    # level would create a cycle.
    from tasks import process_event
    process_event.delay(event_id)


async def emit(pool, source: str, type: str, payload: dict | None = None) -> str:
    """Persist an os_event via an asyncpg pool and enqueue it. Returns the id."""
    event_id = new_event_id()
    await pool.execute(
        "INSERT INTO os_events (id, source, type, payload) VALUES ($1,$2,$3,$4::jsonb)",
        event_id, source, type, json.dumps(payload or {}),
    )
    _enqueue(event_id)
    return event_id


def emit_sync(source: str, type: str, payload: dict | None = None) -> str:
    """Persist an os_event via a SyncSession and enqueue it. Returns the id."""
    event_id = new_event_id()
    with SyncSession() as session:
        session.add(
            OsEvent(
                id=event_id,
                source=source,
                type=type,
                payload=payload or {},
                status="pending",
            )
        )
        session.commit()
    _enqueue(event_id)
    return event_id
