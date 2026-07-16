from __future__ import annotations

import os
import threading
import tkinter as tk
from datetime import date, timedelta
from tkinter import messagebox, ttk

from daymark.models import ReportPeriod, ReportType
from daymark.repository import TaskRepository
from daymark.services.llm_client import LlmError, OpenAICompatibleClient
from daymark.services.report_service import ReportService
from daymark.settings import AppSettings


class ReportDialog(tk.Toplevel):
    def __init__(
        self,
        master: tk.Misc,
        repository: TaskRepository,
        settings: AppSettings,
        selected_date: date,
    ) -> None:
        super().__init__(master)
        self.title("AI 업무보고")
        self.geometry("720x560")
        self.repository = repository
        self.settings = settings
        self.selected_date = selected_date
        self.report_service = ReportService()
        self.report_type = tk.StringVar(value=ReportType.WEEKLY.value)
        self.status = tk.StringVar(value="기간을 선택하고 보고서를 생성하세요.")
        self._build()
        self.transient(master)

    def _build(self) -> None:
        controls = ttk.Frame(self, padding=12)
        controls.pack(fill="x")
        ttk.Label(controls, text="보고서").pack(side="left")
        ttk.Combobox(
            controls,
            textvariable=self.report_type,
            state="readonly",
            width=12,
            values=[item.value for item in ReportType],
        ).pack(side="left", padx=8)
        ttk.Button(controls, text="로컬 미리보기", command=self._preview).pack(side="left")
        ttk.Button(controls, text="LLM으로 생성", command=self._generate).pack(side="left", padx=6)
        ttk.Button(controls, text="복사", command=self._copy).pack(side="right")
        self.text = tk.Text(self, wrap="word", padx=14, pady=14, undo=True)
        self.text.pack(fill="both", expand=True, padx=12, pady=(0, 8))
        ttk.Label(self, textvariable=self.status, padding=(12, 0, 12, 10)).pack(fill="x")

    def _period(self) -> ReportPeriod:
        report_type = ReportType(self.report_type.get())
        if report_type == ReportType.DAILY:
            start = end = self.selected_date
        elif report_type == ReportType.WEEKLY:
            start = self.selected_date - timedelta(days=self.selected_date.weekday())
            end = start + timedelta(days=6)
        else:
            start = self.selected_date.replace(day=1)
            next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
            end = next_month - timedelta(days=1)
        return ReportPeriod(report_type, start, end)

    def _preview(self) -> None:
        period = self._period()
        tasks = self.repository.list_between(period.start_date, period.end_date)
        self._set_text(self.report_service.local_summary(period, tasks))
        self.status.set("로컬 규칙 기반 미리보기입니다. LLM 생성 시 문장형 보고서로 다듬습니다.")

    def _generate(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            messagebox.showinfo(
                "API 키 필요",
                "OPENAI_API_KEY 환경변수를 설정한 뒤 앱을 다시 실행하세요.\nAPI 키는 앱에 저장하지 않습니다.",
                parent=self,
            )
            return
        period = self._period()
        tasks = self.repository.list_between(period.start_date, period.end_date)
        prompt = self.report_service.build_prompt(period, tasks)
        self.status.set("LLM이 보고서를 생성하고 있습니다…")
        self._set_busy(True)

        def worker() -> None:
            try:
                client = OpenAICompatibleClient(
                    api_key=api_key,
                    model=self.settings.llm_model,
                    base_url=self.settings.llm_base_url,
                )
                result = client.generate(self.report_service.SYSTEM_PROMPT, prompt)
            except LlmError as exc:
                self.after(0, lambda: self._finish_error(str(exc)))
                return
            self.after(0, lambda: self._finish_success(period, result))

        threading.Thread(target=worker, daemon=True).start()

    def _finish_success(self, period: ReportPeriod, content: str) -> None:
        self._set_text(content)
        self.repository.save_report(period.report_type.value, period.start_date, period.end_date, content)
        self.status.set("보고서를 생성하고 로컬 이력에 저장했습니다.")
        self._set_busy(False)

    def _finish_error(self, detail: str) -> None:
        self.status.set("보고서 생성에 실패했습니다.")
        self._set_busy(False)
        messagebox.showerror("LLM 오류", detail, parent=self)

    def _set_busy(self, busy: bool) -> None:
        self.configure(cursor="watch" if busy else "")

    def _set_text(self, content: str) -> None:
        self.text.delete("1.0", "end")
        self.text.insert("1.0", content)

    def _copy(self) -> None:
        content = self.text.get("1.0", "end").strip()
        self.clipboard_clear()
        self.clipboard_append(content)
        self.status.set("클립보드에 복사했습니다.")
