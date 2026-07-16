from datetime import date, datetime, timezone
import unittest

from daymark.models import ReportPeriod, ReportType, Task
from daymark.services.report_service import ReportService


class ReportServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        now = datetime(2026, 7, 16, tzinfo=timezone.utc)
        self.tasks = [
            Task("1", date(2026, 7, 16), "회의", True, 0, now, now),
            Task("2", date(2026, 7, 16), "문서 작성", False, 1, now, now),
        ]
        self.period = ReportPeriod(ReportType.DAILY, date(2026, 7, 16), date(2026, 7, 16))

    def test_prompt_contains_grounded_status(self) -> None:
        prompt = ReportService().build_prompt(self.period, self.tasks)
        self.assertIn("완료: 1건 / 미완료: 1건", prompt)
        self.assertIn("(완료) 회의", prompt)
        self.assertIn("(미완료) 문서 작성", prompt)
        self.assertIn("입력에 없는", ReportService.SYSTEM_PROMPT)

    def test_local_summary(self) -> None:
        result = ReportService().local_summary(self.period, self.tasks)
        self.assertIn("## 완료한 업무", result)
        self.assertIn("## 남은 업무", result)


if __name__ == "__main__":
    unittest.main()
