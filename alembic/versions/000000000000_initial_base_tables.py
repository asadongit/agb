"""initial base tables

Revision ID: 000000000000
Revises: 
Create Date: 2026-08-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '000000000000'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    # 1. restaurants
    if not inspector.has_table('restaurants'):
        op.create_table(
        'restaurants',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('payment_mode', sa.Enum('RAZORPAY_GATEWAY', 'PAY_AT_COUNTER', 'BOTH', name='paymentmodeenum'), nullable=False),
        sa.Column('razorpay_account_id', sa.String(length=255), nullable=True),
        sa.Column('direct_upi_id', sa.String(length=255), nullable=True),
        sa.Column('raw_upi_payload', sa.String(length=1024), nullable=True),
        sa.Column('session_duration_minutes', sa.Integer(), server_default='30', nullable=False),
        sa.Column('verification_amount_cutoff', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('flagged_item_ids', sa.JSON(), server_default='[]', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_restaurants')),
        sa.UniqueConstraint('slug', name=op.f('uq_restaurants_slug'))
    )
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_restaurants_slug'), ['slug'], unique=True)

    # 2. users
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('restaurant_id', sa.UUID(), nullable=True),
        sa.Column('role', sa.Enum('SUPERADMIN', 'RESTAURANT_ADMIN', 'MANAGER', 'FLOOR_STAFF', 'CASHIER', 'WAITER', 'STAFF', name='roleenum'), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('password_hash', sa.String(length=512), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('refresh_token_hash', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], name=op.f('fk_users_restaurant_id_restaurants'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
        sa.UniqueConstraint('email', name=op.f('uq_users_email'))
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)
        batch_op.create_index(batch_op.f('ix_users_restaurant_id'), ['restaurant_id'], unique=False)

    # 3. categories
    op.create_table(
        'categories',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('restaurant_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('display_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], name=op.f('fk_categories_restaurant_id_restaurants'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_categories')),
        sa.UniqueConstraint('restaurant_id', 'name', name='uq_categories_restaurant_id_name')
    )
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_categories_restaurant_id'), ['restaurant_id'], unique=False)

    # 4. menu_items
    op.create_table(
        'menu_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('restaurant_id', sa.UUID(), nullable=False),
        sa.Column('category_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('image_url', sa.String(length=1024), nullable=True),
        sa.Column('is_available', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('pricing_mode', sa.Enum('WEIGHT_BASED', 'FIXED_UNIT', name='pricingmodeenum'), server_default='FIXED_UNIT', nullable=False),
        sa.Column('unit_label', sa.String(length=50), server_default='piece', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], name=op.f('fk_menu_items_category_id_categories'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], name=op.f('fk_menu_items_restaurant_id_restaurants'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_menu_items'))
    )
    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_menu_items_category_id'), ['category_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_menu_items_restaurant_id'), ['restaurant_id'], unique=False)

    # 5. menu_item_variants
    op.create_table(
        'menu_item_variants',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('menu_item_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('price_delta', sa.Numeric(precision=10, scale=2), server_default='0.00', nullable=False),
        sa.Column('is_available', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['menu_item_id'], ['menu_items.id'], name=op.f('fk_menu_item_variants_menu_item_id_menu_items'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_menu_item_variants'))
    )
    with op.batch_alter_table('menu_item_variants', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_menu_item_variants_menu_item_id'), ['menu_item_id'], unique=False)

    # 6. orders
    op.create_table(
        'orders',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('restaurant_id', sa.UUID(), nullable=False),
        sa.Column('table_number', sa.String(length=50), nullable=False),
        sa.Column('customer_name', sa.String(length=255), nullable=True),
        sa.Column('customer_phone', sa.String(length=20), nullable=True),
        sa.Column('total_amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'PENDING_VERIFICATION', 'PAID', 'PREPARING', 'COMPLETED', 'CANCELLED', 'REFUNDED', name='orderstatusenum'), nullable=False),
        sa.Column('payment_reference', sa.String(length=255), nullable=True),
        sa.Column('source', sa.String(length=20), server_default='qr', nullable=False),
        sa.Column('is_auto_verified', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], name=op.f('fk_orders_restaurant_id_restaurants'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_orders'))
    )
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_orders_restaurant_id'), ['restaurant_id'], unique=False)

    # 7. order_items
    op.create_table(
        'order_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('order_id', sa.UUID(), nullable=False),
        sa.Column('menu_item_id', sa.UUID(), nullable=True),
        sa.Column('variant_id', sa.UUID(), nullable=True),
        sa.Column('quantity', sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['menu_item_id'], ['menu_items.id'], name=op.f('fk_order_items_menu_item_id_menu_items'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], name=op.f('fk_order_items_order_id_orders'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['variant_id'], ['menu_item_variants.id'], name=op.f('fk_order_items_variant_id_menu_item_variants'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_order_items'))
    )
    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_order_items_order_id'), ['order_id'], unique=False)

    # 8. audit_logs
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('restaurant_id', sa.UUID(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=100), nullable=False),
        sa.Column('entity_id', sa.String(length=255), nullable=False),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], name=op.f('fk_audit_logs_restaurant_id_restaurants'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_audit_logs_user_id_users'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_logs'))
    )
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_audit_logs_restaurant_id'), ['restaurant_id'], unique=False)

    # 9. webhook_events
    op.create_table(
        'webhook_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('event_id', sa.String(length=255), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('processed_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_webhook_events')),
        sa.UniqueConstraint('event_id', name=op.f('uq_webhook_events_event_id'))
    )
    with op.batch_alter_table('webhook_events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_webhook_events_event_id'), ['event_id'], unique=True)


def downgrade() -> None:
    op.drop_table('webhook_events')
    op.drop_table('audit_logs')
    op.drop_table('order_items')
    op.drop_table('orders')
    op.drop_table('menu_item_variants')
    op.drop_table('menu_items')
    op.drop_table('categories')
    op.drop_table('users')
    op.drop_table('restaurants')
