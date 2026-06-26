from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.challenge import Challenge
from app.models.challenge_entry import ChallengeEntry
from app.models.enums import (
    ChallengePeriod,
    ChallengeTargetType,
    ProgressStatus,
)
from app.services.progress_rules import (
    calculate_daily_max_result,
    calculate_daily_min_result,
    calculate_max_score,
    calculate_min_score,
    causes_period_max_daily_penalty,
)


WARSAW_TIMEZONE = ZoneInfo("Europe/Warsaw")
TIMEZONE_NAME = "Europe/Warsaw"


def get_warsaw_today() -> date:
    return datetime.now(WARSAW_TIMEZONE).date()


def get_period_bounds(
    period: ChallengePeriod,
    reference_date: date,
) -> tuple[date, date]:
    if period == ChallengePeriod.DAILY:
        return reference_date, reference_date

    if period == ChallengePeriod.WEEKLY:
        period_start = reference_date - timedelta(
            days=reference_date.weekday()
        )
        period_end = period_start + timedelta(days=6)
        return period_start, period_end

    if period == ChallengePeriod.MONTHLY:
        period_start = reference_date.replace(day=1)

        if reference_date.month == 12:
            next_month = reference_date.replace(
                year=reference_date.year + 1,
                month=1,
                day=1,
            )
        else:
            next_month = reference_date.replace(
                month=reference_date.month + 1,
                day=1,
            )

        period_end = next_month - timedelta(days=1)
        return period_start, period_end

    raise ValueError(f"Unsupported period: {period}")


def calculate_limit_usage_percent(
    current_value: float,
    target_value: float,
) -> float:
    # Dla limitu 0:
    # 0 / 0 oznacza brak wykorzystania limitu,
    # każda wartość dodatnia oznacza pełne wykorzystanie / przekroczenie.
    if target_value == 0:
        return 0.0 if current_value == 0 else 100.0

    return min((current_value / target_value) * 100, 100.0)


async def load_active_challenges(
    session: AsyncSession,
    owner_id: UUID,
) -> list[Challenge]:
    result = await session.execute(
        select(Challenge)
        .where(
            Challenge.owner_id == owner_id,
            Challenge.is_active.is_(True),
        )
        .order_by(Challenge.created_at.asc())
    )

    return list(result.scalars().all())


async def load_entries_by_challenge(
    session: AsyncSession,
    challenge_ids: list[UUID],
    date_from: date,
    date_to: date,
) -> dict[UUID, dict[date, float]]:
    if not challenge_ids:
        return {}

    result = await session.execute(
        select(
            ChallengeEntry.challenge_id,
            ChallengeEntry.entry_date,
            ChallengeEntry.value,
        ).where(
            ChallengeEntry.challenge_id.in_(challenge_ids),
            ChallengeEntry.entry_date >= date_from,
            ChallengeEntry.entry_date <= date_to,
        )
    )

    entries_by_challenge: dict[UUID, dict[date, float]] = defaultdict(dict)

    for challenge_id, entry_date, value in result.all():
        entries_by_challenge[challenge_id][entry_date] = float(value)

    return entries_by_challenge


def get_challenge_created_date(challenge: Challenge) -> date:
    created_at = challenge.created_at

    if created_at.tzinfo is None:
        return created_at.date()

    return created_at.astimezone(WARSAW_TIMEZONE).date()


