from datetime import date
import unittest
from unittest.mock import patch

from daymark.holiday_calendar import KoreanHolidayCalendar


class KoreanHolidayCalendarTest(unittest.TestCase):
    def test_korean_public_and_substitute_holidays(self) -> None:
        calendar = KoreanHolidayCalendar()
        self.assertTrue(calendar.is_holiday(date(2026, 3, 1)))
        self.assertTrue(calendar.is_holiday(date(2026, 3, 2)))
        self.assertIsNotNone(calendar.name(date(2026, 9, 25)))
        self.assertFalse(calendar.is_holiday(date(2026, 7, 16)))

    def test_fallback_range_reaches_2050(self) -> None:
        with patch("daymark.holiday_calendar.holidays_library", None):
            calendar = KoreanHolidayCalendar()
            self.assertTrue(calendar.is_holiday(date(2050, 1, 1)))
            self.assertIsNotNone(calendar.name(date(2026, 3, 2)))


if __name__ == "__main__":
    unittest.main()
