from __future__ import annotations

import os
import queue
import threading
import tkinter as tk
from datetime import date, timedelta
from tkinter import messagebox

from daymark.models import ReportPeriod, ReportType
from daymark.repository import TaskRepository
from daymark.services.llm_client import LlmError, OpenAICompatibleClient
from daymark.services.report_service import ReportService
from daymark.settings import AppSettings
from daymark.ui.controls import FlatSelect
from daymark.theme import (
    INPUT_FOCUS_BG,
    MUTED_TEXT,
    SUBTLE_TEXT,
    TEXT,
    WINDOW_BG,
    flat_button_options,
    fonts,
    primary_button_options,
)


_REPORT_LABELS = {
    ReportType.DAILY.value: "일간",
    ReportType.WEEKLY.value: "주간",
    ReportType.MONTHLY.value: "월간",
}


class ReportDialog(tk.Toplevel):
    def __init__(
        self,
        master: tk.Misc,
        repository: TaskRepository,
        settings: AppSettings,
        selected_date: date,
    ) -> None:
        super().__init__(master)
        self.title("AI 요약")
        self.geometry("760x620")
        self.minsize(620, 480)
        self.configure(background=WINDOW_BG)
        self.repository = repository
        self.settings = settings
        self.selected_date = selected_date
        self.report_service = ReportService()
        self.fonts = fonts(master)
        self.report_type_label = tk.StringVar(value=_REPORT_LABELS[ReportType.WEEKLY.value])
        self.status = tk.StringVar(value="선택한 날짜를 기준으로 보고서를 만들 수 있습니다.")
        self._generation_queue: queue.Queue[tuple[str, object, str]] = queue.Queue()
        self._generation_job: str | None = None
        self._generation_active = False
        self._build()
        self.transient(master)
        self.protocol("WM_DELETE_WINDOW", self._close_dialog)
        self.bind("<Destroy>", self._on_destroy, add="+")

    def _secondary_button(self, master: tk.Misc, text: str, command: object) -> tk.Button:
        return tk.Button(
            master,
            text=text,
            command=command,
            font=self.fonts.button,
            **flat_button_options(compact=True),
        )

    def _build(self) -> None:
        header = tk.Frame(self, background=WINDOW_BG, padx=22, pady=18)
        header.pack(fill="x")
        tk.Label(
            header,
            text="AI 요약",
            background=WINDOW_BG,
            foreground=TEXT,
            font=self.fonts.dialog_title,
        ).pack(side="left")

        controls = tk.Frame(self, background=WINDOW_BG, padx=22)
        controls.pack(fill="x")
        tk.Label(
            controls,
            text="기간",
            background=WINDOW_BG,
            foreground=SUBTLE_TEXT,
            font=self.fonts.caption,
        ).pack(side="left", padx=(0, 8))
        self.period_combo = FlatSelect(
            controls,
            self.report_type_label,
            list(_REPORT_LABELS.values()),
            width=8,
        )
        self.period_combo.pack(side="left")

        self.preview_button = self._secondary_button(controls, "로컬 미리보기", self._preview)
        self.preview_button.pack(side="left", padx=(12, 4))
        self.copy_button = self._secondary_button(controls, "복사", self._copy)
        self.copy_button.pack(side="right")
        self.generate_button = tk.Button(
            controls,
            text="AI로 생성",
            command=self._generate,
            font=self.fonts.body_medium,
            **primary_button_options(),
        )
        self.generate_button.pack(side="right", padx=(0, 8))

        self.text = tk.Text(
            self,
            wrap="word",
            padx=22,
            pady=20,
            undo=True,
            background=INPUT_FOCUS_BG,
            foreground=TEXT,
            insertbackground=TEXT,
            selectbackground="#3A3A3C",
            relief="flat",
            borderwidth=0,
            highlightthickness=0,
            font=self.fonts.task,
            spacing1=4,
            spacing2=3,
            spacing3=9,
        )
        self.text.pack(fill="both", expand=True, padx=22, pady=(18, 8))
        tk.Label(
            self,
            textvariable=self.status,
            background=WINDOW_BG,
            foreground=MUTED_TEXT,
            font=self.fonts.caption,
            anchor="w",
            padx=22,
            pady=10,
        ).pack(fill="x")

    def _report_type(self) -> ReportType:
        selected = self.report_type_label.get()
        value = next((value for value, label in _REPORT_LABELS.items() if label == selected), ReportType.WEEKLY.value)
        return ReportType(value)

    def _period(self) -> ReportPeriod:
        report_type = self._report_type()
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
        self.status.set("로컬 규칙 기반 미리보기입니다. AI 생성 시 문장형 보고서로 다듬습니다.")

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
        self.status.set("AI가 보고서를 생성하고 있습니다…")
        self._generation_active = True
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
                self._generation_queue.put(("error", period, str(exc)))
                return
            except Exception as exc:  # Defensive boundary: never leave the UI permanently busy.
                detail = str(exc).strip() or exc.__class__.__name__
                self._generation_queue.put(("error", period, detail))
                return
            self._generation_queue.put(("success", period, result))

        threading.Thread(target=worker, daemon=True).start()
        self._schedule_generation_poll()

    def _schedule_generation_poll(self) -> None:
        if not self._generation_active or self._generation_job is not None:
            return
        try:
            self._generation_job = self.after(50, self._poll_generation)
        except tk.TclError:
            self._generation_job = None

    def _poll_generation(self) -> None:
        self._generation_job = None
        if not self._generation_active:
            return
        try:
            outcome, period, detail = self._generation_queue.get_nowait()
        except queue.Empty:
            self._schedule_generation_poll()
            return
        self._generation_active = False
        if outcome == "success" and isinstance(period, ReportPeriod):
            self._finish_success(period, detail)
        else:
            self._finish_error(detail)

    def _finish_success(self, period: ReportPeriod, content: str) -> None:
        self._generation_active = False
        self._set_text(content)
        self.repository.save_report(period.report_type.value, period.start_date, period.end_date, content)
        self.status.set("보고서를 생성하고 로컬 이력에 저장했습니다.")
        self._set_busy(False)

    def _finish_error(self, detail: str) -> None:
        self._generation_active = False
        self.status.set("보고서 생성에 실패했습니다.")
        self._set_busy(False)
        messagebox.showerror("AI 요약 오류", detail, parent=self)

    def _set_busy(self, busy: bool) -> None:
        state = "disabled" if busy else "normal"
        self.generate_button.configure(state=state, text="생성 중…" if busy else "AI로 생성")
        self.preview_button.configure(state=state)
        self.copy_button.configure(state=state)
        self.period_combo.configure(state="disabled" if busy else "normal")
        self.configure(cursor="watch" if busy else "")

    def _set_text(self, content: str) -> None:
        self.text.delete("1.0", "end")
        self.text.insert("1.0", content)

    def _copy(self) -> None:
        content = self.text.get("1.0", "end").strip()
        self.clipboard_clear()
        self.clipboard_append(content)
        self.status.set("클립보드에 복사했습니다.")

    def _cancel_generation_poll(self) -> None:
        self._generation_active = False
        if self._generation_job is None:
            return
        try:
            self.after_cancel(self._generation_job)
        except tk.TclError:
            pass
        self._generation_job = None

    def _on_destroy(self, event: tk.Event) -> None:
        if event.widget is self:
            self._cancel_generation_poll()

    def _close_dialog(self) -> None:
        self._cancel_generation_poll()
        self.destroy()
