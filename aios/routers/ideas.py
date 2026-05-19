import secrets

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

import db
from schemas import (
    IdeaCreate,
    IdeaResponse,
    IdeaRow,
    IdeasResponse,
    IdeaUpdate,
    OkResponse,
)

router = APIRouter()


@router.get("/")
async def list_ideas(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> IdeasResponse:
    rows = await pool.fetch("SELECT * FROM ideas ORDER BY created_at DESC")
    return IdeasResponse(ideas=[IdeaRow.model_validate(dict(r)) for r in rows])


@router.post("/", status_code=201)
async def create_idea(body: IdeaCreate, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> IdeaResponse:
    row = await pool.fetchrow(
        """INSERT INTO ideas (id, content, category, status, priority)
           VALUES ($1, $2, $3, $4, $5) RETURNING *""",
        secrets.token_hex(8),
        body.content.strip(),
        body.category,
        body.status,
        body.priority,
    )
    return IdeaResponse(idea=IdeaRow.model_validate(dict(row)))


@router.patch("/{idea_id}")
async def update_idea(idea_id: str, body: IdeaUpdate, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> OkResponse:
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return OkResponse()
    fields = [f"{key} = ${i + 1}" for i, key in enumerate(updates)]
    values = list(updates.values())
    values.append(idea_id)
    await pool.execute(
        f"UPDATE ideas SET {', '.join(fields)}, updated_at = now() WHERE id = ${len(values)}",
        *values,
    )
    return OkResponse()


@router.delete("/{idea_id}")
async def delete_idea(idea_id: str, pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)) -> OkResponse:
    await pool.execute("DELETE FROM ideas WHERE id = $1", idea_id)
    return OkResponse()
