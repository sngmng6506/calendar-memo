from __future__ import annotations

import tkinter as tk
from collections.abc import Callable

from daymark.models import Task
from daymark.theme import CHECKED, INPUT_FOCUS_BG, MUTED_TEXT, TEXT, WINDOW_BG


class TaskRow(tk.Frame):
    def __init__(
        self,
        master: tk.Misc,
        task: Task | None,
        on_commit: Callable[["TaskRow", bool], None],
        on_toggle: Callable[["TaskRow"], None],
        on_delete: Callable[["TaskRow"], None],
    ) -> None:
        super().__init__(master, background=WINDOW_BG, borderwidth=0, highlightthickness=0)
        self.task = task
        self.on_commit = on_commit
        self.on_toggle = on_toggle
        self.on_delete = on_delete
        self.completed_var = tk.BooleanVar(value=task.completed if task else False)
        self.content_var = tk.StringVar(value=task.content if task else "")

        self.checkbox = tk.Button(
            self,
            command=self._toggle,
            background=WINDOW_BG,
            activebackground=WINDOW_BG,
            foreground=MUTED_TEXT,
            activeforeground=TEXT,
            relief="flat",
            borderwidth=0,
            highlightthickness=0,
            padx=0,
            pady=0,
            width=2,
            cursor="hand2",
            font=("TkDefaultFont", 9),
        )
        self.entry = tk.Entry(
            self,
            textvariable=self.content_var,
            background=WINDOW_BG,
            foreground=TEXT,
            insertbackground=TEXT,
            selectbackground=INPUT_FOCUS_BG,
            selectforeground=TEXT,
            relief="flat",
            borderwidth=0,
            highlightthickness=0,
            font=("TkDefaultFont", 9),
        )
        self.entry.pack(side="left", fill="x", expand=True, ipady=1)
        self.entry.bind("<Return>", self._commit)
        self.entry.bind("<FocusIn>", self._focus_in)
        self.entry.bind("<FocusOut>", self._focus_out)
        self.entry.bind("<BackSpace>", self._backspace)
        self._sync_task_widgets()
        self._apply_completed_style()

    def set_task(self, task: Task) -> None:
        self.task = task
        self.completed_var.set(task.completed)
        self._sync_task_widgets()
        self._apply_completed_style()

    def focus_input(self) -> None:
        self.entry.focus_set()
        self.entry.icursor("end")

    def _sync_task_widgets(self) -> None:
        if self.task is not None and not self.checkbox.winfo_manager():
            self.checkbox.pack(side="left", before=self.entry, padx=(0, 3))
        elif self.task is None and self.checkbox.winfo_manager():
            self.checkbox.pack_forget()

    def _toggle(self) -> None:
        self.completed_var.set(not self.completed_var.get())
        self.on_toggle(self)

    def _commit(self, _event: tk.Event | None) -> str:
        self.on_commit(self, True)
        return "break"

    def _focus_in(self, _event: tk.Event) -> None:
        self.entry.configure(background=INPUT_FOCUS_BG)

    def _focus_out(self, _event: tk.Event) -> None:
        if self.task is not None and not self.content_var.get().strip():
            self.on_delete(self)
        elif self.task is not None:
            self.on_commit(self, False)
        try:
            self.entry.configure(background=WINDOW_BG)
        except tk.TclError:
            pass

    def _backspace(self, _event: tk.Event) -> str | None:
        if not self.content_var.get() and self.task is not None:
            self.on_delete(self)
            return "break"
        return None

    def _apply_completed_style(self) -> None:
        completed = self.completed_var.get()
        self.entry.configure(foreground=MUTED_TEXT if completed else TEXT)
        self.checkbox.configure(
            text="✓" if completed else "□",
            foreground=CHECKED if completed else MUTED_TEXT,
        )
