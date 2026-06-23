from enum import Enum


class ChallengeStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class ChallengeVisibility(str, Enum):
    PRIVATE = "private"
    SHARED = "shared"


class ChallengePeriod(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ChallengeTargetType(str, Enum):
    MIN = "min"
    MAX = "max"
    EXACT = "exact"
