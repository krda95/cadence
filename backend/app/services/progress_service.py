from collections import defaultdict
from datetime import date, datetime, timedelta
import os
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
    calculate_weekly_score,
    calculate_average_score,
    calculate_period_score,
)


WARSAW_TIMEZONE = ZoneInfo("Europe/Warsaw")
TIMEZONE_NAME = "Europe/Warsaw"


def get_warsaw_today() -> date:
    test_today = os.getenv("CADENCE_TEST_TODAY")
    if test_today:
        try:
            return date.fromisoformat(test_today)
        except ValueError as error:
            raise RuntimeError(
                "CADENCE_TEST_TODAY must use YYYY-MM-DD format."
            ) from error
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

def get_weekly_item_status(
    score: float | None,
    is_week_final: bool,
) -> ProgressStatus:
    """
    Status agregatu challenge'u w widoku tygodniowym.

    Dla tygodnia w toku nie ogłaszamy finalnego wyniku,
    nawet jeśli cel jest już aktualnie osiągnięty.
    """
    if not is_week_final:
        return ProgressStatus.IN_PROGRESS

    if score == 100:
        return ProgressStatus.ACHIEVED

    if score == 0:
        return ProgressStatus.MISSED

    return ProgressStatus.PARTIALLY_ACHIEVED


def get_weekly_max_status(
    current_value: float,
    target_value: float,
    is_week_final: bool,
) -> ProgressStatus:
    """
    Weekly max może być przekroczony jeszcze przed końcem tygodnia.
    """
    if current_value > target_value:
        return ProgressStatus.EXCEEDED

    if is_week_final:
        return ProgressStatus.ACHIEVED

    return ProgressStatus.IN_PROGRESS


def iter_dates(
    start_date: date,
    end_date: date,
) -> list[date]:
    days: list[date] = []
    current_date = start_date

    while current_date <= end_date:
        days.append(current_date)
        current_date += timedelta(days=1)

    return days


async def calculate_weekly_progress(
    session: AsyncSession,
    owner_id: UUID,
    reference_date: date,
) -> dict[str, Any]:
    """
    Calculates progress for the ISO week containing reference_date.

    - Monday is the first day of the week.
    - Sunday is the last day of the week.
    - Final weekly_score exists only after Sunday has ended.
    - Monthly challenges are intentionally excluded for MVP.
    """
    today = get_warsaw_today()

    if reference_date > today:
        raise ValueError("date cannot be in the future")

    week_start, week_end = get_period_bounds(
        ChallengePeriod.WEEKLY,
        reference_date,
    )

    is_week_final = week_end < today
    calculation_end = week_end if is_week_final else reference_date

    challenges = await load_active_challenges(
        session=session,
        owner_id=owner_id,
    )

    # Monthly challenges do not participate in weekly progress yet.
    applicable_challenges = [
        challenge
        for challenge in challenges
        if challenge.period in {
            ChallengePeriod.DAILY,
            ChallengePeriod.WEEKLY,
        }
        and get_challenge_created_date(challenge) <= calculation_end
    ]

    if not applicable_challenges:
        return {
            "date": reference_date,
            "timezone": TIMEZONE_NAME,
            "period_start": week_start,
            "period_end": week_end,
            "is_final": is_week_final,
            "weekly_score": None,
            "items": [],
        }

    entries_by_challenge = await load_entries_by_challenge(
        session=session,
        challenge_ids=[
            challenge.id
            for challenge in applicable_challenges
        ],
        date_from=week_start,
        date_to=calculation_end,
    )

    items: list[dict[str, Any]] = []
    final_challenge_scores: list[float] = []

    for challenge in applicable_challenges:
        challenge_entries = entries_by_challenge.get(
            challenge.id,
            {},
        )

        challenge_created_date = get_challenge_created_date(challenge)

        # Challenge utworzony w środku tygodnia nie jest oceniany
        # za dni przed jego powstaniem.
        challenge_start_date = max(
            week_start,
            challenge_created_date,
        )

        base_item = {
            "challenge_id": challenge.id,
            "name": challenge.name,
            "unit": challenge.unit,
            "period": challenge.period,
            "target_type": challenge.target_type,
            "target_value": float(challenge.target_value),
        }

        # ----------------------------------------------------------
        # DAILY CHALLENGES
        # ----------------------------------------------------------
        if challenge.period == ChallengePeriod.DAILY:
            daily_scores: list[float] = []

            for current_day in iter_dates(
                challenge_start_date,
                calculation_end,
            ):
                entry_exists = current_day in challenge_entries
                entry_value = challenge_entries.get(
                    current_day,
                    0.0,
                )

                is_day_final = current_day < today

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

                # Dzisiejszy daily-min bez wpisu ma score None/pending,
                # więc nie zaniża jeszcze średniej tygodnia w toku.
                if result.score is not None:
                    daily_scores.append(result.score)

            daily_average_score = calculate_average_score(daily_scores)

            # Daily challenge wpływa na finalny weekly_score dopiero,
            # gdy cały tydzień jest zamknięty.
            final_score = (
                daily_average_score
                if is_week_final
                else None
            )

            if final_score is not None:
                final_challenge_scores.append(final_score)

            items.append(
                {
                    **base_item,
                    "days_counted": len(daily_scores),
                    "daily_average_score": daily_average_score,
                    "current_value": None,
                    "progress_percent": None,
                    "limit_usage_percent": None,
                    "score": final_score,
                    "status": get_weekly_item_status(
                        score=final_score,
                        is_week_final=is_week_final,
                    ),
                    "included_in_weekly_score": (
                        final_score is not None
                    ),
                }
            )
            continue

        # ----------------------------------------------------------
        # WEEKLY CHALLENGES
        # ----------------------------------------------------------
        weekly_current_value = sum(
            value
            for entry_day, value in challenge_entries.items()
            if challenge_start_date <= entry_day <= calculation_end
        )

        period_score = calculate_period_score(
            target_type=challenge.target_type,
            current_value=weekly_current_value,
            target_value=float(challenge.target_value),
        )

        final_score = period_score if is_week_final else None

        if final_score is not None:
            final_challenge_scores.append(final_score)

        if challenge.target_type == ChallengeTargetType.MIN:
            status = get_weekly_item_status(
                score=final_score,
                is_week_final=is_week_final,
            )
            progress_percent = period_score
            limit_usage_percent = None
        else:
            status = get_weekly_max_status(
                current_value=weekly_current_value,
                target_value=float(challenge.target_value),
                is_week_final=is_week_final,
            )
            progress_percent = None
            limit_usage_percent = calculate_limit_usage_percent(
                current_value=weekly_current_value,
                target_value=float(challenge.target_value),
            )

        items.append(
            {
                **base_item,
                "days_counted": None,
                "daily_average_score": None,
                "current_value": round(
                    weekly_current_value,
                    2,
                ),
                "progress_percent": (
                    round(progress_percent, 2)
                    if progress_percent is not None
                    else None
                ),
                "limit_usage_percent": (
                    round(limit_usage_percent, 2)
                    if limit_usage_percent is not None
                    else None
                ),
                "score": (
                    round(final_score, 2)
                    if final_score is not None
                    else None
                ),
                "status": status,
                "included_in_weekly_score": (
                    final_score is not None
                ),
            }
        )

    weekly_score = calculate_weekly_score(
        challenge_scores=final_challenge_scores,
        is_week_final=is_week_final,
    )

    return {
        "date": reference_date,
        "timezone": TIMEZONE_NAME,
        "period_start": week_start,
        "period_end": week_end,
        "is_final": is_week_final,
        "weekly_score": weekly_score,
        "items": items,
    }
