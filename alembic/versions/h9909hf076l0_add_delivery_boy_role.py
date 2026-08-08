"""Add DELIVERY_BOY to roleenum DB type

Revision ID: h9909hf076l0
Revises: g8808gf065k0
Create Date: 2026-08-08 20:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h9909hf076l0'
down_revision: Union[str, None] = 'g8808gf065k0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Execute idempotent ALTER TYPE for PostgreSQL
    conn.execute(sa.text("ALTER TYPE roleenum ADD VALUE IF NOT EXISTS 'DELIVERY_BOY'"))


def downgrade() -> None:
    pass
