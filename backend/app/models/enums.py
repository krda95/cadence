from enum import Enum


class GoalPeriod(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"  # todo


class GoalTargetType(str, Enum):
    MIN = "min"
    MAX = "max"


class GoalQuickActionType(str, Enum):
    NONE = "none"
    INCREMENT = "increment"
    CHECK = "check"


class ProgressStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PARTIALLY_ACHIEVED = "partially_achieved"
    ACHIEVED = "achieved"
    EXCEEDED = "exceeded"
    MISSED = "missed"
