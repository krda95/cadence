"""add goal quick actions

Revision ID: cfb5631df2ca
Revises: ad2fd4b0aff5
Create Date: 2026-11-18 11:45:41.083234

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "cfb5631df2ca"
down_revision: Union[str, Sequence[str], None] = "ad2fd4b0aff5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    quick_action_type = postgresql.ENUM(
        "none",
        "increment",
        "check",
        name="goal_quick_action_type",
        create_type=False,
    )
    quick_action_type.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "goals",
        sa.Column(
            "quick_action_type",
            quick_action_type,
            server_default="none",
            nullable=False,
        ),
    )
    op.add_column("goals", sa.Column("quick_action_step", sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("goals", "quick_action_step")
    op.drop_column("goals", "quick_action_type")

    postgresql.ENUM(name="goal_quick_action_type").drop(op.get_bind(), checkfirst=True)
