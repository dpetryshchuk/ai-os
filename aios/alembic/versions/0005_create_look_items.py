from typing import Union
import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS look_items (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            media_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            mime_type TEXT,
            note TEXT,
            source TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_look_items_created_at ON look_items (created_at DESC)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_look_items_category ON look_items (category)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS look_items"))
