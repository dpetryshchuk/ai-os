"""create daily_log schema tables

Revision ID: 0001
Revises:
Create Date: 2026-05-18
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS habit_types (
            id         SERIAL PRIMARY KEY,
            name       TEXT NOT NULL,
            kind       TEXT NOT NULL CHECK (kind IN ('boolean', 'number')),
            active     BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS entries (
            date           DATE PRIMARY KEY,
            did_today      TEXT,
            doing_tomorrow TEXT,
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS habit_logs (
            habit_type_id INTEGER NOT NULL REFERENCES habit_types(id),
            date          DATE NOT NULL,
            value         JSONB,
            PRIMARY KEY (habit_type_id, date)
        )
    """))

    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_entries_date ON entries (date)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_habit_logs_date ON habit_logs (date)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS habit_logs"))
    op.execute(sa.text("DROP TABLE IF EXISTS entries"))
    op.execute(sa.text("DROP TABLE IF EXISTS habit_types"))
