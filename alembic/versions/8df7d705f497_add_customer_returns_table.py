"""add_customer_returns_table

Revision ID: 8df7d705f497
Revises: 3fc33ca8be24
Create Date: 2026-08-17 18:07:11.445840

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8df7d705f497'
down_revision: Union[str, None] = '3fc33ca8be24'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'customer_returns',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('return_number', sa.String(length=100), nullable=False),
        sa.Column('outlet_id', sa.UUID(), nullable=False),
        sa.Column('order_id', sa.UUID(), nullable=True),
        sa.Column('customer_name', sa.String(length=255), nullable=True),
        sa.Column('customer_phone', sa.String(length=20), nullable=True),
        sa.Column('returned_items', sa.JSON(), nullable=False),
        sa.Column('total_refund_amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('refund_payment_method', sa.String(length=50), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['outlet_id'], ['outlets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_customer_returns_outlet_id'), 'customer_returns', ['outlet_id'], unique=False)
    op.create_index(op.f('ix_customer_returns_order_id'), 'customer_returns', ['order_id'], unique=False)
    op.create_index(op.f('ix_customer_returns_return_number'), 'customer_returns', ['return_number'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_customer_returns_return_number'), table_name='customer_returns')
    op.drop_index(op.f('ix_customer_returns_order_id'), table_name='customer_returns')
    op.drop_index(op.f('ix_customer_returns_outlet_id'), table_name='customer_returns')
    op.drop_table('customer_returns')
