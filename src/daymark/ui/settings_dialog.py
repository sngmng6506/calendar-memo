from __future__ import annotations

import tkinter as tk
from collections.abc import Callable
from tkinter import ttk

from daymark.platform_integration import DisplayInfo
from daymark.settings import AppSettings, SettingsStore, clamp_opacity
from daymark.theme import INPUT_FOCUS_BG, MUTED_TEXT, TEXT, WINDOW_BG, flat_button_options


class SettingsDialog(tk.Toplevel):
    def __init__(
        self,
        master: tk.Misc,
        settings: AppSettings,
        store: SettingsStore,
        *,
        displays: list[DisplayInfo] | None = None,
        on_saved: Callable[[], None] | None = None,
    ) -> None:
        super().__init__(master)
        self.title("설정")
        self.resizable(False, False)
        self.configure(background=WINDOW_BG)
        self.settings = settings
        self.store = store
        self.displays = displays or []
        self.on_saved = on_saved
        self.base_url = tk.StringVar(value=settings.llm_base_url)
        self.model = tk.StringVar(value=settings.llm_model)
        self.display_choice = tk.StringVar()
        self.opacity = tk.DoubleVar(value=clamp_opacity(settings.window_opacity))
        self.opacity_label = tk.StringVar()

        frame = tk.Frame(self, background=WINDOW_BG, padx=20, pady=18)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(0, weight=1)

        self._section(frame, "화면").grid(row=0, column=0, sticky="w")
        self._label(frame, "바탕화면 표시 모니터").grid(row=1, column=0, sticky="w", pady=(10, 0))
        labels = [display.label for display in self.displays]
        if not labels:
            labels = ["주 모니터"]
        selected = next(
            (
                display.label
                for display in self.displays
                if display.index == settings.desktop_display_index
            ),
            labels[0],
        )
        self.display_choice.set(selected)
        self.display_combo = ttk.Combobox(
            frame,
            textvariable=self.display_choice,
            values=labels,
            state="readonly",
            width=48,
        )
        self.display_combo.grid(row=2, column=0, sticky="ew", pady=(5, 12))

        opacity_header = tk.Frame(frame, background=WINDOW_BG)
        opacity_header.grid(row=3, column=0, sticky="ew")
        self._label(opacity_header, "투명도").pack(side="left")
        tk.Label(
            opacity_header,
            textvariable=self.opacity_label,
            background=WINDOW_BG,
            foreground=MUTED_TEXT,
        ).pack(side="right")
        self.opacity_scale = tk.Scale(
            frame,
            variable=self.opacity,
            from_=0.55,
            to=1.0,
            resolution=0.01,
            orient="horizontal",
            showvalue=False,
            command=self._update_opacity_label,
            background=WINDOW_BG,
            foreground=TEXT,
            troughcolor=INPUT_FOCUS_BG,
            activebackground=TEXT,
            highlightthickness=0,
            borderwidth=0,
            relief="flat",
            length=360,
        )
        self.opacity_scale.grid(row=4, column=0, sticky="ew", pady=(2, 16))
        self._update_opacity_label(str(self.opacity.get()))

        self._section(frame, "AI 보고서").grid(row=5, column=0, sticky="w", pady=(4, 0))
        self._label(frame, "OpenAI 호환 API 주소").grid(row=6, column=0, sticky="w", pady=(10, 0))
        self._entry(frame, self.base_url).grid(row=7, column=0, sticky="ew", pady=(5, 12))
        self._label(frame, "모델").grid(row=8, column=0, sticky="w")
        self._entry(frame, self.model).grid(row=9, column=0, sticky="ew", pady=(5, 12))
        tk.Label(
            frame,
            text="API 키는 저장하지 않습니다. OPENAI_API_KEY 환경변수를 사용합니다.",
            background=WINDOW_BG,
            foreground=MUTED_TEXT,
        ).grid(row=10, column=0, sticky="w")
        tk.Button(frame, text="저장", command=self._save, **flat_button_options(compact=True)).grid(
            row=11, column=0, sticky="e", pady=(18, 0)
        )
        self.transient(master)
        self.grab_set()

    @staticmethod
    def _section(master: tk.Misc, text: str) -> tk.Label:
        return tk.Label(
            master,
            text=text,
            background=WINDOW_BG,
            foreground=TEXT,
            font=("TkDefaultFont", 11, "bold"),
        )

    @staticmethod
    def _label(master: tk.Misc, text: str) -> tk.Label:
        return tk.Label(master, text=text, background=WINDOW_BG, foreground=TEXT)

    @staticmethod
    def _entry(master: tk.Misc, variable: tk.StringVar) -> tk.Entry:
        return tk.Entry(
            master,
            textvariable=variable,
            width=52,
            background=INPUT_FOCUS_BG,
            foreground=TEXT,
            insertbackground=TEXT,
            relief="flat",
            borderwidth=0,
            highlightthickness=0,
        )

    def _update_opacity_label(self, value: str) -> None:
        opacity = clamp_opacity(value)
        self.opacity_label.set(f"{round(opacity * 100)}%")

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
        if self.on_saved is not None:
            self.on_saved()
        self.destroy()
