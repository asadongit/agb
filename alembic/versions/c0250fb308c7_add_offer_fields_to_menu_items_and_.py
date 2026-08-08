"""Add offer fields to menu_items and update audit_logs restaurant_id nullability

Revision ID: c0250fb308c7
Revises: afa1e7518cb7
Create Date: 2026-08-07 17:52:32.385939

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = 'c0250fb308c7'
down_revision: Union[str, None] = 'afa1e7518cb7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [col['name'] for col in inspector.get_columns('menu_items')]

    if 'is_on_offer' not in existing_columns:
        op.add_column('menu_items', sa.Column('is_on_offer', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    if 'offer_price' not in existing_columns:
        op.add_column('menu_items', sa.Column('offer_price', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'offer_label' not in existing_columns:
        op.add_column('menu_items', sa.Column('offer_label', sa.String(length=255), nullable=True))

    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.alter_column('restaurant_id', nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.alter_column('restaurant_id', nullable=False)

    op.drop_column('menu_items', 'offer_label')
    op.drop_column('menu_items', 'offer_price')
    op.drop_column('menu_items', 'is_on_offer')
