import secrets
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

import db

router = APIRouter()


def _row(r) -> dict[str, Any]:
    d = dict(r)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


@router.get("/")
async def list_ideas(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    rows = await pool.fetch("SELECT * FROM ideas ORDER BY created_at DESC")
    return {"ok": True, "ideas": [_row(r) for r in rows]}


@router.post("/")
async def create_idea(body: dict, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    if not body.get("content", "").strip():
        raise HTTPException(400, "content required")
    row = await pool.fetchrow(
        """INSERT INTO ideas (id, content, category, status, priority)
           VALUES ($1, $2, $3, $4, $5) RETURNING *""",
        secrets.token_hex(8),
        body["content"].strip(),
        body.get("category", "idea"),
        body.get("status", "open"),
        body.get("priority", "normal"),
    )
    return {"ok": True, "idea": _row(row)}


@router.patch("/{idea_id}")
async def update_idea(idea_id: str, body: dict, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    allowed = {"content", "category", "status", "priority"}
    fields, values = [], []
    for key in allowed:
        if key in body:
            fields.append(f"{key} = ${len(values) + 1}")
            values.append(body[key])
    if not fields:
        return {"ok": True}
    values.append(idea_id)
    await pool.execute(
        f"UPDATE ideas SET {', '.join(fields)}, updated_at = now() WHERE id = ${len(values)}",
        *values,
    )
    return {"ok": True}


@router.delete("/{idea_id}")
async def delete_idea(idea_id: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    await pool.execute("DELETE FROM ideas WHERE id = $1", idea_id)
    return {"ok": True}
