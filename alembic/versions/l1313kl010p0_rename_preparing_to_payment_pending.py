"""Add PAYMENT_PENDING to orderstatusenum and update existing PREPARING rows

Revision ID: l1313kl010p0
Revises: k1212kj009o0
Create Date: 2026-08-09 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l1313kl010p0'
down_revision: Union[str, None] = 'k1212kj009o0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add PAYMENT_PENDING value to Postgres orderstatusenum if not already present
    if conn.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE orderstatusenum ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING'")

    # 2. Update existing rows with status 'PREPARING' to 'PAYMENT_PENDING'
    op.execute("UPDATE orders SET status = 'PAYMENT_PENDING' WHERE status = 'PREPARING'")


def downgrade() -> None:
    pass
