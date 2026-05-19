"""add location and scraped_at to job_postings

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-18
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS location TEXT"))
    op.execute(sa.text(
        "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()"
    ))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_job_postings_scraped_at ON job_postings (scraped_at DESC)"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_job_postings_scraped_at"))
    op.execute(sa.text("ALTER TABLE job_postings DROP COLUMN IF EXISTS scraped_at"))
    op.execute(sa.text("ALTER TABLE job_postings DROP COLUMN IF EXISTS location"))
