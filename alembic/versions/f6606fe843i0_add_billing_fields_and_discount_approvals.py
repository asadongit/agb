"""Add billing fields and discount approvals table

Revision ID: f6606fe843i0
Revises: f5505fe732h0
Create Date: 2026-08-08 03:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f6606fe843i0'
down_revision: Union[str, None] = 'f5505fe732h0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # 1. Update orders table
    order_cols = [c['name'] for c in inspector.get_columns('orders')]
    if 'source' not in order_cols:
        op.add_column('orders', sa.Column('source', sa.String(length=20), server_default='qr', nullable=False))
    if 'created_by_staff_id' not in order_cols:
        op.add_column('orders', sa.Column('created_by_staff_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    if 'subtotal_amount' not in order_cols:
        op.add_column('orders', sa.Column('subtotal_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'discount_type' not in order_cols:
        op.add_column('orders', sa.Column('discount_type', sa.String(length=30), nullable=True))
    if 'discount_value' not in order_cols:
        op.add_column('orders', sa.Column('discount_value', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'discount_reason' not in order_cols:
        op.add_column('orders', sa.Column('discount_reason', sa.String(length=500), nullable=True))
    if 'discount_status' not in order_cols:
        op.add_column('orders', sa.Column('discount_status', sa.String(length=30), nullable=True))
    if 'payment_method' not in order_cols:
        op.add_column('orders', sa.Column('payment_method', sa.String(length=30), nullable=True))
    if 'finalized_at' not in order_cols:
        op.add_column('orders', sa.Column('finalized_at', sa.DateTime(), nullable=True))
    if 'paid_at' not in order_cols:
        op.add_column('orders', sa.Column('paid_at', sa.DateTime(), nullable=True))

    # 2. Update order_items table
    item_cols = [c['name'] for c in inspector.get_columns('order_items')]
    if 'item_name' not in item_cols:
        op.add_column('order_items', sa.Column('item_name', sa.String(length=255), nullable=True))
    if 'is_complimentary' not in item_cols:
        op.add_column('order_items', sa.Column('is_complimentary', sa.Boolean(), server_default='false', nullable=False))
    if 'line_total' not in item_cols:
        op.add_column('order_items', sa.Column('line_total', sa.Numeric(precision=10, scale=2), nullable=True))

    # 3. Create bill_discount_approvals table if not exists
    tables = inspector.get_table_names()
    if 'bill_discount_approvals' not in tables:
        op.create_table(
            'bill_discount_approvals',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('order_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('orders.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('requested_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('approved_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('status', sa.String(length=20), server_default='PENDING', nullable=False),
            sa.Column('discount_type', sa.String(length=30), nullable=False),
            sa.Column('discount_value', sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column('reason_note', sa.String(length=500), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.Column('resolved_at', sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    op.drop_table('bill_discount_approvals')
    op.drop_column('order_items', 'line_total')
    op.drop_column('order_items', 'is_complimentary')
    op.drop_column('order_items', 'item_name')
    op.drop_column('orders', 'paid_at')
    op.drop_column('orders', 'finalized_at')
    op.drop_column('orders', 'payment_method')
    op.drop_column('orders', 'discount_status')
    op.drop_column('orders', 'discount_reason')
    op.drop_column('orders', 'discount_value')
    op.drop_column('orders', 'discount_type')
    op.drop_column('orders', 'subtotal_amount')
    op.drop_column('orders', 'created_by_staff_id')
    op.drop_column('orders', 'source')
