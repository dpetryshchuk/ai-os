import json
import secrets

import asyncpg


async def create(pool: asyncpg.Pool, source: str, type: str, payload: dict) -> str:
    eid = secrets.token_hex(8)
    await pool.execute(
        "INSERT INTO os_events (id, source, type, payload) VALUES ($1, $2, $3, $4::jsonb)",
        eid,
        source,
        type,
        json.dumps(payload),
    )
    return eid
