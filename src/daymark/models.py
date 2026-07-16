from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum


class ReportType(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


@dataclass(frozen=True, slots=True)
class Task:
    id: str
    task_date: date
    content: str
    completed: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime
    origin_task_id: str | None = None


@dataclass(frozen=True, slots=True)
class ReportPeriod:
    report_type: ReportType
    start_date: date
    end_date: date
