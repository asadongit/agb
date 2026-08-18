"""add notifications table and outlet threshold columns

Revision ID: 9a2b3c4d5e6f
Revises: 8df7d705f497
Create Date: 2026-08-17 22:55:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '9a2b3c4d5e6f'
down_revision = '8df7d705f497'
branch_labels = None
depends_on = None


def upgrade():
    # Add near_expiry_threshold_days and notification_email to outlets if missing
    try:
        with op.batch_alter_table('outlets', schema=None) as batch_op:
            batch_op.add_column(sa.Column('near_expiry_threshold_days', sa.Integer(), server_default='7', nullable=False))
            batch_op.add_column(sa.Column('notification_email', sa.String(length=255), nullable=True))
    except Exception as e:
        print(f"[Migration Info] Outlets columns: {e}")

    # Create notifications table safely if not already present
    op.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id CHAR(36) PRIMARY KEY,
            outlet_id CHAR(36) NOT NULL,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message VARCHAR(1000) NOT NULL,
            details TEXT,
            is_read BOOLEAN DEFAULT 0 NOT NULL,
            channels_sent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY(outlet_id) REFERENCES outlets (id) ON DELETE CASCADE
        );
    """)


def downgrade():
    op.drop_table('notifications')
    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.drop_column('notification_email')
        batch_op.drop_column('near_expiry_threshold_days')
