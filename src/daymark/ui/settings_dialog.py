from __future__ import annotations

import tkinter as tk

from daymark.settings import AppSettings, SettingsStore
from daymark.theme import INPUT_FOCUS_BG, MUTED_TEXT, TEXT, WINDOW_BG, flat_button_options


class SettingsDialog(tk.Toplevel):
    def __init__(self, master: tk.Misc, settings: AppSettings, store: SettingsStore) -> None:
        super().__init__(master)
        self.title("설정")
        self.resizable(False, False)
        self.configure(background=WINDOW_BG)
        self.settings = settings
        self.store = store
        self.base_url = tk.StringVar(value=settings.llm_base_url)
        self.model = tk.StringVar(value=settings.llm_model)
        frame = tk.Frame(self, background=WINDOW_BG, padx=18, pady=18)
        frame.pack(fill="both", expand=True)
        self._label(frame, "OpenAI 호환 API 주소").grid(row=0, column=0, sticky="w")
        self._entry(frame, self.base_url).grid(row=1, column=0, sticky="ew", pady=(5, 14))
        self._label(frame, "모델").grid(row=2, column=0, sticky="w")
        self._entry(frame, self.model).grid(row=3, column=0, sticky="ew", pady=(5, 14))
        tk.Label(
            frame,
            text="API 키는 저장하지 않습니다. OPENAI_API_KEY 환경변수를 사용합니다.",
            background=WINDOW_BG,
            foreground=MUTED_TEXT,
        ).grid(row=4, column=0, sticky="w")
        tk.Button(frame, text="저장", command=self._save, **flat_button_options(compact=True)).grid(
            row=5, column=0, sticky="e", pady=(16, 0)
        )
        self.transient(master)
        self.grab_set()

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

    def _save(self) -> None:
        self.settings.llm_base_url = self.base_url.get().strip().rstrip("/")
        self.settings.llm_model = self.model.get().strip()
        self.store.save(self.settings)
        self.destroy()
