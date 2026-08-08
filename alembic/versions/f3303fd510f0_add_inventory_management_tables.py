"""Add inventory management tables

Revision ID: f3303fd510f0
Revises: e2202fc409e9
Create Date: 2026-08-08 00:44:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f3303fd510f0'
down_revision: Union[str, None] = 'e2202fc409e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # 1. inventory_items table
    if 'inventory_items' not in existing_tables:
        op.create_table(
            'inventory_items',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('unit', sa.Enum('kg', 'g', 'l', 'ml', 'pcs', name='inventoryunitenum'), nullable=False),
            sa.Column('category', sa.String(length=100), nullable=False, server_default='General'),
            sa.Column('current_stock', sa.Numeric(precision=12, scale=3), nullable=False, server_default='0.000'),
            sa.Column('reorder_threshold', sa.Numeric(precision=12, scale=3), nullable=False, server_default='0.000'),
            sa.Column('cost_per_unit', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        )

    # 2. stock_intakes table
    if 'stock_intakes' not in existing_tables:
        op.create_table(
            'stock_intakes',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('inventory_items.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('quantity', sa.Numeric(precision=12, scale=3), nullable=False),
            sa.Column('unit_cost', sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column('supplier_name', sa.String(length=255), nullable=True),
            sa.Column('intake_date', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
            sa.Column('added_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        )

    # 3. menu_item_recipes table
    if 'menu_item_recipes' not in existing_tables:
        op.create_table(
            'menu_item_recipes',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('menu_item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('menu_items.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('inventory_item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('inventory_items.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('quantity_required', sa.Numeric(precision=12, scale=3), nullable=False),
            sa.Column('unit', sa.Enum('kg', 'g', 'l', 'ml', 'pcs', name='inventoryunitenum'), nullable=False),
        )

    # 4. stock_ledger table
    if 'stock_ledger' not in existing_tables:
        op.create_table(
            'stock_ledger',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('inventory_items.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('change_type', sa.Enum('intake', 'auto_deduction', 'manual_adjustment', 'restock', name='stockchangetypeenum'), nullable=False),
            sa.Column('quantity_change', sa.Numeric(precision=12, scale=3), nullable=False),
            sa.Column('resulting_stock', sa.Numeric(precision=12, scale=3), nullable=False),
            sa.Column('reference_order_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('orders.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        )


def downgrade() -> None:
    op.drop_table('stock_ledger')
    op.drop_table('menu_item_recipes')
    op.drop_table('stock_intakes')
    op.drop_table('inventory_items')
