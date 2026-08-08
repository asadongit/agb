"""add table sessions and customers

Revision ID: afa1e7518cb7
Revises: 
Create Date: 2026-08-07 12:43:42.386126

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'afa1e7518cb7'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'customers',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('restaurant_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], name=op.f('fk_customers_restaurant_id_restaurants'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_customers')),
        sa.UniqueConstraint('restaurant_id', 'phone', name='uq_customers_restaurant_phone')
    )
    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_customers_restaurant_id'), ['restaurant_id'], unique=False)

    op.create_table(
        'table_sessions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('restaurant_id', sa.UUID(), nullable=False),
        sa.Column('table_number', sa.String(length=50), nullable=False),
        sa.Column('session_key', sa.String(length=512), nullable=False),
        sa.Column('customer_name', sa.String(length=255), nullable=False),
        sa.Column('customer_id', sa.UUID(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_table_sessions_customer_id_customers'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], name=op.f('fk_table_sessions_restaurant_id_restaurants'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_table_sessions'))
    )
    with op.batch_alter_table('table_sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_table_sessions_restaurant_id'), ['restaurant_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_table_sessions_session_key'), ['session_key'], unique=True)

    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('session_id', sa.UUID(), nullable=True))
        batch_op.create_index(batch_op.f('ix_orders_session_id'), ['session_id'], unique=False)
        batch_op.create_foreign_key(batch_op.f('fk_orders_session_id_table_sessions'), 'table_sessions', ['session_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_orders_session_id_table_sessions'), type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_orders_session_id'))
        batch_op.drop_column('session_id')

    with op.batch_alter_table('table_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_table_sessions_session_key'))
        batch_op.drop_index(batch_op.f('ix_table_sessions_restaurant_id'))

    op.drop_table('table_sessions')

    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_customers_restaurant_id'))

    op.drop_table('customers')
