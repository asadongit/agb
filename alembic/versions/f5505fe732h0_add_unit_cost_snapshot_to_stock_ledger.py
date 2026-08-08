"""Add unit_cost_snapshot to stock_ledger table

Revision ID: f5505fe732h0
Revises: f4404fd621g0
Create Date: 2026-08-08 02:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5505fe732h0'
down_revision: Union[str, None] = 'f4404fd621g0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('stock_ledger')]
    if 'unit_cost_snapshot' not in columns:
        op.add_column('stock_ledger', sa.Column('unit_cost_snapshot', sa.Numeric(precision=12, scale=4), nullable=True))


def downgrade() -> None:
    op.drop_column('stock_ledger', 'unit_cost_snapshot')
