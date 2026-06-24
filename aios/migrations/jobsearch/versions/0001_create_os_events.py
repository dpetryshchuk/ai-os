"""create os_events table

Revision ID: 0001
Revises:
Create Date: 2026-05-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "os_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True, server_default="{}"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_os_events_status", "os_events", ["status"])
    op.create_index("ix_os_events_type", "os_events", ["type"])
    op.create_index("ix_os_events_created_at", "os_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_os_events_created_at", table_name="os_events")
    op.drop_index("ix_os_events_type", table_name="os_events")
    op.drop_index("ix_os_events_status", table_name="os_events")
    op.drop_table("os_events")
