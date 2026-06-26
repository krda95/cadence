from enum import Enum


class ChallengePeriod(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ChallengeTargetType(str, Enum):
    MIN = "min"
    MAX = "max"

class ProgressStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PARTIALLY_ACHIEVED = "partially_achieved"
    ACHIEVED = "achieved"
    EXCEEDED = "exceeded"
    MISSED = "missed"