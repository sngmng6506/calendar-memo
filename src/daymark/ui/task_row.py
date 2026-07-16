from __future__ import annotations

import tkinter as tk
from collections.abc import Callable
from tkinter import ttk

from daymark.models import Task


class TaskRow(ttk.Frame):
    def __init__(
        self,
        master: tk.Misc,
        task: Task | None,
        on_commit: Callable[["TaskRow"], None],
        on_toggle: Callable[["TaskRow"], None],
        on_delete: Callable[["TaskRow"], None],
    ) -> None:
        super().__init__(master)
        self.task = task
        self.on_commit = on_commit
        self.on_toggle = on_toggle
        self.on_delete = on_delete
        self.completed_var = tk.BooleanVar(value=task.completed if task else False)
        self.content_var = tk.StringVar(value=task.content if task else "")

        self.checkbox = ttk.Checkbutton(
            self, variable=self.completed_var, command=lambda: self.on_toggle(self)
        )
        if task is not None:
            self.checkbox.pack(side="left", padx=(0, 2))
        self.entry = ttk.Entry(self, textvariable=self.content_var)
        self.entry.pack(side="left", fill="x", expand=True)
        self.entry.bind("<Return>", self._commit)
        self.entry.bind("<FocusOut>", self._focus_out)
        self.entry.bind("<BackSpace>", self._backspace)
        self._apply_completed_style()

    def focus_input(self) -> None:
        self.entry.focus_set()
        self.entry.icursor("end")

    def _commit(self, _event: tk.Event) -> str:
        self.on_commit(self)
        return "break"

    def _focus_out(self, _event: tk.Event) -> None:
        if self.task is not None and not self.content_var.get().strip():
            self.on_delete(self)
        elif self.task is not None:
            self.on_commit(self)

    def _backspace(self, _event: tk.Event) -> str | None:
        if not self.content_var.get() and self.task is not None:
            self.on_delete(self)
            return "break"
        return None

    def _apply_completed_style(self) -> None:
        self.entry.configure(style="Completed.TEntry" if self.completed_var.get() else "TEntry")
