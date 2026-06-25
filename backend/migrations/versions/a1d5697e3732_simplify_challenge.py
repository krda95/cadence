"""simplify challenge

Revision ID: a1d5697e3732
Revises: 44635f246b44
Create Date: 2026-06-25 14:59:44.592999

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1d5697e3732'
down_revision: Union[str, Sequence[str], None] = '44635f246b44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    connection = op.get_bind()
    exact_records_count = connection.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM challenges
            WHERE target_type = 'exact'
            """
        )
    ).scalar_one()

    if exact_records_count > 0:
        raise RuntimeError(
            "Cannot remove 'exact' from challenge_target_type because "
            f"{exact_records_count} challenge record(s) still use it. "
            "Update or remove those records before running this migration."
        )

    op.add_column(
        "challenges",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_check_constraint(
        "ck_challenges_target_value_non_negative",
        "challenges",
        "target_value >= 0",
    )

    op.execute(
        """
        ALTER TYPE challenge_target_type
        RENAME TO challenge_target_type_old
        """
    )

    op.execute(
        """
        CREATE TYPE challenge_target_type AS ENUM ('min', 'max')
        """
    )

    op.execute(
        """
        ALTER TABLE challenges
        ALTER COLUMN target_type
        TYPE challenge_target_type
        USING target_type::text::challenge_target_type
        """
    )

    op.execute(
        """
        DROP TYPE challenge_target_type_old
        """
    )

    op.alter_column(
        "challenges",
        "updated_at",
        server_default=None,
    )

def downgrade() -> None:

    op.execute(
        """
        ALTER TYPE challenge_target_type
        RENAME TO challenge_target_type_old
        """
    )

    op.execute(
        """
        CREATE TYPE challenge_target_type AS ENUM ('min', 'max', 'exact')
        """
    )

    op.execute(

        """
        ALTER TABLE challenges
        ALTER COLUMN target_type
        TYPE challenge_target_type
        USING target_type::text::challenge_target_type
        """
    )

    op.execute(
        """
        DROP TYPE challenge_target_type_old
        """
    )

    op.drop_constraint(
        "ck_challenges_target_value_non_negative",
        "challenges",
        type_="check",
    )

    op.drop_column("challenges", "updated_at")