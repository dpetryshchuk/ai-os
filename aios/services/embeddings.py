import secrets

import litellm
import asyncpg

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


def _vec_str(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in v) + "]"


def embed_sync(text: str) -> list[float]:
    """Synchronous embedding — for use in Celery tasks."""
    resp = litellm.embedding(model=EMBEDDING_MODEL, input=[text[:8000]])
    d = resp.data[0]
    return d["embedding"] if isinstance(d, dict) else d.embedding


async def embed_async(text: str) -> list[float]:
    """Async embedding — for use in FastAPI routes."""
    resp = await litellm.aembedding(model=EMBEDDING_MODEL, input=[text[:8000]])
    d = resp.data[0]
    return d["embedding"] if isinstance(d, dict) else d.embedding


async def upsert(pool: asyncpg.Pool, source_type: str, source_id: str, text: str) -> None:
    vec = await embed_async(text)
    eid = secrets.token_hex(8)
    await pool.execute(
        """
        INSERT INTO embeddings (id, source_type, source_id, chunk_text, embedding)
        VALUES ($1, $2, $3, $4, $5::vector)
        ON CONFLICT (source_type, source_id)
        DO UPDATE SET chunk_text = EXCLUDED.chunk_text,
                      embedding  = EXCLUDED.embedding
        """,
        eid, source_type, source_id, text[:4000], _vec_str(vec),
    )


async def search(
    pool: asyncpg.Pool,
    query: str,
    limit: int = 8,
    source_type: str | None = None,
) -> list[dict]:
    vec = await embed_async(query)
    if source_type:
        rows = await pool.fetch(
            """
            SELECT source_type, source_id, chunk_text,
                   1 - (embedding <=> $1::vector) AS similarity
            FROM embeddings
            WHERE source_type = $3
            ORDER BY embedding <=> $1::vector
            LIMIT $2
            """,
            _vec_str(vec), limit, source_type,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT source_type, source_id, chunk_text,
                   1 - (embedding <=> $1::vector) AS similarity
            FROM embeddings
            ORDER BY embedding <=> $1::vector
            LIMIT $2
            """,
            _vec_str(vec), limit,
        )
    return [dict(r) for r in rows]
