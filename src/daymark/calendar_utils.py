from __future__ import annotations

import calendar
from datetime import date, timedelta

WEEKDAY_LABELS = ("월", "화", "수", "목", "금", "토", "일")


def month_matrix(year: int, month: int) -> list[list[date]]:
    """Return a fixed six-week Monday-first calendar matrix."""
    first = date(year, month, 1)
    start = first - timedelta(days=first.weekday())
    return [[start + timedelta(days=week * 7 + day) for day in range(7)] for week in range(6)]


def shift_month(value: date, delta: int) -> date:
    month_index = value.year * 12 + value.month - 1 + delta
    year, zero_based_month = divmod(month_index, 12)
    month = zero_based_month + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)
