from __future__ import annotations

import os
import tkinter as tk
from calendar import monthrange
from datetime import date
from pathlib import Path
from tkinter import messagebox, ttk

from daymark.calendar_utils import WEEKDAY_LABELS, month_matrix, shift_month
from daymark.holiday_calendar import KoreanHolidayCalendar
from daymark.platform_integration import DesktopAttachResult, DesktopHost, create_desktop_host
from daymark.repository import TaskRepository
from daymark.settings import SettingsStore, clamp_opacity
from daymark.theme import (
    CONTENT_BG,
    DEFAULT_WINDOW_OPACITY,
    HOLIDAY_HEADER,
    HOVER_BG,
    INPUT_FOCUS_BG,
    MAX_WINDOW_OPACITY,
    MIN_WINDOW_OPACITY,
    MUTED_TEXT,
    SATURDAY_HEADER,
    SUBTLE_TEXT,
    TEXT,
    WINDOW_BG,
    flat_button_options,
    fonts,
)
from daymark.ui.day_cell import DayCell
from daymark.ui.more_menu import MenuAction, MoreMenuPopover
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
    return min(MAX_WINDOW_OPACITY, max(MIN_WINDOW_OPACITY, opacity))


class DaymarkApp(tk.Tk):
    def __init__(
        self,
        data_dir: Path | None = None,
        *,
        desktop_host: DesktopHost | None = None,
        backdrop_host: DesktopHost | None = None,
        auto_desktop_mode: bool = True,
    ) -> None:
        super().__init__()
        self.title(f"{APP_NAME} — 업무 캘린더")
        self.geometry("1280x820")
        self.minsize(920, 620)
        self.split_surface_enabled = False
        self.surface_bg = WINDOW_BG
        self.backdrop: tk.Toplevel | None = None
        self.backdrop_host: DesktopHost | None = None

        self.data_dir = data_dir or default_data_dir()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.repository = TaskRepository(self.data_dir / "daymark.db")
        self.settings_store = SettingsStore(self.data_dir / "settings.json")
        self.settings = self.settings_store.load()
        opacity_override = os.environ.get("DAYMARK_OPACITY")
        self.window_opacity = resolve_window_opacity(
            opacity_override if opacity_override else str(self.settings.window_opacity)
        )
        self.settings.window_opacity = self.window_opacity
        self.desktop_host = desktop_host or create_desktop_host()
        self.backdrop_host = backdrop_host or create_desktop_host()
        self._configure_surface_windows()
        self._apply_window_effects()
        self.holiday_calendar = KoreanHolidayCalendar()
        self.fonts = fonts(self)
        self.auto_desktop_mode = auto_desktop_mode
        self.desktop_mode_active = False
        self.desktop_mode_label = tk.StringVar(value="바탕화면")
        self.desktop_maintenance_job: str | None = None
        self.backdrop_sync_job: str | None = None
        self.transparency_jobs: set[str] = set()
        self.normal_geometry = "1280x820"
        self.current = date.today().replace(day=1)
        self.selected_date = date.today()
        self.month_title = tk.StringVar()
        self.summary = tk.StringVar()
        self.status_message = tk.StringVar(value="")
        self.status_job: str | None = None
        self.day_cells: dict[date, DayCell] = {}
        self._configure_styles()
        self._build_shell()
        self.render_month()
        self.protocol("WM_DELETE_WINDOW", self._close)
        self.bind_all("<Control-Shift-d>", self._toggle_desktop_mode_event)
        self.bind_all("<Control-Shift-D>", self._toggle_desktop_mode_event)
        self.bind("<Configure>", self._schedule_backdrop_sync, add="+")
        if self.split_surface_enabled:
            self._schedule_backdrop_sync()
        if self.auto_desktop_mode and self.settings.desktop_mode and self.desktop_host.supported:
            self.after_idle(lambda: self._set_desktop_mode(True, notify=False))

    def _configure_surface_windows(self) -> None:
        self.configure(background=WINDOW_BG)
        if os.name != "nt":
            return
        try:
            self.configure(background=CONTENT_BG)
            self.attributes("-transparentcolor", CONTENT_BG)
            self.attributes("-alpha", 1.0)
            backdrop = tk.Toplevel(self)
            backdrop.withdraw()
            backdrop.overrideredirect(True)
            backdrop.configure(background=WINDOW_BG, takefocus=False)
            try:
                backdrop.attributes("-toolwindow", True)
            except tk.TclError:
                pass
            backdrop.bind("<Button-1>", self._forward_backdrop_click)
            self.backdrop = backdrop
            self.surface_bg = CONTENT_BG
            self.split_surface_enabled = True
        except tk.TclError:
            self.configure(background=WINDOW_BG)
            self.surface_bg = WINDOW_BG
            self.split_surface_enabled = False

    def _apply_window_effects(self) -> None:
        try:
            if self.split_surface_enabled and self.backdrop is not None:
                self.attributes("-alpha", 1.0)
                self.backdrop.attributes("-alpha", self.window_opacity)
            else:
                self.attributes("-alpha", self.window_opacity)
        except tk.TclError:
            pass

    def _reapply_transparency(self) -> None:
        # SetParent/overrideredirect 전환 직후 Windows가 layered 상태를 다시 계산하는
        # 경우가 있어 즉시 + 지연 재적용한다. 네이티브 host도 같은 alpha를 적용한다.
        for job_id in tuple(self.transparency_jobs):
            try:
                self.after_cancel(job_id)
            except tk.TclError:
                pass
        self.transparency_jobs.clear()
        self._apply_window_effects()

        def schedule(delay: int) -> None:
            holder: dict[str, str] = {}

            def apply_later() -> None:
                self.transparency_jobs.discard(holder.get("id", ""))
                if self.winfo_exists():
                    self._apply_window_effects()

            try:
                job_id = self.after(delay, apply_later)
                holder["id"] = job_id
                self.transparency_jobs.add(job_id)
            except tk.TclError:
                pass

        for delay in (50, 250):
            schedule(delay)

    def _schedule_backdrop_sync(self, _event: tk.Event | None = None) -> None:
        if not self.split_surface_enabled or self.desktop_mode_active:
            return
        try:
            if self.backdrop_sync_job is not None:
                self.after_cancel(self.backdrop_sync_job)
            self.backdrop_sync_job = self.after_idle(self._sync_backdrop_geometry)
        except tk.TclError:
            self.backdrop_sync_job = None

    def _sync_backdrop_geometry(self) -> None:
        self.backdrop_sync_job = None
        if not self.split_surface_enabled or self.backdrop is None or self.desktop_mode_active:
            return
        try:
            self.update_idletasks()
            width = max(1, self.winfo_width())
            height = max(1, self.winfo_height())
            x = self.winfo_rootx()
            y = self.winfo_rooty()
            self.backdrop.geometry(f"{width}x{height}+{x}+{y}")
            self.backdrop.deiconify()
            self.backdrop.lower(self)
            self.backdrop.attributes("-alpha", self.window_opacity)
        except tk.TclError:
            pass

    def _forward_backdrop_click(self, event: tk.Event) -> None:
        for widget in self.calendar_frame.grid_slaves():
            if not isinstance(widget, DayCell):
                continue
            x1 = widget.winfo_rootx()
            y1 = widget.winfo_rooty()
            if x1 <= event.x_root < x1 + widget.winfo_width() and y1 <= event.y_root < y1 + widget.winfo_height():
                widget._focus_draft()
                return

    def _preview_opacity(self, opacity: float) -> None:
        self.window_opacity = clamp_opacity(opacity)
        self._reapply_transparency()
        if self.desktop_mode_active and self.split_surface_enabled and self.backdrop is not None and self.backdrop_host is not None:
            self.backdrop_host.maintain(
                self.backdrop.winfo_id(),
                display_index=self.settings.desktop_display_index,
                opacity=self.window_opacity,
            )

    def _reload_persisted_opacity(self) -> None:
        persisted = self.settings_store.load()
        self.settings.window_opacity = persisted.window_opacity
        self.window_opacity = clamp_opacity(persisted.window_opacity)
        self._reapply_transparency()

    def _configure_styles(self) -> None:
        style = ttk.Style(self)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("TFrame", background=self.surface_bg)
        style.configure("TLabel", background=self.surface_bg, foreground=TEXT, font=self.fonts.body)
        style.configure(
            "Daymark.TCombobox",
            fieldbackground=INPUT_FOCUS_BG,
            background=INPUT_FOCUS_BG,
            foreground=TEXT,
            arrowcolor=SUBTLE_TEXT,
            borderwidth=0,
            padding=(10, 7),
            font=self.fonts.body,
        )
        style.map(
            "Daymark.TCombobox",
            fieldbackground=[("readonly", INPUT_FOCUS_BG)],
            foreground=[("readonly", TEXT)],
            selectbackground=[("readonly", INPUT_FOCUS_BG)],
            selectforeground=[("readonly", TEXT)],
        )

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
        options = flat_button_options(compact=compact, surface_bg=self.surface_bg)
        if textvariable is None:
            button = tk.Button(master, text=text or "", command=command, **options)
        else:
            button = tk.Button(master, textvariable=textvariable, command=command, **options)
        button.configure(font=font or self.fonts.body)
        return button

    def _build_shell(self) -> None:
        self.toolbar = tk.Frame(self, background=self.surface_bg, height=76)
        self.toolbar.pack(fill="x")
        self.toolbar.pack_propagate(False)

        self.nav_frame = tk.Frame(self.toolbar, background=self.surface_bg)
        self.nav_frame.place(relx=0.5, rely=0.5, anchor="center")
        self._text_button(
            self.nav_frame,
            "‹",
            lambda: self._change_month(-1),
            compact=True,
            font=self.fonts.nav,
        ).pack(side="left")
        tk.Label(
            self.nav_frame,
            textvariable=self.month_title,
            background=self.surface_bg,
            foreground=TEXT,
            font=self.fonts.month,
            padx=16,
        ).pack(side="left")
        self._text_button(
            self.nav_frame,
            "›",
            lambda: self._change_month(1),
            compact=True,
            font=self.fonts.nav,
        ).pack(side="left")
        self._text_button(self.nav_frame, "오늘", self._go_today, compact=True).pack(
            side="left", padx=(10, 0)
        )

        actions = tk.Frame(self.toolbar, background=self.surface_bg)
        actions.pack(side="right", padx=20, pady=16)
        self._text_button(actions, "AI 요약", self._open_report, compact=True).pack(side="left", padx=(0, 4))
        self.more_button = self._text_button(
            actions, "···", self._show_more_menu, compact=True, font=self.fonts.body_medium
        )
        self.more_button.pack(side="left")
        self.more_menu = MoreMenuPopover(self)

        self.calendar_frame = tk.Frame(self, background=self.surface_bg, padx=18, pady=4)
        self.calendar_frame.pack(fill="both", expand=True)
        for column in range(7):
            self.calendar_frame.columnconfigure(column, weight=1, uniform="calendar")
        for row in range(1, 7):
            self.calendar_frame.rowconfigure(row, weight=1, uniform="calendar")
        for column, label in enumerate(WEEKDAY_LABELS):
            if column == 5:
                foreground = SATURDAY_HEADER
            elif column == 6:
                foreground = HOLIDAY_HEADER
            else:
                foreground = MUTED_TEXT
            tk.Label(
                self.calendar_frame,
                text=label,
                background=self.surface_bg,
                foreground=foreground,
                font=self.fonts.weekday,
                anchor="center",
            ).grid(row=0, column=column, sticky="ew", pady=(0, 10))

        self.status_label = tk.Label(
            self,
            textvariable=self.status_message,
            background=HOVER_BG,
            foreground=TEXT,
            font=self.fonts.caption,
            padx=14,
            pady=8,
            borderwidth=0,
            highlightthickness=0,
        )

    def _more_actions(self) -> list[MenuAction]:
        actions = [
            MenuAction("미완료 오늘로 이동", self._carry_over),
            MenuAction("설정", self._open_settings),
        ]
        if self.desktop_host.supported:
            mode_label = "창 모드로 전환" if self.desktop_mode_active else "바탕화면에 배치"
            actions.append(MenuAction(mode_label, self._toggle_desktop_mode))
        actions.append(MenuAction("앱 종료", self._close, danger=True, separator_before=True))
        return actions

    def _show_more_menu(self) -> None:
        if self.more_menu.visible:
            self.more_menu.close()
            return
        self.more_menu.show(self.more_button, self._more_actions())

    def _set_status(self, message: str, *, duration_ms: int = 3200) -> None:
        self.status_message.set(message)
        self.status_label.place(relx=0.5, rely=1.0, y=-16, anchor="s")
        self.status_label.lift()
        if self.status_job is not None:
            try:
                self.after_cancel(self.status_job)
            except tk.TclError:
                pass

        def hide() -> None:
            self.status_job = None
            self.status_message.set("")
            try:
                self.status_label.place_forget()
            except tk.TclError:
                pass

        self.status_job = self.after(duration_ms, hide)

    def render_month(self) -> None:
        for child in self.calendar_frame.grid_slaves():
            if int(child.grid_info()["row"]) > 0:
                child.destroy()
        self.day_cells = {}
        self.month_title.set(f"{self.current.year}년 {self.current.month}월")
        matrix = month_matrix(self.current.year, self.current.month)
        for row in range(1, 7):
            self.calendar_frame.rowconfigure(row, weight=1, uniform="calendar", minsize=0)
        for week, dates in enumerate(matrix, start=1):
            for column, task_date in enumerate(dates):
                day_cell = DayCell(
                    self.calendar_frame,
                    task_date,
                    self.current.month,
                    self.repository,
                    holiday_calendar=self.holiday_calendar,
                    on_changed=self._update_summary,
                    on_selected=self._select_date,
                    surface_bg=self.surface_bg,
                    selected=task_date == self.selected_date,
                )
                self.day_cells[task_date] = day_cell
                day_cell.grid(row=week, column=column, sticky="nsew", padx=7, pady=4)
        self._update_summary()

    def _update_summary(self) -> None:
        start = self.current.replace(day=1)
        end = self.current.replace(day=monthrange(self.current.year, self.current.month)[1])
        tasks = self.repository.list_between(start, end)
        completed = sum(task.completed for task in tasks)
        self.summary.set(f"업무 {len(tasks)} · 완료 {completed} · 미완료 {len(tasks) - completed}")

    def _select_date(self, selected: date) -> None:
        previous = self.selected_date
        self.selected_date = selected
        if previous in self.day_cells:
            self.day_cells[previous].set_selected(False)
        if selected in self.day_cells:
            self.day_cells[selected].set_selected(True)

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
        copied = self.repository.copy_incomplete_before(today)
        self.current = today.replace(day=1)
        self.selected_date = today
        self.render_month()
        if copied:
            self._set_status(f"미완료 업무 {copied}개를 오늘로 복사했습니다 · 원본 유지")
        else:
            self._set_status("복사할 미완료 업무가 없습니다")

    def _open_report(self) -> None:
        self._present_dialog(ReportDialog(self, self.repository, self.settings, self.selected_date))

    def _open_settings(self) -> None:
        self._present_dialog(
            SettingsDialog(
                self,
                self.settings,
                self.settings_store,
                displays=self.desktop_host.displays(),
                on_saved=self._apply_saved_visual_settings,
                on_opacity_preview=self._preview_opacity,
            )
        )

    def _apply_saved_visual_settings(self) -> None:
        self.window_opacity = clamp_opacity(self.settings.window_opacity)
        self._reapply_transparency()
        self._sync_backdrop_geometry()
        if not self.desktop_mode_active:
            return
        backdrop_result: DesktopAttachResult | None = None
        if self.split_surface_enabled and self.backdrop is not None and self.backdrop_host is not None:
            backdrop_result = self.backdrop_host.maintain(
                self.backdrop.winfo_id(),
                display_index=self.settings.desktop_display_index,
                opacity=self.window_opacity,
            )
        result = self.desktop_host.maintain(
            self.winfo_id(),
            display_index=self.settings.desktop_display_index,
            opacity=None if self.split_surface_enabled else self.window_opacity,
        )
        if backdrop_result is not None and not backdrop_result.success:
            result = backdrop_result
        if not result.success:
            self._fallback_to_window_mode()
            messagebox.showwarning("바탕화면 설정", result.message, parent=self)
            return
        if result.display_index != self.settings.desktop_display_index:
            self.settings.desktop_display_index = result.display_index
            self.settings_store.save(self.settings)
        self._reapply_transparency()

    def _present_dialog(self, dialog: tk.Toplevel) -> None:
        if not self.desktop_mode_active:
            return
        # WorkerW의 자식 창에서 연 대화상자가 바탕화면 아래로 내려가지 않도록
        # 최초 표시 순간에만 앞으로 올린 뒤 일반 Z-order로 되돌린다.
        try:
            dialog.attributes("-topmost", True)

            def release_topmost() -> None:
                try:
                    if dialog.winfo_exists():
                        dialog.attributes("-topmost", False)
                except tk.TclError:
                    pass

            dialog.after(150, release_topmost)
            dialog.lift()
            dialog.focus_force()
        except tk.TclError:
            pass

    def _toggle_desktop_mode_event(self, event: tk.Event[tk.Misc]) -> str:
        del event
        self._toggle_desktop_mode()
        return "break"

    def _toggle_desktop_mode(self) -> None:
        self._set_desktop_mode(
            not self.desktop_mode_active,
            notify=True,
            prefer_current_display=not self.desktop_mode_active,
        )

    def _set_desktop_mode(
        self,
        enabled: bool,
        *,
        notify: bool,
        prefer_current_display: bool = False,
    ) -> None:
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
            self._reload_persisted_opacity()
            if prefer_current_display:
                current_display = self.desktop_host.current_display_index(self.winfo_id())
                if current_display is not None:
                    self.settings.desktop_display_index = current_display
            try:
                self.overrideredirect(True)
                self.update_idletasks()
            except tk.TclError:
                pass
            backdrop_result: DesktopAttachResult | None = None
            if self.split_surface_enabled and self.backdrop is not None and self.backdrop_host is not None:
                self.backdrop.deiconify()
                self.backdrop.update_idletasks()
                backdrop_result = self.backdrop_host.attach(
                    self.backdrop.winfo_id(),
                    display_index=self.settings.desktop_display_index,
                    opacity=self.window_opacity,
                )
            result = self.desktop_host.attach(
                self.winfo_id(),
                display_index=self.settings.desktop_display_index,
                opacity=None if self.split_surface_enabled else self.window_opacity,
            )
            if backdrop_result is not None and not backdrop_result.success:
                result = backdrop_result
            if not result.success:
                self._fallback_to_window_mode()
                if notify:
                    messagebox.showwarning("바탕화면 모드", result.message, parent=self)
                return
            self.desktop_mode_active = True
            self.settings.desktop_mode = True
            self.settings.desktop_display_index = result.display_index
            self.desktop_mode_label.set("창 모드")
            self.settings_store.save(self.settings)
            self._reapply_transparency()
            self._schedule_desktop_maintenance()
            return

        self._cancel_desktop_maintenance()
        result = self.desktop_host.detach()
        if self.backdrop_host is not None:
            self.backdrop_host.detach()
        self.desktop_mode_active = False
        self.settings.desktop_mode = False
        self.desktop_mode_label.set("바탕화면")
        self.settings_store.save(self.settings)
        self._restore_normal_window_chrome()
        self._reapply_transparency()
        self._schedule_backdrop_sync()
        if notify and not result.success:
            messagebox.showwarning("창 모드", result.message, parent=self)

    def _fallback_to_window_mode(self) -> None:
        """Detach both split surfaces before presenting the app as a normal window."""
        self._cancel_desktop_maintenance()
        try:
            self.desktop_host.detach()
        finally:
            if self.backdrop_host is not None:
                self.backdrop_host.detach()
        self.desktop_mode_active = False
        self.settings.desktop_mode = False
        self.desktop_mode_label.set("바탕화면")
        self.settings_store.save(self.settings)
        self._restore_normal_window_chrome()
        self._reapply_transparency()
        self._schedule_backdrop_sync()

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
        backdrop_result: DesktopAttachResult | None = None
        if self.split_surface_enabled and self.backdrop is not None and self.backdrop_host is not None:
            backdrop_result = self.backdrop_host.maintain(
                self.backdrop.winfo_id(),
                display_index=self.settings.desktop_display_index,
                opacity=self.window_opacity,
            )
        result: DesktopAttachResult = self.desktop_host.maintain(
            self.winfo_id(),
            display_index=self.settings.desktop_display_index,
            opacity=None if self.split_surface_enabled else self.window_opacity,
        )
        if backdrop_result is not None and not backdrop_result.success:
            result = backdrop_result
        if not result.success:
            self._fallback_to_window_mode()
            return
        if result.display_index != self.settings.desktop_display_index:
            self.settings.desktop_display_index = result.display_index
            self.settings_store.save(self.settings)
        self._reapply_transparency()
        self._schedule_desktop_maintenance()

    def _close(self) -> None:
        self.more_menu.close()
        self._cancel_desktop_maintenance()
        if self.status_job is not None:
            try:
                self.after_cancel(self.status_job)
            except tk.TclError:
                pass
            self.status_job = None
        if self.backdrop_sync_job is not None:
            try:
                self.after_cancel(self.backdrop_sync_job)
            except tk.TclError:
                pass
            self.backdrop_sync_job = None
        for job_id in tuple(self.transparency_jobs):
            try:
                self.after_cancel(job_id)
            except tk.TclError:
                pass
        self.transparency_jobs.clear()
        if self.desktop_mode_active:
            self.desktop_host.detach()
            if self.backdrop_host is not None:
                self.backdrop_host.detach()
        self.repository.close()
        self.destroy()
