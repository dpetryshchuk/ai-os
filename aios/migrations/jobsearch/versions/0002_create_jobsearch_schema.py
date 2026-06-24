"""create jobsearch schema tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-18
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS companies (
            id          VARCHAR(16) PRIMARY KEY,
            name        TEXT NOT NULL,
            website     TEXT
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS contacts (
            id          VARCHAR(16) PRIMARY KEY,
            name        TEXT NOT NULL,
            company_id  VARCHAR(16) REFERENCES companies(id),
            role        TEXT,
            source      TEXT NOT NULL DEFAULT '',
            stage       TEXT NOT NULL DEFAULT 'Outreached',
            notes       TEXT
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS interactions (
            id          VARCHAR(16) PRIMARY KEY,
            contact_id  VARCHAR(16) REFERENCES contacts(id),
            date        DATE NOT NULL,
            direction   TEXT NOT NULL,
            notes       TEXT
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS job_postings (
            id           VARCHAR(16) PRIMARY KEY,
            company_id   VARCHAR(16) REFERENCES companies(id),
            title        TEXT NOT NULL,
            link         TEXT,
            source       TEXT NOT NULL DEFAULT '',
            status       TEXT NOT NULL DEFAULT 'new',
            resume_path  TEXT,
            scraped_date DATE,
            description  TEXT
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS content_posts (
            id           VARCHAR(16) PRIMARY KEY,
            posted_date  DATE NOT NULL,
            content      TEXT,
            impressions  INTEGER NOT NULL DEFAULT 0,
            engagements  INTEGER NOT NULL DEFAULT 0,
            comments     INTEGER NOT NULL DEFAULT 0
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS notes (
            id          VARCHAR(16) PRIMARY KEY,
            category    TEXT NOT NULL DEFAULT 'note',
            title       TEXT,
            url         TEXT,
            content     TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    # Indexes
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_contacts_stage ON contacts (stage)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_contacts_company_id ON contacts (company_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_interactions_contact_id ON interactions (contact_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_interactions_date ON interactions (date)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_job_postings_status ON job_postings (status)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_job_postings_company_id ON job_postings (company_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_notes_created_at ON notes (created_at)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS notes"))
    op.execute(sa.text("DROP TABLE IF EXISTS content_posts"))
    op.execute(sa.text("DROP TABLE IF EXISTS job_postings"))
    op.execute(sa.text("DROP TABLE IF EXISTS interactions"))
    op.execute(sa.text("DROP TABLE IF EXISTS contacts"))
    op.execute(sa.text("DROP TABLE IF EXISTS companies"))
