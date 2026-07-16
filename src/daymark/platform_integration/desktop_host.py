from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class DesktopAttachResult:
    success: bool
    backend: str = "window"
    message: str = ""


class DesktopHost(Protocol):
    @property
    def supported(self) -> bool: ...

    @property
    def attached(self) -> bool: ...

    def attach(self, tk_window_id: int) -> DesktopAttachResult: ...

    def detach(self) -> DesktopAttachResult: ...

    def maintain(self, tk_window_id: int) -> DesktopAttachResult: ...


class UnsupportedDesktopHost:
    @property
    def supported(self) -> bool:
        return False

    @property
    def attached(self) -> bool:
        return False

    def attach(self, tk_window_id: int) -> DesktopAttachResult:
        del tk_window_id
        return DesktopAttachResult(False, message="Windows에서만 바탕화면 모드를 사용할 수 있습니다.")

    def detach(self) -> DesktopAttachResult:
        return DesktopAttachResult(True, message="일반 창 모드입니다.")

    def maintain(self, tk_window_id: int) -> DesktopAttachResult:
        del tk_window_id
        return DesktopAttachResult(True, message="일반 창 모드입니다.")


def create_desktop_host() -> DesktopHost:
    if os.name != "nt":
        return UnsupportedDesktopHost()
    from daymark.platform_integration.windows_desktop import WindowsDesktopHost

    return WindowsDesktopHost()
