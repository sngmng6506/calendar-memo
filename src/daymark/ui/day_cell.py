from __future__ import annotations

import tkinter as tk
from collections.abc import Callable
from datetime import date
from tkinter import ttk

from daymark.models import Task
from daymark.repository import TaskRepository
from daymark.ui.task_row import TaskRow


class DayCell(ttk.Frame):
    def __init__(
        self,
        master: tk.Misc,
        task_date: date,
        current_month: int,
        repository: TaskRepository,
        on_changed: Callable[[], None],
        on_selected: Callable[[date], None],
    ) -> None:
        super().__init__(master, padding=5, relief="solid", borderwidth=1)
        self.task_date = task_date
        self.repository = repository
        self.on_changed = on_changed
        self.on_selected = on_selected
        self.rows_frame = ttk.Frame(self)
        muted = task_date.month != current_month
        header_style = "Muted.TLabel" if muted else "Day.TLabel"
        if task_date == date.today():
            header_style = "Today.TLabel"
        self.header = ttk.Label(self, text=str(task_date.day), style=header_style)
        self.header.pack(anchor="w")
        self.rows_frame.pack(fill="both", expand=True, pady=(3, 0))
        self.bind("<Button-1>", self._mark_selected)
        self.header.bind("<Button-1>", self._mark_selected)
        self.rows_frame.bind("<Button-1>", self._mark_selected)
        self.refresh()

    def refresh(self) -> None:
        for child in self.rows_frame.winfo_children():
            child.destroy()
        for task in self.repository.list_for_date(self.task_date):
            self._add_row(task)
        draft = self._add_row(None)
        draft.entry.configure(style="Draft.TEntry")

    def _create_row(self, task: Task | None) -> TaskRow:
        row = TaskRow(
            self.rows_frame,
            task,
            on_commit=self._commit_row,
            on_toggle=self._toggle_row,
            on_delete=self._delete_row,
        )
        for widget in (row, row.checkbox, row.entry):
            widget.bind("<Button-1>", self._mark_selected, add="+")
        return row

    def _add_row(self, task: Task | None) -> TaskRow:
        row = self._create_row(task)
        row.pack(fill="x", pady=1)
        return row

    def _commit_row(self, row: TaskRow) -> None:
        self._mark_selected()
        content = row.content_var.get().strip()
        if not content:
            return
        if row.task is None:
            previous = self._previous_task_id(row)
            row.task = self.repository.add(self.task_date, content, previous)
            row.entry.configure(style="TEntry")
        else:
            self.repository.update_content(row.task.id, content)
        new_row = self._insert_after(row)
        new_row.focus_input()
        self.on_changed()

    def _toggle_row(self, row: TaskRow) -> None:
        self._mark_selected()
        if row.task is None:
            row.completed_var.set(False)
            return
        self.repository.set_completed(row.task.id, row.completed_var.get())
        row._apply_completed_style()
        self.on_changed()

    def _delete_row(self, row: TaskRow) -> None:
        self._mark_selected()
        if row.task is not None:
            self.repository.delete(row.task.id)
        row.destroy()
        self._ensure_draft()
        self.on_changed()

    def _insert_after(self, row: TaskRow) -> TaskRow:
        siblings = list(self.rows_frame.winfo_children())
        row_index = siblings.index(row)
        next_sibling = siblings[row_index + 1] if row_index + 1 < len(siblings) else None
        new_row = self._create_row(None)
        if next_sibling is None:
            new_row.pack(fill="x", pady=1)
        else:
            new_row.pack(fill="x", pady=1, before=next_sibling)
        return new_row

    def _previous_task_id(self, row: TaskRow) -> str | None:
        previous: str | None = None
        for child in self.rows_frame.winfo_children():
            if child is row:
                break
            if isinstance(child, TaskRow) and child.task is not None:
                previous = child.task.id
        return previous

    def _ensure_draft(self) -> None:
        if not any(
            isinstance(child, TaskRow) and child.task is None
            for child in self.rows_frame.winfo_children()
        ):
            self._add_row(None)

    def _mark_selected(self, _event: tk.Event | None = None) -> None:
        self.on_selected(self.task_date)
