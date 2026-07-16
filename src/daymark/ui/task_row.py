from __future__ import annotations

import tkinter as tk
from collections.abc import Callable

from daymark.models import Task
from daymark.theme import (
    INPUT_FOCUS_BG,
    MUTED_TEXT,
    OUTSIDE_TEXT,
    SUBTLE_TEXT,
    TEXT,
    WINDOW_BG,
    fonts,
)


class RoundCheck(tk.Canvas):
    CLICK_SIZE = 22
    RADIUS = 6

    def __init__(self, master: tk.Misc, command: Callable[[], None], *, surface_bg: str) -> None:
        super().__init__(
            master,
            width=self.CLICK_SIZE,
            height=self.CLICK_SIZE,
            background=surface_bg,
            borderwidth=0,
            highlightthickness=0,
            takefocus=True,
            cursor="hand2",
        )
        self.command = command
        self.surface_bg = surface_bg
        self.completed = False
        self.hovered = False
        self.focused = False
        self.bind("<Button-1>", self._click)
        self.bind("<Return>", self._key_toggle)
        self.bind("<space>", self._key_toggle)
        self.bind("<Enter>", self._enter)
        self.bind("<Leave>", self._leave)
        self.bind("<FocusIn>", self._focus_in)
        self.bind("<FocusOut>", self._focus_out)
        self._draw()

    def set_surface(self, surface_bg: str) -> None:
        self.surface_bg = surface_bg
        self.configure(background=surface_bg)
        self._draw()

    def set_completed(self, completed: bool) -> None:
        self.completed = completed
        self._draw()

    def _click(self, _event: tk.Event) -> None:
        self.focus_set()
        self.command()

    def _key_toggle(self, _event: tk.Event) -> str:
        self.command()
        return "break"

    def _enter(self, _event: tk.Event) -> None:
        self.hovered = True
        self._draw()

    def _leave(self, _event: tk.Event) -> None:
        self.hovered = False
        self._draw()

    def _focus_in(self, _event: tk.Event) -> None:
        self.focused = True
        self._draw()

    def _focus_out(self, _event: tk.Event) -> None:
        self.focused = False
        self._draw()

    def _draw(self) -> None:
        self.delete("all")
        center = self.CLICK_SIZE / 2
        radius = self.RADIUS
        outline = TEXT if self.focused else (SUBTLE_TEXT if self.hovered else MUTED_TEXT)
        fill = MUTED_TEXT if self.completed else self.surface_bg
        if self.focused:
            self.create_oval(
                center - radius - 3,
                center - radius - 3,
                center + radius + 3,
                center + radius + 3,
                outline=SUBTLE_TEXT,
                width=1,
            )
        self.create_oval(
            center - radius,
            center - radius,
            center + radius,
            center + radius,
            outline=outline,
            width=1.4,
            fill=fill,
        )
        if self.completed:
            self.create_line(
                center - 4,
                center,
                center - 1,
                center + 3,
                center + 5,
                center - 4,
                fill=TEXT,
                width=1.7,
                capstyle="round",
                joinstyle="round",
            )


class TaskRow(tk.Frame):
    def __init__(
        self,
        master: tk.Misc,
        task: Task | None,
        on_commit: Callable[["TaskRow", bool], None],
        on_toggle: Callable[["TaskRow"], None],
        on_delete: Callable[["TaskRow"], None],
        *,
        surface_bg: str = WINDOW_BG,
        muted: bool = False,
    ) -> None:
        super().__init__(master, background=surface_bg, borderwidth=0, highlightthickness=0)
        self.surface_bg = surface_bg
        self.muted = muted
        self.task = task
        self.on_commit = on_commit
        self.on_toggle = on_toggle
        self.on_delete = on_delete
        self.completed_var = tk.BooleanVar(value=task.completed if task else False)
        self.content_var = tk.StringVar(value=task.content if task else "")
        self.fonts = fonts(master)

        self.checkbox = RoundCheck(self, self._toggle, surface_bg=self.surface_bg)
        self.entry = tk.Entry(
            self,
            textvariable=self.content_var,
            background=self.surface_bg,
            foreground=TEXT,
            insertbackground=TEXT,
            selectbackground=INPUT_FOCUS_BG,
            selectforeground=TEXT,
            relief="flat",
            borderwidth=0,
            highlightthickness=0,
            font=self.fonts.task,
        )
        self.entry.pack(side="left", fill="x", expand=True, ipady=2)
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

    def set_surface(self, surface_bg: str) -> None:
        self.surface_bg = surface_bg
        self.configure(background=surface_bg)
        self.checkbox.set_surface(surface_bg)
        if self.focus_get() is not self.entry:
            self.entry.configure(background=surface_bg)

    def focus_input(self) -> None:
        self.entry.focus_set()
        self.entry.icursor("end")

    def _sync_task_widgets(self) -> None:
        if self.task is not None and not self.checkbox.winfo_manager():
            self.checkbox.pack(side="left", before=self.entry, padx=(0, 4), pady=0)
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
            self.entry.configure(background=self.surface_bg)
        except tk.TclError:
            pass

    def _backspace(self, _event: tk.Event) -> str | None:
        if not self.content_var.get() and self.task is not None:
            self.on_delete(self)
            return "break"
        return None

    def _apply_completed_style(self) -> None:
        completed = self.completed_var.get()
        if completed:
            foreground = MUTED_TEXT
        elif self.muted:
            foreground = OUTSIDE_TEXT
        else:
            foreground = TEXT
        self.entry.configure(foreground=foreground)
        self.checkbox.set_completed(completed)
