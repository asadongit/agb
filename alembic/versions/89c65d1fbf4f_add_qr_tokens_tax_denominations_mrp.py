"""add_qr_tokens_tax_denominations_mrp

Revision ID: 89c65d1fbf4f
Revises: dd0492fd7938
Create Date: 2026-08-16 02:56:40.598114

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '89c65d1fbf4f'
down_revision: Union[str, None] = 'dd0492fd7938'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. Create basket_qr_tokens table if it doesn't exist
    if 'basket_qr_tokens' not in existing_tables:
        op.create_table(
            'basket_qr_tokens',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('outlet_id', sa.UUID(), nullable=False),
            sa.Column('basket_number', sa.String(length=50), nullable=False),
            sa.Column('token', sa.String(length=128), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.ForeignKeyConstraint(['outlet_id'], ['outlets.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('token')
        )

    # 2. Add mrp to order_items if not present
    order_items_cols = [c['name'] for c in inspector.get_columns('order_items')]
    if 'mrp' not in order_items_cols:
        with op.batch_alter_table('order_items', schema=None) as batch_op:
            batch_op.add_column(sa.Column('mrp', sa.Numeric(precision=10, scale=2), nullable=True))

    # 3. Add tax_amount and cash_denominations to orders if not present
    orders_cols = [c['name'] for c in inspector.get_columns('orders')]
    with op.batch_alter_table('orders', schema=None) as batch_op:
        if 'tax_amount' not in orders_cols:
            batch_op.add_column(sa.Column('tax_amount', sa.Numeric(precision=10, scale=2), nullable=True))
        if 'cash_denominations' not in orders_cols:
            batch_op.add_column(sa.Column('cash_denominations', sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'orders' in existing_tables:
        orders_cols = [c['name'] for c in inspector.get_columns('orders')]
        with op.batch_alter_table('orders', schema=None) as batch_op:
            if 'cash_denominations' in orders_cols:
                batch_op.drop_column('cash_denominations')
            if 'tax_amount' in orders_cols:
                batch_op.drop_column('tax_amount')

    if 'order_items' in existing_tables:
        order_items_cols = [c['name'] for c in inspector.get_columns('order_items')]
        if 'mrp' in order_items_cols:
            with op.batch_alter_table('order_items', schema=None) as batch_op:
                batch_op.drop_column('mrp')

    if 'basket_qr_tokens' in existing_tables:
        op.drop_table('basket_qr_tokens')
