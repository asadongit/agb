"""add intake_id to stock_ledger

Revision ID: 7a8b9c0d1e2f
Revises: 9a2b3c4d5e6f
Create Date: 2026-08-18 01:25:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '7a8b9c0d1e2f'
down_revision = '9a2b3c4d5e6f'
branch_labels = None
depends_on = None


def upgrade():
    try:
        with op.batch_alter_table('stock_ledger', schema=None) as batch_op:
            batch_op.add_column(sa.Column('intake_id', postgresql.UUID(as_uuid=True), nullable=True))
            batch_op.create_index('ix_stock_ledger_intake_id', ['intake_id'], unique=False)
            batch_op.create_foreign_key('fk_stock_ledger_intake_id_stock_intakes', 'stock_intakes', ['intake_id'], ['id'], ondelete='SET NULL')
    except Exception as e:
        print(f"[Migration Info] stock_ledger intake_id column: {e}")


def downgrade():
    with op.batch_alter_table('stock_ledger', schema=None) as batch_op:
        batch_op.drop_constraint('fk_stock_ledger_intake_id_stock_intakes', type_='foreignkey')
        batch_op.drop_index('ix_stock_ledger_intake_id')
        batch_op.drop_column('intake_id')
