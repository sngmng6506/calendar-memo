from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import tkinter as tk
import tkinter.font as tkfont

WINDOW_BG = "#1C1C1E"
CONTENT_BG = "#010203"  # Windows transparent-color key for the opaque foreground window
HOVER_BG = "#252527"
INPUT_FOCUS_BG = "#29292C"
SELECTED_BG = "#272A2E"
TEXT = "#F5F5F7"
SUBTLE_TEXT = "#AEAEB2"
MUTED_TEXT = "#6E6E73"
OUTSIDE_TEXT = "#55565B"
ACCENT = "#0A84FF"
DANGER = "#FF453A"
SATURDAY_BLUE = "#7893B8"
HOLIDAY_RED = "#C97C82"
SATURDAY_HEADER = "#637A99"
HOLIDAY_HEADER = "#A5666C"
OUTSIDE_SATURDAY = "#56677D"
OUTSIDE_HOLIDAY = "#83575B"

DEFAULT_WINDOW_OPACITY = 0.94
MIN_WINDOW_OPACITY = 0.78
MAX_WINDOW_OPACITY = 1.0


@dataclass(frozen=True, slots=True)
class FontTokens:
    family: str
    month: tuple[str, int, str]
    weekday: tuple[str, int, str]
    date: tuple[str, int, str]
    date_today: tuple[str, int, str]
    task: tuple[str, int, str]
    button: tuple[str, int, str]
    dialog_title: tuple[str, int, str]
    dialog_body: tuple[str, int, str]
    caption: tuple[str, int, str]
    section: tuple[str, int, str]
    nav: tuple[str, int, str]

    # Compatibility aliases kept so feature code does not hard-code font tuples.
    @property
    def body(self) -> tuple[str, int, str]:
        return self.dialog_body

    @property
    def body_medium(self) -> tuple[str, int, str]:
        return (self.family, self.dialog_body[1], "bold")


@lru_cache(maxsize=8)
def _available_families(root_id: int, root: tk.Misc) -> frozenset[str]:
    del root_id
    return frozenset(tkfont.families(root))


def fonts(root: tk.Misc) -> FontTokens:
    available = _available_families(id(root.winfo_toplevel()), root)
    family = next(
        (candidate for candidate in ("Segoe UI Variable", "Segoe UI") if candidate in available),
        str(tkfont.nametofont("TkDefaultFont").actual("family")),
    )
    return FontTokens(
        family=family,
        month=(family, 18, "bold"),
        weekday=(family, 10, "bold"),
        date=(family, 11, "normal"),
        date_today=(family, 11, "bold"),
        task=(family, 11, "normal"),
        button=(family, 10, "normal"),
        dialog_title=(family, 13, "bold"),
        dialog_body=(family, 10, "normal"),
        caption=(family, 9, "normal"),
        section=(family, 11, "bold"),
        nav=(family, 22, "normal"),
    )


def flat_button_options(*, compact: bool = False, surface_bg: str = WINDOW_BG) -> dict[str, object]:
    return {
        "background": surface_bg,
        "activebackground": HOVER_BG,
        "foreground": SUBTLE_TEXT,
        "activeforeground": TEXT,
        "relief": "flat",
        "borderwidth": 0,
        "highlightthickness": 0,
        "padx": 8 if compact else 12,
        "pady": 5 if compact else 8,
        "cursor": "hand2",
        "takefocus": True,
    }


def primary_button_options() -> dict[str, object]:
    return {
        "background": ACCENT,
        "activebackground": "#3395FF",
        "foreground": TEXT,
        "activeforeground": TEXT,
        "disabledforeground": "#AFCFEF",
        "relief": "flat",
        "borderwidth": 0,
        "highlightthickness": 0,
        "padx": 16,
        "pady": 8,
        "cursor": "hand2",
        "takefocus": True,
    }
