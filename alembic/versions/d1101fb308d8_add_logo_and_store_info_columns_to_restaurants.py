"""Add logo_url, address, phone, gstin, fssai_no columns to restaurants

Revision ID: d1101fb308d8
Revises: c0250fb308c7
Create Date: 2026-08-07 19:56:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1101fb308d8'
down_revision: Union[str, None] = 'c0250fb308c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [col['name'] for col in inspector.get_columns('restaurants')]

    if 'logo_url' not in existing_columns:
        op.add_column('restaurants', sa.Column('logo_url', sa.String(length=1024), nullable=True))
    if 'address' not in existing_columns:
        op.add_column('restaurants', sa.Column('address', sa.String(length=500), nullable=True))
    if 'phone' not in existing_columns:
        op.add_column('restaurants', sa.Column('phone', sa.String(length=50), nullable=True))
    if 'gstin' not in existing_columns:
        op.add_column('restaurants', sa.Column('gstin', sa.String(length=50), nullable=True))
    if 'fssai_no' not in existing_columns:
        op.add_column('restaurants', sa.Column('fssai_no', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('restaurants', 'fssai_no')
    op.drop_column('restaurants', 'gstin')
    op.drop_column('restaurants', 'phone')
    op.drop_column('restaurants', 'address')
    op.drop_column('restaurants', 'logo_url')
