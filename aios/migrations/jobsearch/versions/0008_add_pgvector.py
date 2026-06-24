"""add pgvector embeddings table

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-23
"""
from alembic import op

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("""
        CREATE TABLE IF NOT EXISTS embeddings (
            id          TEXT PRIMARY KEY,
            source_type TEXT NOT NULL,
            source_id   TEXT NOT NULL,
            chunk_text  TEXT NOT NULL,
            embedding   vector(1536),
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (source_type, source_id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS embeddings_vec_idx
        ON embeddings USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS embeddings")
    op.execute("DROP EXTENSION IF EXISTS vector")
