"""Fix missing status and termination columns on table_sessions table

Revision ID: i1010ih087m0
Revises: h9909hf076l0
Create Date: 2026-08-08 21:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i1010ih087m0'
down_revision: Union[str, None] = 'h9909hf076l0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table('table_sessions'):
        return

    columns = [c['name'] for c in inspector.get_columns('table_sessions')]

    # 1. Create sessionstatusenum type if it doesn't exist
    conn.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sessionstatusenum') THEN
                CREATE TYPE sessionstatusenum AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED', 'COMPLETED');
            END IF;
        END
        $$;
    """))

    # 2. Add status column if missing
    if 'status' not in columns:
        op.add_column(
            'table_sessions',
            sa.Column(
                'status',
                sa.Enum('ACTIVE', 'EXPIRED', 'TERMINATED', 'COMPLETED', name='sessionstatusenum'),
                nullable=False,
                server_default='ACTIVE',
            )
        )
        # Populate status from old is_active column if present
        if 'is_active' in columns:
            conn.execute(sa.text("""
                UPDATE table_sessions
                SET status = CASE WHEN is_active = true THEN 'ACTIVE'::sessionstatusenum ELSE 'EXPIRED'::sessionstatusenum END
            """))

    # 3. Add terminated_by_id column if missing
    if 'terminated_by_id' not in columns:
        op.add_column(
            'table_sessions',
            sa.Column('terminated_by_id', sa.UUID(), nullable=True)
        )
        op.create_foreign_key(
            'fk_table_sessions_terminated_by_id_users',
            'table_sessions',
            'users',
            ['terminated_by_id'],
            ['id'],
            ondelete='SET NULL'
        )

    # 4. Add terminated_reason column if missing
    if 'terminated_reason' not in columns:
        op.add_column(
            'table_sessions',
            sa.Column('terminated_reason', sa.String(length=500), nullable=True)
        )


def downgrade() -> None:
    pass
