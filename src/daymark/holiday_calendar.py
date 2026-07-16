from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Protocol

try:
    import holidays as holidays_library
except ImportError:  # ZIP을 바로 실행하는 환경에서는 내장 데이터를 사용한다.
    holidays_library = None


class HolidayCalendar(Protocol):
    def name(self, day: date) -> str | None: ...

    def is_holiday(self, day: date) -> bool: ...


class KoreanHolidayCalendar:
    """대한민국 공휴일 조회기.

    설치된 ``python-holidays``를 우선 사용한다. 의존성을 설치하지 않고 ZIP을
    바로 실행한 경우에도 2020~2050년 내장 데이터로 동일한 달력 표시를 제공한다.
    """

    def __init__(self) -> None:
        self._cache: dict[int, dict[date, str]] = {}
        self._fallback: dict[str, dict[str, str]] | None = None

    def _year(self, year: int) -> dict[date, str]:
        cached = self._cache.get(year)
        if cached is not None:
            return cached

        values: dict[date, str]
        if holidays_library is not None:
            generated = holidays_library.country_holidays("KR", years=[year], language="ko")
            values = {day: str(name) for day, name in generated.items()}
        else:
            if self._fallback is None:
                path = Path(__file__).with_name("data") / "kr_holidays_2020_2050.json"
                try:
                    self._fallback = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, ValueError, TypeError):
                    self._fallback = {}
            values = {
                date.fromisoformat(day): str(name)
                for day, name in self._fallback.get(str(year), {}).items()
            }

        self._cache[year] = values
        return values

    def name(self, day: date) -> str | None:
        return self._year(day.year).get(day)

    def is_holiday(self, day: date) -> bool:
        return day in self._year(day.year)
