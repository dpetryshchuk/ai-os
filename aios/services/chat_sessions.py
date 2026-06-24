import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path


def _db_path() -> Path:
    from config import settings
    return Path(settings.data_dir) / "sessions.db"


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path())
    c.row_factory = sqlite3.Row
    return c


def init() -> None:
    _db_path().parent.mkdir(parents=True, exist_ok=True)
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                title TEXT DEFAULT '',
                messages_json TEXT DEFAULT '[]',
                domain TEXT DEFAULT 'personal',
                created_at TEXT,
                updated_at TEXT
            )
        """)


init()


def save(session_id: str | None, title: str, messages: list, domain: str) -> str:
    now = datetime.utcnow().isoformat()
    if session_id:
        with _conn() as c:
            c.execute(
                "UPDATE chat_sessions SET title=?, messages_json=?, updated_at=? WHERE id=?",
                (title, json.dumps(messages), now, session_id),
            )
        return session_id
    sid = str(uuid.uuid4())
    with _conn() as c:
        c.execute(
            "INSERT INTO chat_sessions VALUES (?, ?, ?, ?, ?, ?)",
            (sid, title, json.dumps(messages), domain, now, now),
        )
    return sid


def list_all(limit: int = 30) -> list:
    with _conn() as c:
        rows = c.execute(
            """SELECT id, title, domain, created_at, updated_at
               FROM chat_sessions
               WHERE json_array_length(messages_json) > 0
               ORDER BY updated_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def get(session_id: str) -> dict | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM chat_sessions WHERE id=?", (session_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["messages"] = json.loads(d.pop("messages_json"))
    return d


def delete(session_id: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM chat_sessions WHERE id=?", (session_id,))
