"""Make order_items.menu_item_id nullable

Revision ID: e2202fc409e9
Revises: d1101fb308d8
Create Date: 2026-08-07 23:58:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2202fc409e9'
down_revision: Union[str, None] = 'd1101fb308d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('order_items', 'menu_item_id',
               existing_type=sa.UUID(),
               nullable=True)


def downgrade() -> None:
    op.alter_column('order_items', 'menu_item_id',
               existing_type=sa.UUID(),
               nullable=False)
