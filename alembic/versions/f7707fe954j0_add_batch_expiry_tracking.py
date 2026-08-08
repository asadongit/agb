"""Add batch expiry tracking to stock intakes

Revision ID: f7707fe954j0
Revises: f6606fe843i0
Create Date: 2026-08-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f7707fe954j0'
down_revision: Union[str, None] = 'f6606fe843i0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('stock_intakes')] if inspector.has_table('stock_intakes') else []

    with op.batch_alter_table('stock_intakes', schema=None) as batch_op:
        if 'remaining_quantity' not in columns:
            batch_op.add_column(sa.Column('remaining_quantity', sa.Numeric(precision=12, scale=3), server_default='0.000', nullable=False))
        if 'expiry_date' not in columns:
            batch_op.add_column(sa.Column('expiry_date', sa.DateTime(), nullable=True))
            batch_op.create_index(batch_op.f('ix_stock_intakes_expiry_date'), ['expiry_date'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('stock_intakes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_stock_intakes_expiry_date'))
        batch_op.drop_column('expiry_date')
        batch_op.drop_column('remaining_quantity')
