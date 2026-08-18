"""add sync_action_logs and sync_conflict_flags tables

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-18 02:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    try:
        op.create_table('sync_action_logs',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('outlet_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('outlets.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('client_action_id', sa.String(255), nullable=False, index=True),
            sa.Column('action_type', sa.String(100), nullable=False),
            sa.Column('action_timestamp', sa.DateTime(), nullable=False),
            sa.Column('payload', sa.JSON(), nullable=True),
            sa.Column('status', sa.String(20), nullable=False, server_default='applied'),
            sa.Column('error_detail', sa.Text(), nullable=True),
            sa.Column('result_snapshot', sa.JSON(), nullable=True),
            sa.Column('synced_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint('outlet_id', 'client_action_id', name='uq_sync_action_log_outlet_client_id'),
        )
    except Exception as e:
        print(f"[Migration Info] sync_action_logs: {e}")

    try:
        op.create_table('sync_conflict_flags',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('outlet_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('outlets.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('action_log_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('sync_action_logs.id', ondelete='SET NULL'), nullable=True),
            sa.Column('conflict_type', sa.String(50), nullable=False),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('details', sa.JSON(), nullable=True),
            sa.Column('is_resolved', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('resolved_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
    except Exception as e:
        print(f"[Migration Info] sync_conflict_flags: {e}")


def downgrade():
    op.drop_table('sync_conflict_flags')
    op.drop_table('sync_action_logs')
