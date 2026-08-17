"""add evening_price_active to outlets

Revision ID: e5c3b34cf940
Revises: e7888a2fcdb1
Create Date: 2026-08-16 22:48:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5c3b34cf940'
down_revision: Union[str, None] = 'e7888a2fcdb1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.add_column(sa.Column('evening_price_active', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.drop_column('evening_price_active')
