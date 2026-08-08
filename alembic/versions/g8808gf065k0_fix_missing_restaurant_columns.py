"""Fix missing restaurant columns (session_duration_minutes, verification_amount_cutoff, flagged_item_ids)

Revision ID: g8808gf065k0
Revises: f7707fe954j0
Create Date: 2026-08-08 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g8808gf065k0'
down_revision: Union[str, None] = 'f7707fe954j0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    rest_cols = [c['name'] for c in inspector.get_columns('restaurants')]

    if 'session_duration_minutes' not in rest_cols:
        op.add_column(
            'restaurants',
            sa.Column('session_duration_minutes', sa.Integer(), server_default='30', nullable=False),
        )

    if 'verification_amount_cutoff' not in rest_cols:
        op.add_column(
            'restaurants',
            sa.Column('verification_amount_cutoff', sa.Numeric(precision=10, scale=2), nullable=True),
        )

    if 'flagged_item_ids' not in rest_cols:
        op.add_column(
            'restaurants',
            sa.Column('flagged_item_ids', sa.JSON(), server_default='[]', nullable=False),
        )


def downgrade() -> None:
    # These columns are critical, so downgrade is a no-op to avoid data loss
    pass
