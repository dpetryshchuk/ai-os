"""create ideas table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-19
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ideas (
            id          TEXT PRIMARY KEY,
            content     TEXT NOT NULL,
            category    TEXT NOT NULL DEFAULT 'idea'
                            CHECK (category IN ('idea', 'fix', 'todo', 'vision')),
            status      TEXT NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'done')),
            priority    TEXT NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('low', 'normal', 'high')),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ideas_status   ON ideas (status)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ideas_category ON ideas (category)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ideas_created  ON ideas (created_at DESC)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS ideas"))
