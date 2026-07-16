from __future__ import annotations

import os
import tkinter as tk
from datetime import date, timedelta
from pathlib import Path
from tkinter import messagebox, ttk

from daymark.calendar_utils import WEEKDAY_LABELS, month_matrix, shift_month
from daymark.repository import TaskRepository
from daymark.settings import SettingsStore
from daymark.ui.day_cell import DayCell
from daymark.ui.report_dialog import ReportDialog
from daymark.ui.settings_dialog import SettingsDialog

APP_NAME = "Daymark"


def default_data_dir() -> Path:
    if os.name == "nt":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    else:
        root = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return root / "daymark-calendar"


class DaymarkApp(tk.Tk):
    def __init__(self, data_dir: Path | None = None) -> None:
        super().__init__()
        self.title(f"{APP_NAME} — 업무 캘린더")
        self.geometry("1280x820")
        self.minsize(920, 620)
        self.data_dir = data_dir or default_data_dir()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.repository = TaskRepository(self.data_dir / "daymark.db")
        self.settings_store = SettingsStore(self.data_dir / "settings.json")
        self.settings = self.settings_store.load()
        self.current = date.today().replace(day=1)
        self.selected_date = date.today()
        self.month_title = tk.StringVar()
        self.summary = tk.StringVar()
        self._configure_styles()
        self._build_shell()
        self.render_month()
        self.protocol("WM_DELETE_WINDOW", self._close)

    def _configure_styles(self) -> None:
        style = ttk.Style(self)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("Day.TLabel", font=("TkDefaultFont", 10, "bold"))
        style.configure("Muted.TLabel", foreground="#888888")
        style.configure("Today.TLabel", font=("TkDefaultFont", 10, "bold"), foreground="#2457d6")
        style.configure("Completed.TEntry", foreground="#888888")
        style.configure("Draft.TEntry", foreground="#777777")
        style.configure("Weekday.TLabel", font=("TkDefaultFont", 10, "bold"), anchor="center")

    def _build_shell(self) -> None:
        toolbar = ttk.Frame(self, padding=(12, 10))
        toolbar.pack(fill="x")
        ttk.Button(toolbar, text="‹", width=3, command=lambda: self._change_month(-1)).pack(side="left")
        ttk.Button(toolbar, text="오늘", command=self._go_today).pack(side="left", padx=6)
        ttk.Button(toolbar, text="›", width=3, command=lambda: self._change_month(1)).pack(side="left")
        ttk.Label(toolbar, textvariable=self.month_title, font=("TkDefaultFont", 15, "bold")).pack(side="left", padx=16)
        ttk.Button(toolbar, text="설정", command=self._open_settings).pack(side="right")
        ttk.Button(toolbar, text="AI 보고서", command=self._open_report).pack(side="right", padx=6)
        ttk.Button(toolbar, text="어제 미완료 → 오늘", command=self._carry_over).pack(side="right")

        ttk.Label(self, textvariable=self.summary, padding=(12, 0, 12, 8)).pack(fill="x")
        self.calendar_frame = ttk.Frame(self, padding=(10, 0, 10, 10))
        self.calendar_frame.pack(fill="both", expand=True)
        for column in range(7):
            self.calendar_frame.columnconfigure(column, weight=1, uniform="calendar")
        for row in range(1, 7):
            self.calendar_frame.rowconfigure(row, weight=1, uniform="calendar")
        for column, label in enumerate(WEEKDAY_LABELS):
            ttk.Label(self.calendar_frame, text=label, style="Weekday.TLabel").grid(
                row=0, column=column, sticky="ew", pady=(0, 5)
            )

    def render_month(self) -> None:
        for child in self.calendar_frame.grid_slaves():
            if int(child.grid_info()["row"]) > 0:
                child.destroy()
        self.month_title.set(f"{self.current.year}년 {self.current.month}월")
        matrix = month_matrix(self.current.year, self.current.month)
        for week, dates in enumerate(matrix, start=1):
            for column, task_date in enumerate(dates):
                cell = DayCell(
                    self.calendar_frame,
                    task_date,
                    self.current.month,
                    self.repository,
                    on_changed=self._update_summary,
                    on_selected=self._select_date,
                )
                cell.grid(row=week, column=column, sticky="nsew", padx=2, pady=2)
        self._update_summary()

    def _update_summary(self) -> None:
        matrix = month_matrix(self.current.year, self.current.month)
        tasks = self.repository.list_between(matrix[0][0], matrix[-1][-1])
        completed = sum(task.completed for task in tasks)
        self.summary.set(f"표시 기간 업무 {len(tasks)}건 · 완료 {completed}건 · 미완료 {len(tasks) - completed}건")

    def _select_date(self, selected: date) -> None:
        self.selected_date = selected

    def _change_month(self, delta: int) -> None:
        self.current = shift_month(self.current, delta).replace(day=1)
        self.selected_date = self.current
        self.render_month()

    def _go_today(self) -> None:
        self.current = date.today().replace(day=1)
        self.selected_date = date.today()
        self.render_month()

    def _carry_over(self) -> None:
        today = date.today()
        yesterday = today - timedelta(days=1)
        moved = self.repository.move_incomplete(yesterday, today)
        if moved:
            self.current = today.replace(day=1)
            self.render_month()
        messagebox.showinfo("미완료 업무 이동", f"{moved}건을 오늘로 이동했습니다.", parent=self)

    def _open_report(self) -> None:
        ReportDialog(self, self.repository, self.settings, self.selected_date)

    def _open_settings(self) -> None:
        SettingsDialog(self, self.settings, self.settings_store)

    def _close(self) -> None:
        self.repository.close()
        self.destroy()
