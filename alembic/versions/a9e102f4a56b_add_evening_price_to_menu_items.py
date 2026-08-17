"""add_evening_price_to_menu_items

Revision ID: a9e102f4a56b
Revises: 89c65d1fbf4f
Create Date: 2026-08-16 15:58:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9e102f4a56b'
down_revision: Union[str, None] = '89c65d1fbf4f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    menu_items_cols = [c['name'] for c in inspector.get_columns('menu_items')]

    if 'evening_price' not in menu_items_cols:
        with op.batch_alter_table('menu_items', schema=None) as batch_op:
            batch_op.add_column(sa.Column('evening_price', sa.Numeric(precision=10, scale=2), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    menu_items_cols = [c['name'] for c in inspector.get_columns('menu_items')]

    if 'evening_price' in menu_items_cols:
        with op.batch_alter_table('menu_items', schema=None) as batch_op:
            batch_op.drop_column('evening_price')
