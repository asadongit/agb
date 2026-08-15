"""add_purchase_returns_table

Revision ID: dd0492fd7938
Revises: f85e00d392cf
Create Date: 2026-08-14 22:16:56.544751

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dd0492fd7938'
down_revision: Union[str, None] = 'f85e00d392cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'purchase_returns',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('return_number', sa.String(length=100), nullable=False),
        sa.Column('outlet_id', sa.UUID(), nullable=False),
        sa.Column('intake_id', sa.UUID(), nullable=True),
        sa.Column('item_id', sa.UUID(), nullable=False),
        sa.Column('supplier_name', sa.String(length=255), nullable=False),
        sa.Column('batch_number', sa.String(length=100), nullable=True),
        sa.Column('quantity', sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column('unit_cost', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('total_refund_amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('reason', sa.String(length=100), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['intake_id'], ['stock_intakes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['item_id'], ['inventory_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['outlet_id'], ['outlets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_purchase_returns_item_id'), 'purchase_returns', ['item_id'], unique=False)
    op.create_index(op.f('ix_purchase_returns_outlet_id'), 'purchase_returns', ['outlet_id'], unique=False)
    op.create_index(op.f('ix_purchase_returns_return_number'), 'purchase_returns', ['return_number'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_purchase_returns_return_number'), table_name='purchase_returns')
    op.drop_index(op.f('ix_purchase_returns_outlet_id'), table_name='purchase_returns')
    op.drop_index(op.f('ix_purchase_returns_item_id'), table_name='purchase_returns')
    op.drop_table('purchase_returns')
