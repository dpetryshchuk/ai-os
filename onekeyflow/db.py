# onekeyflow/db.py
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import config

_DB = Path(config.DATA_DIR) / "okf.db"

_SEED = [
    ("Feb 2026", 742.48,  74.248, 362.413, 234.75, 0.28, "BatsCRM $60 · Pearl West $682.48"),
    ("Mar 2026", 2000.00, 200.00, 527.813, 298.45, 0.28, "Irby Report Tool $1,500"),
    ("Apr 2026", 500.00,  50.00,  175.813,   0.00, 0.28, "Jeff Morning Prep Doc $500"),
    ("May 2026", 1000.00, 30.00,  179.813,   0.00, 0.28, "Irby Serial Number Tool $1,000 (50% upfront)"),
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
