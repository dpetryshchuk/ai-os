from typing import Union
import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE look_items ADD COLUMN IF NOT EXISTS voice_path TEXT"))
    op.execute(sa.text("ALTER TABLE look_items ADD COLUMN IF NOT EXISTS voice_mime TEXT"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE look_items DROP COLUMN IF EXISTS voice_path"))
    op.execute(sa.text("ALTER TABLE look_items DROP COLUMN IF EXISTS voice_mime"))
