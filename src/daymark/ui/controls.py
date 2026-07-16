from __future__ import annotations

import tkinter as tk
from collections.abc import Callable, Sequence

from daymark.theme import (
    ACCENT,
    HOVER_BG,
    INPUT_FOCUS_BG,
    MUTED_TEXT,
    SUBTLE_TEXT,
    TEXT,
    WINDOW_BG,
    fonts,
)


class FlatSelect(tk.Menubutton):
    def __init__(
        self,
        master: tk.Misc,
        variable: tk.StringVar,
        values: Sequence[str],
        *,
        width: int = 24,
        on_change: Callable[[], None] | None = None,
    ) -> None:
        super().__init__(
            master,
            textvariable=variable,
            background=INPUT_FOCUS_BG,
            activebackground=HOVER_BG,
            foreground=TEXT,
            activeforeground=TEXT,
            relief="flat",
            borderwidth=0,
            highlightthickness=0,
            anchor="w",
            padx=12,
            pady=8,
            width=width,
            cursor="hand2",
            font=fonts(master).dialog_body,
            indicatoron=True,
            takefocus=True,
        )
        menu = tk.Menu(
            self,
            tearoff=False,
            background=WINDOW_BG,
            foreground=TEXT,
            activebackground=HOVER_BG,
            activeforeground=TEXT,
            relief="flat",
            borderwidth=0,
            font=fonts(master).dialog_body,
        )
        for value in values:
            menu.add_radiobutton(
                label=value,
                variable=variable,
                value=value,
                command=on_change,
            )
        self.configure(menu=menu)
        self.menu = menu


class FlatSlider(tk.Canvas):
    """A flat, keyboard-accessible slider used for live opacity preview."""

    HEIGHT = 30
    KNOB_RADIUS = 8

    def __init__(
        self,
        master: tk.Misc,
        variable: tk.DoubleVar,
        *,
        from_: float,
        to: float,
        resolution: float = 0.01,
        command: Callable[[str], None] | None = None,
        width: int = 400,
    ) -> None:
        super().__init__(
            master,
            width=width,
            height=self.HEIGHT,
            background=WINDOW_BG,
            borderwidth=0,
            highlightthickness=0,
            takefocus=True,
            cursor="hand2",
        )
        self.variable = variable
        self.from_ = float(from_)
        self.to = float(to)
        self.resolution = float(resolution)
        self.command = command
        self.focused = False
        self.hovered = False
        self.bind("<Configure>", lambda _event: self._draw())
        self.bind("<Button-1>", self._pointer)
        self.bind("<B1-Motion>", self._pointer)
        self.bind("<Enter>", self._enter)
        self.bind("<Leave>", self._leave)
        self.bind("<FocusIn>", self._focus_in)
        self.bind("<FocusOut>", self._focus_out)
        self.bind("<Left>", lambda _event: self._step(-1))
        self.bind("<Right>", lambda _event: self._step(1))
        self.bind("<Home>", lambda _event: self.set(self.from_))
        self.bind("<End>", lambda _event: self.set(self.to))
        self._draw()

    def get(self) -> float:
        return float(self.variable.get())

    def set(self, value: float, *, notify: bool = True) -> None:
        bounded = min(self.to, max(self.from_, float(value)))
        steps = round((bounded - self.from_) / self.resolution)
        snapped = self.from_ + steps * self.resolution
        snapped = min(self.to, max(self.from_, snapped))
        self.variable.set(snapped)
        self._draw()
        if notify and self.command is not None:
            self.command(str(snapped))

    def _pointer(self, event: tk.Event) -> None:
        self.focus_set()
        left, right = self._track_bounds()
        ratio = 0.0 if right <= left else (event.x - left) / (right - left)
        self.set(self.from_ + min(1.0, max(0.0, ratio)) * (self.to - self.from_))

    def _step(self, direction: int) -> str:
        self.set(self.get() + direction * self.resolution)
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

    def _track_bounds(self) -> tuple[int, int]:
        width = max(40, self.winfo_width())
        return 10, width - 10

    def _draw(self) -> None:
        self.delete("all")
        left, right = self._track_bounds()
        center_y = self.HEIGHT // 2
        ratio = 0.0 if self.to == self.from_ else (self.get() - self.from_) / (self.to - self.from_)
        x = left + min(1.0, max(0.0, ratio)) * (right - left)
        self.create_line(left, center_y, right, center_y, fill=INPUT_FOCUS_BG, width=4, capstyle="round")
        self.create_line(left, center_y, x, center_y, fill=ACCENT, width=4, capstyle="round")
        ring = TEXT if self.focused else (SUBTLE_TEXT if self.hovered else MUTED_TEXT)
        self.create_oval(
            x - self.KNOB_RADIUS,
            center_y - self.KNOB_RADIUS,
            x + self.KNOB_RADIUS,
            center_y + self.KNOB_RADIUS,
            fill=TEXT,
            outline=ring,
            width=2 if self.focused else 1,
        )
