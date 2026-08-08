"""Add staff and staff audit log tables

Revision ID: f4404fd621g0
Revises: f3303fd510f0
Create Date: 2026-08-08 01:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f4404fd621g0'
down_revision: Union[str, None] = 'f3303fd510f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # 1. Add new enum values to roleenum if in Postgres (using autocommit_block)
    if conn.dialect.name == 'postgresql':
        with op.get_context().autocommit_block():
            for new_val in ['MANAGER', 'KITCHEN_STAFF', 'CASHIER', 'WAITER']:
                op.execute(sa.text(f"ALTER TYPE roleenum ADD VALUE IF NOT EXISTS '{new_val}'"))

    role_enum = postgresql.ENUM(
        'SUPERADMIN', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN_STAFF', 'CASHIER', 'WAITER', 'STAFF',
        name='roleenum',
        create_type=False
    )

    # 2. staff table
    if 'staff' not in existing_tables:
        op.create_table(
            'staff',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('email', sa.String(length=320), nullable=False, index=True),
            sa.Column('phone', sa.String(length=50), nullable=True),
            sa.Column('role', role_enum, nullable=False, server_default='WAITER'),
            sa.Column('password_hash', sa.String(length=512), nullable=False),
            sa.Column('pin_hash', sa.String(length=512), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
            sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        )

    # 3. staff_audit_log table
    if 'staff_audit_log' not in existing_tables:
        op.create_table(
            'staff_audit_log',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('staff_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('staff.id', ondelete='SET NULL'), nullable=True, index=True),
            sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('action_type', sa.String(length=100), nullable=False),
            sa.Column('reference_type', sa.String(length=100), nullable=True),
            sa.Column('reference_id', sa.String(length=255), nullable=True),
            sa.Column('details', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        )


def downgrade() -> None:
    op.drop_table('staff_audit_log')
    op.drop_table('staff')
