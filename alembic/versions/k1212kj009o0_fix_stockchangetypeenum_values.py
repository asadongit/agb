"""Add uppercase and lowercase values to stockchangetypeenum

Revision ID: k1212kj009o0
Revises: j1111ji098n0
Create Date: 2026-08-08 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k1212kj009o0'
down_revision: Union[str, None] = 'j1111ji098n0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add both uppercase and lowercase enum values to stockchangetypeenum
    values = [
        'INTAKE', 'AUTO_DEDUCTION', 'MANUAL_ADJUSTMENT', 'RESTOCK',
        'intake', 'auto_deduction', 'manual_adjustment', 'restock'
    ]
    for val in values:
        conn.execute(sa.text(f"ALTER TYPE stockchangetypeenum ADD VALUE IF NOT EXISTS '{val}';"))


def downgrade() -> None:
    pass
