from __future__ import annotations

import tkinter as tk
from tkinter import ttk

from daymark.settings import AppSettings, SettingsStore


class SettingsDialog(tk.Toplevel):
    def __init__(self, master: tk.Misc, settings: AppSettings, store: SettingsStore) -> None:
        super().__init__(master)
        self.title("설정")
        self.resizable(False, False)
        self.settings = settings
        self.store = store
        self.base_url = tk.StringVar(value=settings.llm_base_url)
        self.model = tk.StringVar(value=settings.llm_model)
        frame = ttk.Frame(self, padding=16)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="OpenAI 호환 API 주소").grid(row=0, column=0, sticky="w")
        ttk.Entry(frame, textvariable=self.base_url, width=52).grid(row=1, column=0, pady=(3, 12))
        ttk.Label(frame, text="모델").grid(row=2, column=0, sticky="w")
        ttk.Entry(frame, textvariable=self.model, width=52).grid(row=3, column=0, pady=(3, 12))
        ttk.Label(
            frame,
            text="API 키는 저장하지 않습니다. OPENAI_API_KEY 환경변수를 사용합니다.",
        ).grid(row=4, column=0, sticky="w")
        ttk.Button(frame, text="저장", command=self._save).grid(row=5, column=0, sticky="e", pady=(14, 0))
        self.transient(master)
        self.grab_set()

    def _save(self) -> None:
        self.settings.llm_base_url = self.base_url.get().strip().rstrip("/")
        self.settings.llm_model = self.model.get().strip()
        self.store.save(self.settings)
        self.destroy()
