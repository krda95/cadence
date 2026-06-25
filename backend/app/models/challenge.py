from datetime import datetime
import uuid

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, String, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import ChallengePeriod, ChallengeTargetType


class Challenge(Base):
    __tablename__ = "challenges"

    __table_args__ = (
        CheckConstraint(
            "target_value >= 0",
            name="ck_challenges_target_value_non_negative",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)
    unit: Mapped[str] = mapped_column(String(30), nullable=False)

    period: Mapped[ChallengePeriod] = mapped_column(
        Enum(
            ChallengePeriod,
            name="challenge_period",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
    )

    target_type: Mapped[ChallengeTargetType] = mapped_column(
        Enum(
            ChallengeTargetType,
            name="challenge_target_type",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
    )

    target_value: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
