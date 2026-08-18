"""add confirmed_offline to orders

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-18 02:05:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    try:
        with op.batch_alter_table('orders') as batch_op:
            batch_op.add_column(sa.Column('confirmed_offline', sa.Boolean(), server_default='false', nullable=False))
    except Exception as e:
        print(f"[Migration Info] orders confirmed_offline: {e}")


def downgrade():
    with op.batch_alter_table('orders') as batch_op:
        batch_op.drop_column('confirmed_offline')