async def calculate_daily_progress(
    session: AsyncSession,
    owner_id: UUID,
    reference_date: date,
) -> dict[str, Any]:
    today = get_warsaw_today()

    if reference_date > today:
        raise ValueError("date cannot be in the future")

    is_day_final = reference_date < today

    challenges = await load_active_challenges(
        session=session,
        owner_id=owner_id,
    )

    # Challenge utworzony później nie powinien wpływać na starszy dzień.
    applicable_challenges = [
        challenge
        for challenge in challenges
        if get_challenge_created_date(challenge) <= reference_date
    ]

    if not applicable_challenges:
        return {
            "date": reference_date,
            "timezone": TIMEZONE_NAME,
            "daily_score": None,
            "is_final": is_day_final,
            "scored_components_count": 0,
            "pending_components_count": 0,
            "components": [],
            "periodic_progress": [],
        }

    earliest_date = reference_date

    for challenge in applicable_challenges:
        period_start, _ = get_period_bounds(
            challenge.period,
            reference_date,
        )
        earliest_date = min(earliest_date, period_start)

    entries_by_challenge = await load_entries_by_challenge(
        session=session,
        challenge_ids=[
            challenge.id
            for challenge in applicable_challenges
        ],
        date_from=earliest_date,
        date_to=reference_date,
    )

    components: list[dict[str, Any]] = []
    periodic_progress: list[dict[str, Any]] = []
    component_scores: list[float] = []
    pending_components_count = 0

    for challenge in applicable_challenges:
        challenge_entries = entries_by_challenge.get(
            challenge.id,
            {},
        )

        entry_exists = reference_date in challenge_entries
        entry_value = challenge_entries.get(reference_date, 0.0)

        period_start, period_end = get_period_bounds(
            challenge.period,
            reference_date,
        )

        period_current_value = sum(
            value
            for entry_day, value in challenge_entries.items()
            if period_start <= entry_day <= reference_date
        )

        is_period_final = period_end < today

        base_component = {
            "challenge_id": challenge.id,
            "name": challenge.name,
            "unit": challenge.unit,
            "period": challenge.period,
            "target_type": challenge.target_type,
            "target_value": float(challenge.target_value),
        }

        # ------------------------------------------------------------
        # DAILY CHALLENGES
        # ------------------------------------------------------------
        if challenge.period == ChallengePeriod.DAILY:
            if challenge.target_type == ChallengeTargetType.MIN:
                result = calculate_daily_min_result(
                    entry_exists=entry_exists,
                    entry_value=entry_value,
                    target_value=float(challenge.target_value),
                    is_day_final=is_day_final,
                )
            else:
                result = calculate_daily_max_result(
                    entry_exists=entry_exists,
                    entry_value=entry_value,
                    target_value=float(challenge.target_value),
                    is_day_final=is_day_final,
                )

            current_value = entry_value if entry_exists else 0.0
            components.append(
                {
                    **base_component,
                    "current_value": current_value,
                    "score": (
                        round(result.score, 2)
                        if result.score is not None
                        else None
                    ),
                    "status": result.status,
                    "included_in_daily_score": result.included_in_daily_score,
                    "is_period_limit_penalty": False,
                }
            )

            if result.included_in_daily_score:
                component_scores.append(result.score or 0.0)
            else:
                pending_components_count += 1

            continue

        # ------------------------------------------------------------
        # WEEKLY / MONTHLY CHALLENGES
        # ------------------------------------------------------------
        if challenge.target_type == ChallengeTargetType.MIN:
            period_score = calculate_min_score(
                current_value=period_current_value,
                target_value=float(challenge.target_value),
            )

            if period_current_value >= float(challenge.target_value):
                period_status = ProgressStatus.ACHIEVED
            elif is_period_final and period_current_value == 0:
                period_status = ProgressStatus.MISSED
            elif is_period_final:
                period_status = ProgressStatus.PARTIALLY_ACHIEVED
            else:
                period_status = ProgressStatus.IN_PROGRESS

            progress_percent: float | None = round(period_score, 2)
            limit_usage_percent: float | None = None
            caused_daily_penalty = False

        else:
            period_score = calculate_max_score(
                current_value=period_current_value,
                target_value=float(challenge.target_value),
            )
            period_result = calculate_daily_max_result(
                entry_exists=True,
                entry_value=period_current_value,
                target_value=float(challenge.target_value),
                is_day_final=is_period_final,
            )
            period_status = period_result.status

            progress_percent = None
            limit_usage_percent = round(
                calculate_limit_usage_percent(
                    current_value=period_current_value,
                    target_value=float(challenge.target_value),
                ),
                2,
            )

            total_before_day = sum(
                value
                for entry_day, value in challenge_entries.items()
                if period_start <= entry_day < reference_date
            )
            caused_daily_penalty = causes_period_max_daily_penalty(
                entry_value_for_day=entry_value,
                total_before_day=total_before_day,
                target_value=float(challenge.target_value),
            )

            if caused_daily_penalty:
                components.append(
                    {
                        **base_component,
                        "current_value": period_current_value,
                        "score": 0.0,
                        "status": ProgressStatus.EXCEEDED,
                        "included_in_daily_score": True,
                        "is_period_limit_penalty": True,
                    }
                )
                component_scores.append(0.0)

        periodic_progress.append(
            {
                **base_component,
                "period_start": period_start,
                "period_end": period_end,
                "current_value": round(period_current_value, 2),
                "progress_percent": progress_percent,
                "limit_usage_percent": limit_usage_percent,
                "status": period_status,
                "is_final": is_period_final,
                "caused_daily_penalty": caused_daily_penalty,
            }
        )

    daily_score = None

    if component_scores:
        daily_score = round(
            sum(component_scores) / len(component_scores),
            2,
        )

    return {
        "date": reference_date,
        "timezone": TIMEZONE_NAME,
        "daily_score": daily_score,
        "is_final": is_day_final,
        "scored_components_count": len(component_scores),
        "pending_components_count": pending_components_count,
        "components": components,
        "periodic_progress": periodic_progress,
    }
