"""add catalogue_batches table

Revision ID: e7888a2fcdb1
Revises: a9e102f4a56b
Create Date: 2026-08-16 22:26:46.532368

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e7888a2fcdb1'
down_revision: Union[str, None] = 'a9e102f4a56b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('catalogue_batches',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('outlet_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('template', sa.String(length=50), nullable=False),
        sa.Column('show_evening_price', sa.Boolean(), nullable=False),
        sa.Column('show_evening_special_label', sa.Boolean(), nullable=False),
        sa.Column('categories', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['outlet_id'], ['outlets.id'], name=op.f('fk_catalogue_batches_outlet_id_outlets'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_catalogue_batches'))
    )
    with op.batch_alter_table('catalogue_batches', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_catalogue_batches_outlet_id'), ['outlet_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('catalogue_batches', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_catalogue_batches_outlet_id'))

    op.drop_table('catalogue_batches')
