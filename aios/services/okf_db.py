# onekeyflow/db.py
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from config import settings

_DB = Path(settings.data_dir) / "okf.db"

_SEED = [
    ("Feb 2026", 0.0, 0.0, 0.0, 0.0, 0.28, "Sample entry"),
    ("Mar 2026", 0.0, 0.0, 0.0, 0.0, 0.28, "Sample entry"),
    ("Apr 2026", 0.0, 0.0, 0.0, 0.0, 0.28, "Sample entry"),
    ("May 2026", 0.0, 0.0, 0.0, 0.0, 0.28, "Sample entry"),
]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB)
    conn.row_factory = sqlite3.Row
    return conn


def _enrich(row: sqlite3.Row) -> dict:
    d = dict(row)
    net_revenue      = d["gross_revenue"] - d["service_fees"]
    total_overhead   = d["fixed_overhead"] + d["variable_overhead"]
    operating_profit = net_revenue - total_overhead
    tax_provision    = max(0.0, operating_profit) * d["tax_rate"]
    net_profit       = operating_profit - tax_provision
    net_margin       = net_profit / net_revenue if net_revenue else 0.0
    d.update(
        net_revenue=round(net_revenue, 2),
        total_overhead=round(total_overhead, 2),
        operating_profit=round(operating_profit, 2),
        tax_provision=round(tax_provision, 2),
        net_profit=round(net_profit, 2),
        net_margin=round(net_margin, 4),
    )
    return d


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init() -> None:
    _DB.parent.mkdir(parents=True, exist_ok=True)
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS monthly_pl (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            month             TEXT    NOT NULL UNIQUE,
            gross_revenue     REAL    NOT NULL DEFAULT 0,
            service_fees      REAL    NOT NULL DEFAULT 0,
            fixed_overhead    REAL    NOT NULL DEFAULT 0,
            variable_overhead REAL    NOT NULL DEFAULT 0,
            tax_rate          REAL    NOT NULL DEFAULT 0.28,
            notes             TEXT    NOT NULL DEFAULT ''
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id           TEXT PRIMARY KEY,
            type         TEXT NOT NULL,
            source       TEXT NOT NULL DEFAULT 'onekeyflow',
            status       TEXT NOT NULL DEFAULT 'pending',
            payload      TEXT,
            result       TEXT,
            error        TEXT,
            created_at   TEXT NOT NULL,
            started_at   TEXT,
            completed_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS outreach_sessions (
            id           TEXT PRIMARY KEY,
            date         TEXT NOT NULL,
            hours_worked REAL NOT NULL DEFAULT 0,
            notes        TEXT NOT NULL DEFAULT '',
            created_at   TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS outreach_contacts (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            company      TEXT NOT NULL DEFAULT '',
            linkedin_url TEXT NOT NULL DEFAULT '',
            message_sent TEXT NOT NULL DEFAULT '',
            status       TEXT NOT NULL DEFAULT 'sent',
            session_id   TEXT,
            notes        TEXT NOT NULL DEFAULT '',
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL
        )
    """)
    conn.commit()
    if conn.execute("SELECT COUNT(*) FROM monthly_pl").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO monthly_pl (month, gross_revenue, service_fees, fixed_overhead, variable_overhead, tax_rate, notes) VALUES (?,?,?,?,?,?,?)",
            _SEED,
        )
        conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Revenue
# ---------------------------------------------------------------------------

def get_all_months() -> list[dict]:
    conn = _connect()
    rows = conn.execute("SELECT * FROM monthly_pl ORDER BY id").fetchall()
    conn.close()
    return [_enrich(r) for r in rows]


def create_month(entry: dict) -> dict:
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO monthly_pl (month, gross_revenue, service_fees, fixed_overhead, variable_overhead, tax_rate, notes) VALUES (?,?,?,?,?,?,?)",
            (
                entry["month"],
                entry["gross_revenue"],
                entry.get("service_fees", 0.0),
                entry.get("fixed_overhead", 0.0),
                entry.get("variable_overhead", 0.0),
                entry.get("tax_rate", 0.28),
                entry.get("notes", ""),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM monthly_pl WHERE id=?", (cur.lastrowid,)).fetchone()
        return _enrich(row)
    finally:
        conn.close()


def update_month(id: int, entry: dict) -> dict | None:
    conn = _connect()
    try:
        conn.execute(
            "UPDATE monthly_pl SET month=?, gross_revenue=?, service_fees=?, fixed_overhead=?, variable_overhead=?, tax_rate=?, notes=? WHERE id=?",
            (
                entry["month"],
                entry["gross_revenue"],
                entry.get("service_fees", 0.0),
                entry.get("fixed_overhead", 0.0),
                entry.get("variable_overhead", 0.0),
                entry.get("tax_rate", 0.28),
                entry.get("notes", ""),
                id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM monthly_pl WHERE id=?", (id,)).fetchone()
        return _enrich(row) if row else None
    finally:
        conn.close()


def delete_month(id: int) -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM monthly_pl WHERE id=?", (id,))
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

def create_event(id: str, type: str, payload: dict) -> None:
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO events (id, type, payload, created_at) VALUES (?,?,?,?)",
            (id, type, json.dumps(payload), _now()),
        )
        conn.commit()
    finally:
        conn.close()


def start_event(id: str) -> None:
    conn = _connect()
    try:
        conn.execute(
            "UPDATE events SET status='processing', started_at=? WHERE id=?",
            (_now(), id),
        )
        conn.commit()
    finally:
        conn.close()


def complete_event(id: str, result: dict) -> None:
    conn = _connect()
    try:
        conn.execute(
            "UPDATE events SET status='done', result=?, completed_at=? WHERE id=?",
            (json.dumps(result), _now(), id),
        )
        conn.commit()
    finally:
        conn.close()


def fail_event(id: str, error: str) -> None:
    conn = _connect()
    try:
        conn.execute(
            "UPDATE events SET status='failed', error=?, completed_at=? WHERE id=?",
            (error, _now(), id),
        )
        conn.commit()
    finally:
        conn.close()


def list_events(limit: int = 100) -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM events ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    finally:
        conn.close()
    result = []
    for row in rows:
        d = dict(row)
        for key in ("payload", "result"):
            if d[key]:
                try:
                    d[key] = json.loads(d[key])
                except (json.JSONDecodeError, TypeError):
                    pass
        result.append(d)
    return result


# ---------------------------------------------------------------------------
# Outreach
# ---------------------------------------------------------------------------
import uuid as _uuid


def get_outreach_stats() -> dict:
    conn = _connect()
    try:
        counts = {}
        for status in ("sent", "connected", "replied", "converted", "ignored"):
            row = conn.execute(
                "SELECT COUNT(*) FROM outreach_contacts WHERE status = ?", (status,)
            ).fetchone()
            counts[status] = row[0]
        today = _now()[:10]
        today_row = conn.execute(
            "SELECT COUNT(*) FROM outreach_contacts WHERE date(created_at) = ?", (today,)
        ).fetchone()
        counts["today"] = today_row[0]
        return counts
    finally:
        conn.close()


def list_outreach_contacts(limit: int = 100, status: str | None = None) -> list[dict]:
    conn = _connect()
    try:
        if status:
            rows = conn.execute(
                "SELECT * FROM outreach_contacts WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM outreach_contacts ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def create_outreach_contact(data: dict) -> dict:
    conn = _connect()
    try:
        now = _now()
        id_ = str(_uuid.uuid4())
        conn.execute(
            "INSERT INTO outreach_contacts (id, name, company, linkedin_url, message_sent, status, session_id, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (id_, data["name"], data.get("company", ""), data.get("linkedin_url", ""),
             data.get("message_sent", ""), data.get("status", "sent"),
             data.get("session_id"), data.get("notes", ""), now, now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM outreach_contacts WHERE id = ?", (id_,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def update_outreach_contact(id_: str, data: dict) -> dict | None:
    conn = _connect()
    try:
        conn.execute(
            "UPDATE outreach_contacts SET name=?, company=?, linkedin_url=?, message_sent=?, status=?, notes=?, updated_at=? WHERE id=?",
            (data["name"], data.get("company", ""), data.get("linkedin_url", ""),
             data.get("message_sent", ""), data["status"], data.get("notes", ""),
             _now(), id_),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM outreach_contacts WHERE id = ?", (id_,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_weekly_retro(weeks: int = 4) -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute("""
            SELECT
                strftime('%Y-W%W', created_at) AS week,
                COUNT(*) AS total_sent,
                SUM(CASE WHEN status = 'connected' THEN 1 ELSE 0 END) AS connected,
                SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) AS replied,
                SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted
            FROM outreach_contacts
            GROUP BY week
            ORDER BY week DESC
            LIMIT ?
        """, (weeks,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
