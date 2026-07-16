from __future__ import annotations

import os
import tkinter as tk
from datetime import date, timedelta
from pathlib import Path
from tkinter import messagebox, ttk

from daymark.calendar_utils import WEEKDAY_LABELS, month_matrix, shift_month
from daymark.platform_integration import DesktopAttachResult, DesktopHost, create_desktop_host
from daymark.repository import TaskRepository
from daymark.settings import SettingsStore
from daymark.theme import (
    DEFAULT_WINDOW_OPACITY,
    MUTED_TEXT,
    SUBTLE_TEXT,
    TEXT,
    WINDOW_BG,
    flat_button_options,
)
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


def resolve_window_opacity(value: str | None = None) -> float:
    raw = value if value is not None else os.environ.get("DAYMARK_OPACITY", "")
    try:
        opacity = float(raw) if raw else DEFAULT_WINDOW_OPACITY
    except ValueError:
        opacity = DEFAULT_WINDOW_OPACITY
    return min(1.0, max(0.55, opacity))


class DaymarkApp(tk.Tk):
    def __init__(
        self,
        data_dir: Path | None = None,
        *,
        desktop_host: DesktopHost | None = None,
        auto_desktop_mode: bool = True,
    ) -> None:
        super().__init__()
        self.title(f"{APP_NAME} — 업무 캘린더")
        self.geometry("1280x820")
        self.minsize(920, 620)
        self.configure(background=WINDOW_BG)
        self.window_opacity = resolve_window_opacity()
        self._apply_window_effects()

        self.data_dir = data_dir or default_data_dir()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.repository = TaskRepository(self.data_dir / "daymark.db")
        self.settings_store = SettingsStore(self.data_dir / "settings.json")
        self.settings = self.settings_store.load()
        self.desktop_host = desktop_host or create_desktop_host()
        self.auto_desktop_mode = auto_desktop_mode
        self.desktop_mode_active = False
        self.desktop_mode_label = tk.StringVar(value="바탕화면")
        self.desktop_maintenance_job: str | None = None
        self.normal_geometry = "1280x820"
        self.current = date.today().replace(day=1)
        self.selected_date = date.today()
        self.month_title = tk.StringVar()
        self.summary = tk.StringVar()
        self._configure_styles()
        self._build_shell()
        self.render_month()
        self.protocol("WM_DELETE_WINDOW", self._close)
        self.bind_all("<Control-Shift-d>", self._toggle_desktop_mode_event)
        self.bind_all("<Control-Shift-D>", self._toggle_desktop_mode_event)
        if self.auto_desktop_mode and self.settings.desktop_mode and self.desktop_host.supported:
            self.after_idle(lambda: self._set_desktop_mode(True, notify=False))

    def _apply_window_effects(self) -> None:
        try:
            self.attributes("-alpha", self.window_opacity)
        except tk.TclError:
            # 일부 Linux window manager는 alpha를 제공하지 않는다.
            pass

    def _configure_styles(self) -> None:
        style = ttk.Style(self)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("TFrame", background=WINDOW_BG)
        style.configure("TLabel", background=WINDOW_BG, foreground=TEXT)
        style.configure("TButton", background=WINDOW_BG, foreground=TEXT, borderwidth=0)
        style.map("TButton", background=[("active", WINDOW_BG)])
        style.configure("TEntry", fieldbackground=WINDOW_BG, foreground=TEXT)

    def _text_button(
        self,
        master: tk.Misc,
        text: str | None,
        command: object,
        *,
        compact: bool = False,
        font: tuple[str, int, str] | tuple[str, int] | None = None,
        textvariable: tk.StringVar | None = None,
    ) -> tk.Button:
        options = flat_button_options(compact=compact)
        if textvariable is None:
            button = tk.Button(master, text=text or "", command=command, **options)
        else:
            button = tk.Button(master, textvariable=textvariable, command=command, **options)
        if font is not None:
            button.configure(font=font)
        return button

    def _build_shell(self) -> None:
        self.toolbar = tk.Frame(self, background=WINDOW_BG, height=66)
        self.toolbar.pack(fill="x")
        self.toolbar.pack_propagate(False)

        self.nav_frame = tk.Frame(self.toolbar, background=WINDOW_BG)
        self.nav_frame.place(relx=0.5, rely=0.5, anchor="center")
        self._text_button(
            self.nav_frame,
            "‹",
            lambda: self._change_month(-1),
            compact=True,
            font=("TkDefaultFont", 20),
        ).pack(side="left")
        tk.Label(
            self.nav_frame,
            textvariable=self.month_title,
            background=WINDOW_BG,
            foreground=TEXT,
            font=("TkDefaultFont", 16, "bold"),
            padx=14,
        ).pack(side="left")
        self._text_button(
            self.nav_frame,
            "›",
            lambda: self._change_month(1),
            compact=True,
            font=("TkDefaultFont", 20),
        ).pack(side="left")
        self._text_button(self.nav_frame, "오늘", self._go_today, compact=True).pack(
            side="left", padx=(10, 0)
        )

        actions = tk.Frame(self.toolbar, background=WINDOW_BG)
        actions.pack(side="right", padx=18, pady=13)
        self._text_button(actions, "미완료 이동", self._carry_over, compact=True).pack(side="left")
        self._text_button(actions, "AI 요약", self._open_report, compact=True).pack(side="left", padx=2)
        self._text_button(actions, "설정", self._open_settings, compact=True).pack(side="left")
        if self.desktop_host.supported:
            self._text_button(
                actions,
                None,
                self._toggle_desktop_mode,
                compact=True,
                textvariable=self.desktop_mode_label,
            ).pack(side="left", padx=(5, 0))

        self.calendar_frame = tk.Frame(self, background=WINDOW_BG, padx=16, pady=4)
        self.calendar_frame.pack(fill="both", expand=True)
        for column in range(7):
            self.calendar_frame.columnconfigure(column, weight=1, uniform="calendar")
        for row in range(1, 7):
            self.calendar_frame.rowconfigure(row, weight=1, uniform="calendar")
        for column, label in enumerate(WEEKDAY_LABELS):
            foreground = MUTED_TEXT if column < 5 else SUBTLE_TEXT
            tk.Label(
                self.calendar_frame,
                text=label,
                background=WINDOW_BG,
                foreground=foreground,
                font=("TkDefaultFont", 9, "bold"),
                anchor="center",
            ).grid(row=0, column=column, sticky="ew", pady=(0, 8))

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
                cell.grid(row=week, column=column, sticky="nsew", padx=8, pady=4)
        self._update_summary()

    def _update_summary(self) -> None:
        matrix = month_matrix(self.current.year, self.current.month)
        tasks = self.repository.list_between(matrix[0][0], matrix[-1][-1])
        completed = sum(task.completed for task in tasks)
        self.summary.set(f"업무 {len(tasks)} · 완료 {completed} · 미완료 {len(tasks) - completed}")

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
        self._present_dialog(ReportDialog(self, self.repository, self.settings, self.selected_date))

    def _open_settings(self) -> None:
        self._present_dialog(SettingsDialog(self, self.settings, self.settings_store))

    def _present_dialog(self, dialog: tk.Toplevel) -> None:
        if not self.desktop_mode_active:
            return
        # WorkerW의 자식 창에서 연 대화상자가 바탕화면 아래로 내려가지 않도록
        # 최초 표시 순간에만 앞으로 올린 뒤 일반 Z-order로 되돌린다.
        try:
            dialog.attributes("-topmost", True)
            dialog.after(150, lambda: dialog.attributes("-topmost", False))
            dialog.lift()
            dialog.focus_force()
        except tk.TclError:
            pass

    def _toggle_desktop_mode_event(self, event: tk.Event[tk.Misc]) -> str:
        del event
        self._toggle_desktop_mode()
        return "break"

    def _toggle_desktop_mode(self) -> None:
        self._set_desktop_mode(not self.desktop_mode_active, notify=True)

    def _set_desktop_mode(self, enabled: bool, *, notify: bool) -> None:
        if enabled:
            if not self.desktop_host.supported:
                if notify:
                    messagebox.showinfo(
                        "바탕화면 모드",
                        "Windows에서만 바탕화면 레이어에 고정할 수 있습니다.",
                        parent=self,
                    )
                return
            self.normal_geometry = self.geometry()
            try:
                self.overrideredirect(True)
                self.update_idletasks()
            except tk.TclError:
                pass
            result = self.desktop_host.attach(self.winfo_id())
            if not result.success:
                self._restore_normal_window_chrome()
                self.desktop_mode_active = False
                self.settings.desktop_mode = False
                self.desktop_mode_label.set("바탕화면")
                self.settings_store.save(self.settings)
                if notify:
                    messagebox.showwarning("바탕화면 모드", result.message, parent=self)
                return
            self.desktop_mode_active = True
            self.settings.desktop_mode = True
            self.desktop_mode_label.set("창 모드")
            self.settings_store.save(self.settings)
            self._schedule_desktop_maintenance()
            return

        self._cancel_desktop_maintenance()
        result = self.desktop_host.detach()
        self.desktop_mode_active = False
        self.settings.desktop_mode = False
        self.desktop_mode_label.set("바탕화면")
        self.settings_store.save(self.settings)
        self._restore_normal_window_chrome()
        if notify and not result.success:
            messagebox.showwarning("창 모드", result.message, parent=self)

    def _restore_normal_window_chrome(self) -> None:
        try:
            self.overrideredirect(False)
            self.update_idletasks()
            self.geometry(self.normal_geometry)
            self.deiconify()
            self.lift()
            self.focus_force()
        except tk.TclError:
            pass

    def _schedule_desktop_maintenance(self) -> None:
        self._cancel_desktop_maintenance()
        self.desktop_maintenance_job = self.after(2500, self._maintain_desktop_mode)

    def _cancel_desktop_maintenance(self) -> None:
        if self.desktop_maintenance_job is None:
            return
        try:
            self.after_cancel(self.desktop_maintenance_job)
        except tk.TclError:
            pass
        self.desktop_maintenance_job = None

    def _maintain_desktop_mode(self) -> None:
        self.desktop_maintenance_job = None
        if not self.desktop_mode_active:
            return
        result: DesktopAttachResult = self.desktop_host.maintain(self.winfo_id())
        if not result.success:
            self.desktop_mode_active = False
            self.settings.desktop_mode = False
            self.desktop_mode_label.set("바탕화면")
            self.settings_store.save(self.settings)
            self._restore_normal_window_chrome()
            return
        self._schedule_desktop_maintenance()

    def _close(self) -> None:
        self._cancel_desktop_maintenance()
        if self.desktop_mode_active:
            self.desktop_host.detach()
        self.repository.close()
        self.destroy()
