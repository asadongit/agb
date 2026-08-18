"""add updated_at to stock_intakes and stock_ledger

Revision ID: a1b2c3d4e5f6
Revises: 7a8b9c0d1e2f
Create Date: 2026-08-18 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '7a8b9c0d1e2f'
branch_labels = None
depends_on = None


def upgrade():
    for table in ['stock_intakes', 'stock_ledger']:
        try:
            with op.batch_alter_table(table) as batch_op:
                batch_op.add_column(sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False))
        except Exception as e:
            print(f"[Migration Info] {table} updated_at: {e}")


def downgrade():
    for table in ['stock_intakes', 'stock_ledger']:
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column('updated_at')
