"""Add public_basket_number column to restaurants

Revision ID: m1414lm011q0
Revises: l1313kl010p0
Create Date: 2026-08-09 03:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "m1414lm011q0"
down_revision: str | None = "l1313kl010p0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column("public_basket_number", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("restaurants", "public_basket_number")
