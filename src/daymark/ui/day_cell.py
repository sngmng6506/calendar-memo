from __future__ import annotations

import tkinter as tk
from collections.abc import Callable
from datetime import date

from daymark.holiday_calendar import HolidayCalendar
from daymark.models import Task
from daymark.repository import TaskRepository
from daymark.theme import (
    ACCENT,
    HOLIDAY_RED,
    MUTED_TEXT,
    OUTSIDE_HOLIDAY,
    OUTSIDE_SATURDAY,
    OUTSIDE_TEXT,
    SATURDAY_BLUE,
    SELECTED_BG,
    TEXT,
    WINDOW_BG,
    fonts,
)
from daymark.ui.task_row import TaskRow


class DateBadge(tk.Canvas):
    def __init__(
        self,
        master: tk.Misc,
        *,
        day: int,
        foreground: str,
        today: bool,
        surface_bg: str,
    ) -> None:
        super().__init__(
            master,
            width=30,
            height=28,
            background=surface_bg,
            borderwidth=0,
            highlightthickness=0,
        )
        self.day = day
        self.foreground = foreground
        self.today = today
        self.surface_bg = surface_bg
        token = fonts(master)
        self.font = token.date_today if today else token.date
        self._draw()

    def set_surface(self, surface_bg: str) -> None:
        self.surface_bg = surface_bg
        self.configure(background=surface_bg)
        self._draw()

    def _draw(self) -> None:
        self.delete("all")
        if self.today:
            self.create_oval(2, 1, 28, 27, fill=ACCENT, outline="")
            color = TEXT
        else:
            color = self.foreground
        self.create_text(15, 14, text=str(self.day), fill=color, font=self.font)


def date_foreground(
    task_date: date,
    current_month: int,
    holiday_calendar: HolidayCalendar,
) -> str:
    outside = task_date.month != current_month
    holiday = task_date.weekday() == 6 or holiday_calendar.is_holiday(task_date)
    saturday = task_date.weekday() == 5
    if outside and holiday:
        return OUTSIDE_HOLIDAY
    if outside and saturday:
        return OUTSIDE_SATURDAY
    if outside:
        return OUTSIDE_TEXT
    if holiday:
        return HOLIDAY_RED
    if saturday:
        return SATURDAY_BLUE
    return TEXT


