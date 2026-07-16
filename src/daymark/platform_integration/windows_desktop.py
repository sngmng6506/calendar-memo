from __future__ import annotations

import ctypes
from ctypes import wintypes
from dataclasses import dataclass
from typing import Protocol

from daymark.platform_integration.desktop_host import DesktopAttachResult

# WorkerW 생성 메시지는 Windows Shell의 공개 API 계약이 아니다. 따라서 모든 실패는
# 일반 창 모드로 안전하게 폴백하고, Explorer 재시작 시 재탐색한다.
_SPAWN_WORKERW = 0x052C
_SMTO_NORMAL = 0x0000
_GA_ROOT = 2
_GWL_STYLE = -16
_GWL_EXSTYLE = -20
_WS_CHILD = 0x40000000
_WS_POPUP = 0x80000000
_WS_CAPTION = 0x00C00000
_WS_THICKFRAME = 0x00040000
_WS_MINIMIZEBOX = 0x00020000
_WS_MAXIMIZEBOX = 0x00010000
_WS_SYSMENU = 0x00080000
_SW_SHOW = 5
_SWP_NOSENDCHANGING = 0x0400
_SWP_NOSIZE = 0x0001
_SWP_NOMOVE = 0x0002
_SWP_NOACTIVATE = 0x0010
_SWP_SHOWWINDOW = 0x0040
_SWP_FRAMECHANGED = 0x0020
_HWND_TOP = 0


class WindowsApi(Protocol):
    def root_window(self, tk_window_id: int) -> int: ...

    def find_desktop_parent(self) -> tuple[int, str]: ...

    def is_window(self, hwnd: int) -> bool: ...

    def get_parent(self, hwnd: int) -> int: ...

    def get_style(self, hwnd: int) -> int: ...

    def get_ex_style(self, hwnd: int) -> int: ...

    def set_style(self, hwnd: int, style: int) -> None: ...

    def set_ex_style(self, hwnd: int, style: int) -> None: ...

    def set_parent(self, hwnd: int, parent: int) -> None: ...

    def fill_parent(self, hwnd: int, parent: int) -> None: ...

    def refresh_frame(self, hwnd: int) -> None: ...

    def show(self, hwnd: int) -> None: ...


