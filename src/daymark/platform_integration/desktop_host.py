from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class DisplayInfo:
    index: int
    name: str
    left: int
    top: int
    width: int
    height: int
    primary: bool = False

    @property
    def label(self) -> str:
        primary = " · 주 모니터" if self.primary else ""
        return f"{self.index + 1}번 모니터 · {self.width}×{self.height}{primary}"


@dataclass(frozen=True, slots=True)
class DesktopAttachResult:
    success: bool
    backend: str = "window"
    message: str = ""
    display_index: int = 0


class DesktopHost(Protocol):
    @property
    def supported(self) -> bool: ...

    @property
    def attached(self) -> bool: ...

    def displays(self) -> list[DisplayInfo]: ...

    def attach(
        self,
        tk_window_id: int,
        *,
        display_index: int = 0,
        opacity: float = 1.0,
    ) -> DesktopAttachResult: ...

    def detach(self) -> DesktopAttachResult: ...

    def maintain(
        self,
        tk_window_id: int,
        *,
        display_index: int = 0,
        opacity: float = 1.0,
    ) -> DesktopAttachResult: ...


class UnsupportedDesktopHost:
    @property
    def supported(self) -> bool:
        return False

    @property
    def attached(self) -> bool:
        return False

    def displays(self) -> list[DisplayInfo]:
        return []

    def attach(
        self,
        tk_window_id: int,
        *,
        display_index: int = 0,
        opacity: float = 1.0,
    ) -> DesktopAttachResult:
        del tk_window_id, display_index, opacity
        return DesktopAttachResult(False, message="Windows에서만 바탕화면 모드를 사용할 수 있습니다.")

    def detach(self) -> DesktopAttachResult:
        return DesktopAttachResult(True, message="일반 창 모드입니다.")

    def maintain(
        self,
        tk_window_id: int,
        *,
        display_index: int = 0,
        opacity: float = 1.0,
    ) -> DesktopAttachResult:
        del tk_window_id, display_index, opacity
        return DesktopAttachResult(True, message="일반 창 모드입니다.")


def create_desktop_host() -> DesktopHost:
    if os.name != "nt":
        return UnsupportedDesktopHost()
    from daymark.platform_integration.windows_desktop import WindowsDesktopHost

    return WindowsDesktopHost()
