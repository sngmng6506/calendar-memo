from __future__ import annotations

import tkinter as tk
from collections.abc import Callable

from daymark.platform_integration import DisplayInfo
from daymark.settings import AppSettings, SettingsStore, clamp_opacity
from daymark.ui.controls import FlatSelect, FlatSlider
from daymark.theme import (
    INPUT_FOCUS_BG,
    MAX_WINDOW_OPACITY,
    MIN_WINDOW_OPACITY,
    MUTED_TEXT,
    SUBTLE_TEXT,
    TEXT,
    WINDOW_BG,
    flat_button_options,
    fonts,
    primary_button_options,
)


class SettingsDialog(tk.Toplevel):
    def __init__(
        self,
        master: tk.Misc,
        settings: AppSettings,
        store: SettingsStore,
        *,
        displays: list[DisplayInfo] | None = None,
        on_saved: Callable[[], None] | None = None,
        on_opacity_preview: Callable[[float], None] | None = None,
    ) -> None:
        super().__init__(master)
        self.title("설정")
        self.resizable(False, False)
        self.configure(background=WINDOW_BG)
        self.settings = settings
        self.store = store
        self.displays = displays or []
        self.on_saved = on_saved
        self.on_opacity_preview = on_opacity_preview
        self.fonts = fonts(master)
        self.initial_opacity = clamp_opacity(settings.window_opacity)
        self._saved = False
        self.base_url = tk.StringVar(value=settings.llm_base_url)
        self.model = tk.StringVar(value=settings.llm_model)
        self.display_choice = tk.StringVar()
        self.opacity = tk.DoubleVar(value=self.initial_opacity)
        self.opacity_label = tk.StringVar()

        frame = tk.Frame(self, background=WINDOW_BG, padx=30, pady=26)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(0, weight=1)

        tk.Label(
            frame,
            text="설정",
            background=WINDOW_BG,
            foreground=TEXT,
            font=self.fonts.dialog_title,
        ).grid(row=0, column=0, sticky="w", pady=(0, 24))

        row = 1
        row = self._build_display_section(frame, row)
        row = self._build_ai_section(frame, row)

        buttons = tk.Frame(frame, background=WINDOW_BG)
        buttons.grid(row=row, column=0, sticky="e", pady=(26, 0))
        tk.Button(
            buttons,
            text="취소",
            command=self._cancel,
            font=self.fonts.button,
            **flat_button_options(compact=True),
        ).pack(side="left", padx=(0, 8))
        tk.Button(
            buttons,
            text="저장",
            command=self._save,
            font=self.fonts.body_medium,
            **primary_button_options(),
        ).pack(side="left")

        self.transient(master)
        try:
            self.grab_set()
        except tk.TclError:
            pass
        self.protocol("WM_DELETE_WINDOW", self._cancel)

    def _build_display_section(self, frame: tk.Frame, row: int) -> int:
        self._section(frame, "화면").grid(row=row, column=0, sticky="w")
        row += 1
        self._label(frame, "바탕화면 표시 모니터").grid(
            row=row, column=0, sticky="w", pady=(14, 0)
        )
        row += 1
        labels = [display.label for display in self.displays] or ["주 모니터"]
        selected = next(
            (
                display.label
                for display in self.displays
                if display.index == self.settings.desktop_display_index
            ),
            labels[0],
        )
        self.display_choice.set(selected)
        self.display_combo = FlatSelect(frame, self.display_choice, labels, width=48)
        self.display_combo.grid(row=row, column=0, sticky="ew", pady=(7, 18))
        row += 1

        opacity_header = tk.Frame(frame, background=WINDOW_BG)
        opacity_header.grid(row=row, column=0, sticky="ew")
        self._label(opacity_header, "투명도").pack(side="left")
        tk.Label(
            opacity_header,
            textvariable=self.opacity_label,
            background=WINDOW_BG,
            foreground=SUBTLE_TEXT,
            font=self.fonts.caption,
        ).pack(side="right")
        row += 1
        self.opacity_scale = FlatSlider(
            frame,
            self.opacity,
            from_=MIN_WINDOW_OPACITY,
            to=MAX_WINDOW_OPACITY,
            resolution=0.01,
            command=self._update_opacity_label,
            width=420,
        )
        self.opacity_scale.grid(row=row, column=0, sticky="ew", pady=(3, 4))
        row += 1
        tk.Label(
            frame,
            text="움직이는 즉시 달력 배경에 미리 적용됩니다. 글자와 체크 표시는 선명하게 유지됩니다.",
            background=WINDOW_BG,
            foreground=MUTED_TEXT,
            font=self.fonts.caption,
            anchor="w",
        ).grid(row=row, column=0, sticky="w", pady=(0, 24))
        self._update_opacity_label(str(self.opacity.get()))
        return row + 1

    def _build_ai_section(self, frame: tk.Frame, row: int) -> int:
        self._section(frame, "AI 요약").grid(row=row, column=0, sticky="w", pady=(4, 0))
        row += 1
        self._label(frame, "API 주소").grid(row=row, column=0, sticky="w", pady=(14, 0))
        row += 1
        self._entry(frame, self.base_url).grid(
            row=row, column=0, sticky="ew", pady=(7, 14), ipady=8
        )
        row += 1
        self._label(frame, "모델").grid(row=row, column=0, sticky="w")
        row += 1
        self._entry(frame, self.model).grid(
            row=row, column=0, sticky="ew", pady=(7, 12), ipady=8
        )
        row += 1
        tk.Label(
            frame,
            text="API 키는 환경변수에서 불러오며 저장하지 않습니다.",
            background=WINDOW_BG,
            foreground=MUTED_TEXT,
            font=self.fonts.caption,
        ).grid(row=row, column=0, sticky="w")
        return row + 1

    def _section(self, master: tk.Misc, text: str) -> tk.Label:
        return tk.Label(
            master,
            text=text,
            background=WINDOW_BG,
            foreground=TEXT,
            font=self.fonts.section,
        )

    def _label(self, master: tk.Misc, text: str) -> tk.Label:
        return tk.Label(
            master,
            text=text,
            background=WINDOW_BG,
            foreground=TEXT,
            font=self.fonts.dialog_body,
        )

    def _entry(self, master: tk.Misc, variable: tk.StringVar) -> tk.Entry:
        return tk.Entry(
            master,
            textvariable=variable,
            width=52,
            background=INPUT_FOCUS_BG,
            foreground=TEXT,
            insertbackground=TEXT,
            selectbackground="#3A3A3C",
            relief="flat",
            borderwidth=0,
            highlightthickness=0,
            font=self.fonts.dialog_body,
        )

    def _update_opacity_label(self, value: str) -> None:
        opacity = clamp_opacity(value)
        self.opacity_label.set(f"{round(opacity * 100)}%")
        if self.on_opacity_preview is not None:
            self.on_opacity_preview(opacity)

    def _selected_display_index(self) -> int:
        label = self.display_choice.get()
        for display in self.displays:
            if display.label == label:
                return display.index
        return 0

    def _save(self) -> None:
        self.settings.llm_base_url = self.base_url.get().strip().rstrip("/")
        self.settings.llm_model = self.model.get().strip()
        self.settings.desktop_display_index = self._selected_display_index()
        self.settings.window_opacity = clamp_opacity(self.opacity.get())
        self.store.save(self.settings)
        self._saved = True
        if self.on_saved is not None:
            self.on_saved()
        self.destroy()

    def _cancel(self) -> None:
        if not self._saved and self.on_opacity_preview is not None:
            self.on_opacity_preview(self.initial_opacity)
        self.destroy()
