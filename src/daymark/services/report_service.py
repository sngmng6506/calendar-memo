from __future__ import annotations

from collections import defaultdict
from datetime import date

from daymark.models import ReportPeriod, ReportType, Task
from daymark.services.llm_client import TextGenerator


class ReportService:
    SYSTEM_PROMPT = (
        "당신은 업무 기록을 간결한 한국어 업무보고로 정리하는 비서입니다. "
        "입력에 없는 성과나 수치를 만들지 말고, 완료와 미완료를 명확히 구분하세요. "
        "과장 표현 없이 바로 복사해 제출할 수 있는 문장으로 작성하세요."
    )

    def build_prompt(self, period: ReportPeriod, tasks: list[Task]) -> str:
        completed = sum(task.completed for task in tasks)
        pending = len(tasks) - completed
        label = {
            ReportType.DAILY: "일간 요약",
            ReportType.WEEKLY: "주간 업무보고",
            ReportType.MONTHLY: "월간 회고",
        }[period.report_type]

        lines = [
            f"보고서 종류: {label}",
            f"기간: {period.start_date.isoformat()} ~ {period.end_date.isoformat()}",
            f"완료: {completed}건 / 미완료: {pending}건",
            "",
            "업무 기록:",
        ]
        if not tasks:
            lines.append("- 기록 없음")
        else:
            grouped: dict[date, list[Task]] = defaultdict(list)
            for task in tasks:
                grouped[task.task_date].append(task)
            for task_date in sorted(grouped):
                lines.append(f"[{task_date.isoformat()}]")
                for task in grouped[task_date]:
                    marker = "완료" if task.completed else "미완료"
                    lines.append(f"- ({marker}) {task.content}")

        lines.extend(
            [
                "",
                "출력 형식:",
                "1. 핵심 업무 요약",
                "2. 완료한 업무",
                "3. 남은 업무 및 다음 우선순위",
                "업무가 없는 섹션은 생략하고 Markdown으로 작성하세요.",
            ]
        )
        return "\n".join(lines)

    def generate_ai(
        self, period: ReportPeriod, tasks: list[Task], generator: TextGenerator
    ) -> str:
        return generator.generate(self.SYSTEM_PROMPT, self.build_prompt(period, tasks))

    def local_summary(self, period: ReportPeriod, tasks: list[Task]) -> str:
        completed = [task for task in tasks if task.completed]
        pending = [task for task in tasks if not task.completed]
        title = {
            ReportType.DAILY: "오늘 업무 요약",
            ReportType.WEEKLY: "주간 업무 요약",
            ReportType.MONTHLY: "월간 업무 요약",
        }[period.report_type]
        lines = [f"# {title}", "", f"기간: {period.start_date} ~ {period.end_date}"]
        if completed:
            lines.extend(["", "## 완료한 업무"])
            lines.extend(f"- {task.content}" for task in completed)
        if pending:
            lines.extend(["", "## 남은 업무"])
            lines.extend(f"- {task.content}" for task in pending)
        if not tasks:
            lines.extend(["", "기록된 업무가 없습니다."])
        return "\n".join(lines)