class DayCell(tk.Frame):
    def __init__(
        self,
        master: tk.Misc,
        task_date: date,
        current_month: int,
        repository: TaskRepository,
        holiday_calendar: HolidayCalendar,
        on_changed: Callable[[], None] | None,
        on_selected: Callable[[date], None],
        *,
        surface_bg: str = WINDOW_BG,
        selected: bool = False,
    ) -> None:
        self.base_surface_bg = surface_bg
        self.selected = selected
        self.outside_month = task_date.month != current_month
        effective_bg = SELECTED_BG if selected else surface_bg
        super().__init__(
            master,
            background=effective_bg,
            borderwidth=0,
            highlightthickness=0,
            padx=5,
            pady=5,
        )
        self.task_date = task_date
        self.surface_bg = effective_bg
        self.repository = repository
        self.holiday_calendar = holiday_calendar
        self.on_changed = on_changed
        self.on_selected = on_selected
        self._canvas_window: int | None = None
        self._idle_jobs: set[str] = set()

        self.header = DateBadge(
            self,
            day=task_date.day,
            foreground=date_foreground(task_date, current_month, holiday_calendar),
            today=task_date == date.today(),
            surface_bg=self.surface_bg,
        )
        self.header.pack(anchor="w")

        self.scroll_container = tk.Frame(
            self, background=self.surface_bg, borderwidth=0, highlightthickness=0
        )
        self.scroll_container.pack(fill="both", expand=True, pady=(4, 0))
        self.canvas = tk.Canvas(
            self.scroll_container,
            background=self.surface_bg,
            borderwidth=0,
            highlightthickness=0,
            yscrollincrement=22,
        )
        self.scrollbar = tk.Scrollbar(
            self.scroll_container,
            orient="vertical",
            command=self.canvas.yview,
            background=MUTED_TEXT,
            activebackground=TEXT,
            troughcolor=self.surface_bg,
            relief="flat",
            borderwidth=0,
            highlightthickness=0,
            width=6,
        )
        self.canvas.configure(yscrollcommand=self._on_yview)
        self.scroll_container.columnconfigure(0, weight=1)
        self.scroll_container.rowconfigure(0, weight=1)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.rows_frame = tk.Frame(
            self.canvas, background=self.surface_bg, borderwidth=0, highlightthickness=0
        )
        self._canvas_window = self.canvas.create_window(
            (0, 0), window=self.rows_frame, anchor="nw"
        )
        self.rows_frame.bind("<Configure>", self._update_scroll_region)
        self.canvas.bind("<Configure>", self._resize_rows_frame)

        for widget in (self, self.header, self.scroll_container, self.canvas, self.rows_frame):
            widget.bind("<Button-1>", self._focus_draft)
            widget.bind("<MouseWheel>", self._on_mousewheel)
        self.bind("<Destroy>", self._cancel_idle_jobs, add="+")
        self.refresh()

    def set_selected(self, selected: bool) -> None:
        if self.selected == selected:
            return
        self.selected = selected
        self.surface_bg = SELECTED_BG if selected else self.base_surface_bg
        self.configure(background=self.surface_bg)
        self.header.set_surface(self.surface_bg)
        self.scroll_container.configure(background=self.surface_bg)
        self.canvas.configure(background=self.surface_bg)
        self.rows_frame.configure(background=self.surface_bg)
        self.scrollbar.configure(troughcolor=self.surface_bg)
        for child in self.rows_frame.winfo_children():
            if isinstance(child, TaskRow):
                child.set_surface(self.surface_bg)

    def refresh(self) -> None:
        for child in self.rows_frame.winfo_children():
            child.destroy()
        for task in self.repository.list_for_date(self.task_date):
            self._add_row(task)
        self._add_row(None)
        self._after_idle(self._update_scroll_region)

    def _create_row(self, task: Task | None) -> TaskRow:
        row = TaskRow(
            self.rows_frame,
            task,
            on_commit=self._commit_row,
            on_toggle=self._toggle_row,
            on_delete=self._delete_row,
            surface_bg=self.surface_bg,
            muted=self.outside_month,
        )
        for widget in (row, row.checkbox, row.entry):
            widget.bind("<Button-1>", self._mark_selected, add="+")
            widget.bind("<MouseWheel>", self._on_mousewheel, add="+")
        return row

    def _add_row(self, task: Task | None) -> TaskRow:
        row = self._create_row(task)
        row.pack(fill="x", pady=0)
        return row

    def _commit_row(self, row: TaskRow, advance: bool) -> None:
        self._mark_selected()
        content = row.content_var.get().strip()
        if not content:
            return
        if row.task is None:
            previous = self._previous_task_id(row)
            row.set_task(self.repository.add(self.task_date, content, previous))
        else:
            self.repository.update_content(row.task.id, content)
        if advance:
            new_row = self._draft_after(row)
            new_row.focus_input()
            self._after_idle(lambda: self._scroll_row_into_view(new_row))
        if self.on_changed is not None:
            self.on_changed()

    def _toggle_row(self, row: TaskRow) -> None:
        self._mark_selected()
        if row.task is None:
            row.completed_var.set(False)
            return
        self.repository.set_completed(row.task.id, row.completed_var.get())
        row._apply_completed_style()
        if self.on_changed is not None:
            self.on_changed()

    def _delete_row(self, row: TaskRow) -> None:
        self._mark_selected()
        if row.task is not None:
            self.repository.delete(row.task.id)
        row.destroy()
        self._ensure_draft()
        self._after_idle(self._update_scroll_region)
        if self.on_changed is not None:
            self.on_changed()

    def _draft_after(self, row: TaskRow) -> TaskRow:
        siblings = list(self.rows_frame.winfo_children())
        row_index = siblings.index(row)
        next_sibling = siblings[row_index + 1] if row_index + 1 < len(siblings) else None
        drafts = [
            child
            for child in siblings
            if isinstance(child, TaskRow) and child.task is None and child is not row
        ]
        if isinstance(next_sibling, TaskRow) and next_sibling.task is None:
            draft = next_sibling
        elif drafts:
            draft = drafts[-1]
            draft.pack_forget()
            if next_sibling is None:
                draft.pack(fill="x", pady=0)
            else:
                draft.pack(fill="x", pady=0, before=next_sibling)
        else:
            draft = self._create_row(None)
            if next_sibling is None:
                draft.pack(fill="x", pady=0)
            else:
                draft.pack(fill="x", pady=0, before=next_sibling)

        for extra in drafts:
            if extra is not draft:
                extra.destroy()
        return draft

    def _insert_after(self, row: TaskRow) -> TaskRow:
        return self._draft_after(row)

    def _create_draft_at_end(self) -> TaskRow:
        new_row = self._create_row(None)
        new_row.pack(fill="x", pady=0)
        return new_row

    def _ensure_draft(self) -> None:
        drafts = [
            child
            for child in self.rows_frame.winfo_children()
            if isinstance(child, TaskRow) and child.task is None
        ]
        if not drafts:
            self._create_draft_at_end()
            return
        for extra in drafts[:-1]:
            extra.destroy()

    def _after_idle(self, callback: Callable[[], None]) -> None:
        job_id = ""

        def run() -> None:
            self._idle_jobs.discard(job_id)
            if not self.winfo_exists():
                return
            callback()

        try:
            job_id = self.after_idle(run)
            self._idle_jobs.add(job_id)
        except tk.TclError:
            pass

    def _cancel_idle_jobs(self, event: tk.Event | None = None) -> None:
        if event is not None and event.widget is not self:
            return
        for job_id in tuple(self._idle_jobs):
            try:
                self.after_cancel(job_id)
            except tk.TclError:
                pass
        self._idle_jobs.clear()

    def _previous_task_id(self, row: TaskRow) -> str | None:
        previous: str | None = None
        for child in self.rows_frame.winfo_children():
            if child is row:
                break
            if isinstance(child, TaskRow) and child.task is not None:
                previous = child.task.id
        return previous

    def _focus_draft(self, _event: tk.Event | None = None) -> None:
        self._mark_selected()
        drafts = [
            child
            for child in self.rows_frame.winfo_children()
            if isinstance(child, TaskRow) and child.task is None
        ]
        if drafts:
            drafts[-1].focus_input()
            self._after_idle(lambda: self._scroll_row_into_view(drafts[-1]))

    def _mark_selected(self, _event: tk.Event | None = None) -> None:
        self.on_selected(self.task_date)

    def _resize_rows_frame(self, event: tk.Event) -> None:
        if self._canvas_window is not None:
            self.canvas.itemconfigure(self._canvas_window, width=max(1, event.width))
        self._update_scroll_region()

    def _update_scroll_region(self, _event: tk.Event | None = None) -> None:
        try:
            self.canvas.configure(scrollregion=self.canvas.bbox("all") or (0, 0, 0, 0))
            required = self.rows_frame.winfo_reqheight()
            visible = self.canvas.winfo_height()
            if required > visible + 2 and not self.scrollbar.winfo_manager():
                self.scrollbar.grid(row=0, column=1, sticky="ns")
            elif required <= visible + 2 and self.scrollbar.winfo_manager():
                self.scrollbar.grid_remove()
                self.canvas.yview_moveto(0.0)
        except tk.TclError:
            pass

    def _on_yview(self, first: str, last: str) -> None:
        self.scrollbar.set(first, last)

    def _on_mousewheel(self, event: tk.Event) -> str:
        if self.scrollbar.winfo_manager():
            delta = -1 if event.delta > 0 else 1
            self.canvas.yview_scroll(delta, "units")
        return "break"

    def _scroll_row_into_view(self, row: TaskRow) -> None:
        try:
            self.update_idletasks()
            row_bottom = row.winfo_y() + row.winfo_height()
            total = max(1, self.rows_frame.winfo_reqheight())
            viewport_bottom = self.canvas.canvasy(self.canvas.winfo_height())
            if row_bottom > viewport_bottom:
                self.canvas.yview_moveto(
                    max(0.0, (row_bottom - self.canvas.winfo_height()) / total)
                )
        except tk.TclError:
            pass
