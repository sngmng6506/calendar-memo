from __future__ import annotations

from dataclasses import dataclass
import tkinter as tk
from collections.abc import Callable, Sequence

from daymark.theme import DANGER, HOVER_BG, SUBTLE_TEXT, TEXT, WINDOW_BG, fonts


@dataclass(frozen=True, slots=True)
class MenuAction:
    label: str
    command: Callable[[], None]
    danger: bool = False
    separator_before: bool = False


class MoreMenuPopover(tk.Toplevel):
    """Small non-modal flat popover anchored to the toolbar more button."""

    WIDTH = 210

    def __init__(self, master: tk.Misc) -> None:
        super().__init__(master)
        self.withdraw()
        self.overrideredirect(True)
        self.configure(background=HOVER_BG)
        self.transient(master.winfo_toplevel())
        self.fonts = fonts(master)
        self.anchor: tk.Widget | None = None
        self._outside_binding: str | None = None
        self._visible = False
        self.bind("<Escape>", lambda _event: self.close())
        self.bind("<FocusOut>", self._focus_out)

        self.frame = tk.Frame(
            self,
            background=WINDOW_BG,
            borderwidth=0,
            highlightthickness=1,
            highlightbackground="#343438",
            padx=5,
            pady=5,
        )
        self.frame.pack(fill="both", expand=True)

    @property
    def visible(self) -> bool:
        return self._visible

    def show(self, anchor: tk.Widget, actions: Sequence[MenuAction]) -> None:
        self.close()
        self.anchor = anchor
        for child in self.frame.winfo_children():
            child.destroy()
        for action in actions:
            if action.separator_before:
                tk.Frame(self.frame, height=1, background="#343438").pack(
                    fill="x", padx=8, pady=5
                )
            foreground = DANGER if action.danger else TEXT
            button = tk.Button(
                self.frame,
                text=action.label,
                command=lambda item=action: self._invoke(item.command),
                background=WINDOW_BG,
                activebackground=HOVER_BG,
                foreground=foreground,
                activeforeground=foreground,
                relief="flat",
                borderwidth=0,
                highlightthickness=0,
                anchor="w",
                padx=13,
                pady=9,
                width=23,
                cursor="hand2",
                takefocus=True,
                font=self.fonts.button,
            )
            button.pack(fill="x")

        self.update_idletasks()
        x = anchor.winfo_rootx() + anchor.winfo_width() - self.WIDTH
        y = anchor.winfo_rooty() + anchor.winfo_height() + 6
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()
        width = max(self.WIDTH, self.winfo_reqwidth())
        height = self.winfo_reqheight()
        x = max(6, min(x, screen_width - width - 6))
        y = max(6, min(y, screen_height - height - 6))
        self.geometry(f"{width}x{height}+{x}+{y}")
        self.deiconify()
        self.lift()
        self.focus_set()
        self._visible = True
        root = self.master.winfo_toplevel()
        self._outside_binding = root.bind("<Button-1>", self._outside_click, add="+")

    def close(self) -> None:
        root = self.master.winfo_toplevel()
        if self._outside_binding is not None:
            try:
                root.unbind("<Button-1>", self._outside_binding)
            except tk.TclError:
                pass
            self._outside_binding = None
        try:
            self.withdraw()
        except tk.TclError:
            pass
        self._visible = False

    def _invoke(self, command: Callable[[], None]) -> None:
        self.close()
        command()

    def _is_descendant(self, widget: tk.Misc | None, ancestor: tk.Misc) -> bool:
        current = widget
        while current is not None:
            if current is ancestor:
                return True
            current = getattr(current, "master", None)
        return False

    def _outside_click(self, event: tk.Event) -> None:
        if not self._visible:
            return
        if self._is_descendant(event.widget, self):
            return
        if self.anchor is not None and self._is_descendant(event.widget, self.anchor):
            return
        self.after_idle(self.close)

    def _focus_out(self, _event: tk.Event) -> None:
        def close_if_focus_left() -> None:
            try:
                focused = self.focus_get()
            except tk.TclError:
                focused = None
            if focused is None or not self._is_descendant(focused, self):
                self.close()

        try:
            self.after(80, close_if_focus_left)
        except tk.TclError:
            pass
