"""Drop old is_active column or remove NOT NULL constraint from table_sessions

Revision ID: j1111ji098n0
Revises: i1010ih087m0
Create Date: 2026-08-08 21:34:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j1111ji098n0'
down_revision: Union[str, None] = 'i1010ih087m0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table('table_sessions'):
        return

    columns = [c['name'] for c in inspector.get_columns('table_sessions')]

    if 'is_active' in columns:
        # First drop NOT NULL constraint in case drop_column fails due to dependencies
        conn.execute(sa.text("ALTER TABLE table_sessions ALTER COLUMN is_active DROP NOT NULL"))
        # Drop the legacy column
        conn.execute(sa.text("ALTER TABLE table_sessions DROP COLUMN IF EXISTS is_active"))


def downgrade() -> None:
    pass
