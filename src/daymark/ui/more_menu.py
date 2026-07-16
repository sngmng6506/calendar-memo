from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
import tkinter as tk

from daymark.theme import DANGER, HOVER_BG, TEXT, WINDOW_BG, fonts


@dataclass(frozen=True, slots=True)
class MenuAction:
    label: str
    command: Callable[[], None]
    danger: bool = False
    separator_before: bool = False


class MoreMenuPopover:
    """Small wrapper around Tk's native popup menu.

    A native menu is more reliable than a custom Toplevel when the main window
    is attached to WorkerW or uses a transparent foreground surface.
    """

    def __init__(self, master: tk.Misc) -> None:
        self.master = master
        self.fonts = fonts(master)
        self.menu: tk.Menu | None = None
        self._visible = False

    @property
    def visible(self) -> bool:
        return self._visible

    def show(self, anchor: tk.Widget, actions: Sequence[MenuAction]) -> None:
        self.close()
        menu = tk.Menu(
            self.master,
            tearoff=False,
            background=WINDOW_BG,
            foreground=TEXT,
            activebackground=HOVER_BG,
            activeforeground=TEXT,
            relief="flat",
            borderwidth=0,
            font=self.fonts.button,
        )
        for action in actions:
            if action.separator_before:
                menu.add_separator()
            menu.add_command(
                label=action.label,
                command=lambda item=action: self._invoke(item.command),
                foreground=DANGER if action.danger else TEXT,
            )
        self.menu = menu
        self._visible = True
        x = anchor.winfo_rootx() + anchor.winfo_width()
        y = anchor.winfo_rooty() + anchor.winfo_height()
        try:
            menu.tk_popup(x, y)
        finally:
            menu.grab_release()
            self._visible = False

    def close(self) -> None:
        if self.menu is not None:
            try:
                self.menu.unpost()
                self.menu.destroy()
            except tk.TclError:
                pass
        self.menu = None
        self._visible = False

    def _invoke(self, command: Callable[[], None]) -> None:
        self.close()
        command()
