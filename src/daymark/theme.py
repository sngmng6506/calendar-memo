from __future__ import annotations

WINDOW_BG = "#15181c"
HOVER_BG = "#20252b"
INPUT_FOCUS_BG = "#242a31"
TEXT = "#f1f3f4"
MUTED_TEXT = "#858d96"
SUBTLE_TEXT = "#a7adb4"
ACCENT = "#8ab4f8"
CHECKED = "#91b7a7"
DANGER = "#e2a3a3"

DEFAULT_WINDOW_OPACITY = 0.86


def flat_button_options(*, compact: bool = False) -> dict[str, object]:
    return {
        "background": WINDOW_BG,
        "activebackground": HOVER_BG,
        "foreground": SUBTLE_TEXT,
        "activeforeground": TEXT,
        "relief": "flat",
        "borderwidth": 0,
        "highlightthickness": 0,
        "padx": 5 if compact else 9,
        "pady": 3 if compact else 5,
        "cursor": "hand2",
    }