class NativeWindowsApi:
    def __init__(self) -> None:
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        self._long_ptr = ctypes.c_ssize_t
        self._configure_signatures()

    def _configure_signatures(self) -> None:
        user32 = self.user32
        user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
        user32.FindWindowW.restype = wintypes.HWND
        user32.FindWindowExW.argtypes = [wintypes.HWND, wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR]
        user32.FindWindowExW.restype = wintypes.HWND
        user32.SendMessageTimeoutW.argtypes = [
            wintypes.HWND,
            wintypes.UINT,
            wintypes.WPARAM,
            wintypes.LPARAM,
            wintypes.UINT,
            wintypes.UINT,
            ctypes.POINTER(ctypes.c_size_t),
        ]
        user32.SendMessageTimeoutW.restype = wintypes.LPARAM
        self._enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        user32.EnumWindows.argtypes = [self._enum_proc_type, wintypes.LPARAM]
        user32.EnumWindows.restype = wintypes.BOOL
        user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
        user32.GetAncestor.restype = wintypes.HWND
        user32.IsWindow.argtypes = [wintypes.HWND]
        user32.IsWindow.restype = wintypes.BOOL
        user32.GetParent.argtypes = [wintypes.HWND]
        user32.GetParent.restype = wintypes.HWND
        user32.SetParent.argtypes = [wintypes.HWND, wintypes.HWND]
        user32.SetParent.restype = wintypes.HWND
        user32.GetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int]
        user32.GetWindowLongPtrW.restype = self._long_ptr
        user32.SetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int, self._long_ptr]
        user32.SetWindowLongPtrW.restype = self._long_ptr
        user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        user32.GetClientRect.restype = wintypes.BOOL
        user32.SetWindowPos.argtypes = [
            wintypes.HWND,
            wintypes.HWND,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            wintypes.UINT,
        ]
        user32.SetWindowPos.restype = wintypes.BOOL
        user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
        user32.ShowWindow.restype = wintypes.BOOL

    @staticmethod
    def _raise_last_error(operation: str) -> None:
        error = ctypes.get_last_error()
        if error:
            raise OSError(error, f"{operation} failed")
        raise OSError(f"{operation} failed")

    def root_window(self, tk_window_id: int) -> int:
        root = int(self.user32.GetAncestor(wintypes.HWND(tk_window_id), _GA_ROOT) or 0)
        return root or int(tk_window_id)

    def find_desktop_parent(self) -> tuple[int, str]:
        progman = int(self.user32.FindWindowW("Progman", None) or 0)
        if not progman:
            return 0, ""

        result = ctypes.c_size_t()
        self.user32.SendMessageTimeoutW(
            wintypes.HWND(progman),
            _SPAWN_WORKERW,
            0,
            0,
            _SMTO_NORMAL,
            1000,
            ctypes.byref(result),
        )

        desktop_parent = 0

        @self._enum_proc_type
        def enum_windows(hwnd: wintypes.HWND, lparam: wintypes.LPARAM) -> wintypes.BOOL:
            del lparam
            nonlocal desktop_parent
            def_view = self.user32.FindWindowExW(hwnd, None, "SHELLDLL_DefView", None)
            if def_view:
                sibling = self.user32.FindWindowExW(None, wintypes.HWND(hwnd), "WorkerW", None)
                if sibling:
                    desktop_parent = int(sibling)
                    return False
            return True

        self.user32.EnumWindows(enum_windows, 0)
        if desktop_parent:
            return desktop_parent, "WorkerW"

        # 일부 Explorer 구성에서는 DefView가 Progman 바로 아래에 있다. 이 경우
        # Progman을 폴백 부모로 사용한다.
        def_view = self.user32.FindWindowExW(wintypes.HWND(progman), None, "SHELLDLL_DefView", None)
        if def_view:
            return progman, "Progman"
        return 0, ""

    def is_window(self, hwnd: int) -> bool:
        return bool(hwnd and self.user32.IsWindow(wintypes.HWND(hwnd)))

    def get_parent(self, hwnd: int) -> int:
        return int(self.user32.GetParent(wintypes.HWND(hwnd)) or 0)

    def _get_long_ptr(self, hwnd: int, index: int) -> int:
        ctypes.set_last_error(0)
        value = int(self.user32.GetWindowLongPtrW(wintypes.HWND(hwnd), index))
        if value == 0 and ctypes.get_last_error():
            self._raise_last_error("GetWindowLongPtrW")
        return value

    @staticmethod
    def _unsigned_window_long(value: int) -> int:
        return value & 0xFFFFFFFF

    def get_style(self, hwnd: int) -> int:
        return self._unsigned_window_long(self._get_long_ptr(hwnd, _GWL_STYLE))

    def get_ex_style(self, hwnd: int) -> int:
        return self._unsigned_window_long(self._get_long_ptr(hwnd, _GWL_EXSTYLE))

    def _set_long_ptr(self, hwnd: int, index: int, value: int) -> None:
        ctypes.set_last_error(0)
        bit_count = ctypes.sizeof(self._long_ptr) * 8
        signed_value = value
        if value >= 1 << (bit_count - 1):
            signed_value = value - (1 << bit_count)
        previous = int(
            self.user32.SetWindowLongPtrW(
                wintypes.HWND(hwnd), index, self._long_ptr(signed_value)
            )
        )
        if previous == 0 and ctypes.get_last_error():
            self._raise_last_error("SetWindowLongPtrW")

    def set_style(self, hwnd: int, style: int) -> None:
        self._set_long_ptr(hwnd, _GWL_STYLE, style)

    def set_ex_style(self, hwnd: int, style: int) -> None:
        self._set_long_ptr(hwnd, _GWL_EXSTYLE, style)

    def set_parent(self, hwnd: int, parent: int) -> None:
        ctypes.set_last_error(0)
        previous = self.user32.SetParent(wintypes.HWND(hwnd), wintypes.HWND(parent))
        if not previous and ctypes.get_last_error():
            self._raise_last_error("SetParent")

    def fill_parent(self, hwnd: int, parent: int) -> None:
        rect = wintypes.RECT()
        if not self.user32.GetClientRect(wintypes.HWND(parent), ctypes.byref(rect)):
            self._raise_last_error("GetClientRect")
        width = max(1, rect.right - rect.left)
        height = max(1, rect.bottom - rect.top)
        flags = _SWP_NOACTIVATE | _SWP_SHOWWINDOW | _SWP_NOSENDCHANGING
        if not self.user32.SetWindowPos(
            wintypes.HWND(hwnd),
            wintypes.HWND(_HWND_TOP),
            0,
            0,
            width,
            height,
            flags,
        ):
            self._raise_last_error("SetWindowPos")

    def refresh_frame(self, hwnd: int) -> None:
        flags = (
            _SWP_NOACTIVATE
            | _SWP_FRAMECHANGED
            | _SWP_NOSENDCHANGING
            | _SWP_NOSIZE
            | _SWP_NOMOVE
        )
        if not self.user32.SetWindowPos(
            wintypes.HWND(hwnd), wintypes.HWND(_HWND_TOP), 0, 0, 0, 0, flags
        ):
            self._raise_last_error("SetWindowPos")

    def show(self, hwnd: int) -> None:
        self.user32.ShowWindow(wintypes.HWND(hwnd), _SW_SHOW)


