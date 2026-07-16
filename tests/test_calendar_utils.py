from datetime import date
import unittest

from daymark.calendar_utils import month_matrix, shift_month


class CalendarUtilsTest(unittest.TestCase):
    def test_month_matrix_is_six_monday_first_weeks(self) -> None:
        matrix = month_matrix(2026, 7)
        self.assertEqual(6, len(matrix))
        self.assertTrue(all(len(week) == 7 for week in matrix))
        self.assertEqual(date(2026, 6, 29), matrix[0][0])
        self.assertEqual(date(2026, 8, 9), matrix[-1][-1])

    def test_shift_month_clamps_day(self) -> None:
        self.assertEqual(date(2026, 2, 28), shift_month(date(2026, 1, 31), 1))
        self.assertEqual(date(2025, 12, 15), shift_month(date(2026, 1, 15), -1))


if __name__ == "__main__":
    unittest.main()
