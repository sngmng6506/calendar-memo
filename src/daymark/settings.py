from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

from daymark.theme import DEFAULT_WINDOW_OPACITY

DEFAULT_LLM_BASE_URL = "https://api.openai.com/v1"
DEFAULT_LLM_MODEL = "gpt-4.1-mini"


def default_desktop_mode() -> bool:
    return os.name == "nt"


def clamp_opacity(value: object) -> float:
    try:
        opacity = float(value)
    except (TypeError, ValueError):
        opacity = DEFAULT_WINDOW_OPACITY
    return min(1.0, max(0.55, opacity))


@dataclass(slots=True)
class AppSettings:
    llm_base_url: str = DEFAULT_LLM_BASE_URL
    llm_model: str = DEFAULT_LLM_MODEL
    desktop_mode: bool = field(default_factory=default_desktop_mode)
    desktop_display_index: int = 0
    window_opacity: float = DEFAULT_WINDOW_OPACITY

    @property
    def api_key(self) -> str:
        return os.environ.get("OPENAI_API_KEY", "")


class SettingsStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> AppSettings:
        if not self.path.exists():
            return AppSettings()
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return AppSettings(
                llm_base_url=str(data.get("llm_base_url", DEFAULT_LLM_BASE_URL)),
                llm_model=str(data.get("llm_model", DEFAULT_LLM_MODEL)),
                desktop_mode=bool(data.get("desktop_mode", default_desktop_mode())),
                desktop_display_index=max(0, int(data.get("desktop_display_index", 0))),
                window_opacity=clamp_opacity(
                    data.get("window_opacity", DEFAULT_WINDOW_OPACITY)
                ),
            )
        except (OSError, ValueError, TypeError):
            return AppSettings()

    def save(self, settings: AppSettings) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        settings.window_opacity = clamp_opacity(settings.window_opacity)
        settings.desktop_display_index = max(0, int(settings.desktop_display_index))
        self.path.write_text(
            json.dumps(asdict(settings), ensure_ascii=False, indent=2), encoding="utf-8"
        )