@dataclass(slots=True)
class _OriginalWindowState:
    parent: int
    style: int
    ex_style: int


class WindowsDesktopHost:
    def __init__(self, api: WindowsApi | None = None) -> None:
        self.api = api or NativeWindowsApi()
        self._window_handle = 0
        self._parent_handle = 0
        self._backend = ""
        self._original: _OriginalWindowState | None = None

    @property
    def supported(self) -> bool:
        return True

    @property
    def attached(self) -> bool:
        return bool(
            self._window_handle
            and self._parent_handle
            and self.api.is_window(self._window_handle)
            and self.api.is_window(self._parent_handle)
            and self.api.get_parent(self._window_handle) == self._parent_handle
        )

    @staticmethod
    def _desktop_style(style: int) -> int:
        removable = (
            _WS_POPUP
            | _WS_CAPTION
            | _WS_THICKFRAME
            | _WS_MINIMIZEBOX
            | _WS_MAXIMIZEBOX
            | _WS_SYSMENU
        )
        return (style & ~removable) | _WS_CHILD

    def attach(self, tk_window_id: int) -> DesktopAttachResult:
        try:
            hwnd = self.api.root_window(tk_window_id)
            if not self.api.is_window(hwnd):
                return DesktopAttachResult(False, message="Daymark 창 핸들을 찾지 못했습니다.")
            parent, backend = self.api.find_desktop_parent()
            if not parent or not self.api.is_window(parent):
                return DesktopAttachResult(
                    False,
                    message="Explorer 바탕화면 레이어를 찾지 못했습니다. 일반 창 모드를 유지합니다.",
                )

            if self._original is None or self._window_handle != hwnd:
                self._original = _OriginalWindowState(
                    parent=self.api.get_parent(hwnd),
                    style=self.api.get_style(hwnd),
                    ex_style=self.api.get_ex_style(hwnd),
                )
            self._window_handle = hwnd
            self.api.set_style(hwnd, self._desktop_style(self.api.get_style(hwnd)))
            self.api.set_parent(hwnd, parent)
            self.api.refresh_frame(hwnd)
            self.api.fill_parent(hwnd, parent)
            self.api.show(hwnd)
            self._parent_handle = parent
            self._backend = backend
            return DesktopAttachResult(True, backend=backend, message=f"{backend} 바탕화면 모드")
        except OSError as error:
            self._restore_original_best_effort()
            self._parent_handle = 0
            self._backend = ""
            return DesktopAttachResult(False, message=f"바탕화면 연결 실패: {error}")

    def _restore_original_best_effort(self) -> None:
        if not self._window_handle or self._original is None:
            return
        try:
            self.api.set_parent(self._window_handle, self._original.parent)
            self.api.set_style(self._window_handle, self._original.style)
            self.api.set_ex_style(self._window_handle, self._original.ex_style)
            self.api.refresh_frame(self._window_handle)
            self.api.show(self._window_handle)
        except OSError:
            pass

    def detach(self) -> DesktopAttachResult:
        if not self._window_handle or self._original is None:
            self._parent_handle = 0
            self._backend = ""
            return DesktopAttachResult(True, message="일반 창 모드")
        try:
            hwnd = self._window_handle
            self.api.set_parent(hwnd, self._original.parent)
            self.api.set_style(hwnd, self._original.style)
            self.api.set_ex_style(hwnd, self._original.ex_style)
            self.api.refresh_frame(hwnd)
            self.api.show(hwnd)
            self._parent_handle = 0
            self._backend = ""
            return DesktopAttachResult(True, message="일반 창 모드")
        except OSError as error:
            return DesktopAttachResult(False, message=f"창 모드 복원 실패: {error}")

    def maintain(self, tk_window_id: int) -> DesktopAttachResult:
        if self.attached:
            try:
                self.api.fill_parent(self._window_handle, self._parent_handle)
                return DesktopAttachResult(True, backend=self._backend, message="바탕화면 연결 유지")
            except OSError:
                pass
        # Explorer가 재시작되거나 WorkerW가 교체된 경우 다시 탐색한다.
        self._parent_handle = 0
        return self.attach(tk_window_id)
