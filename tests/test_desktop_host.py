from __future__ import annotations

import unittest

from daymark.platform_integration.desktop_host import DisplayInfo, UnsupportedDesktopHost
from daymark.platform_integration.windows_desktop import (
    WindowsDesktopHost,
    _WS_CAPTION,
    _WS_CHILD,
    _WS_EX_LAYERED,
    _WS_POPUP,
)


class FakeWindowsApi:
    def __init__(self) -> None:
        self.root = 100
        self.desktop_parent = 200
        self.backend = "WorkerW"
        self.valid = {100, 200}
        self.parents = {100: 0}
        self.styles = {100: _WS_POPUP | _WS_CAPTION | 0x10000000}
        self.ex_styles = {100: 0x00040000}
        self.monitors = [
            DisplayInfo(0, "PRIMARY", 0, 0, 1920, 1080, True),
            DisplayInfo(1, "SECONDARY", 1920, 0, 2560, 1440, False),
        ]
        self.position_calls: list[tuple[int, int, DisplayInfo]] = []
        self.opacity_calls: list[tuple[int, float]] = []
        self.refresh_calls: list[int] = []
        self.show_calls: list[int] = []
        self.fail_position = False

    def root_window(self, tk_window_id: int) -> int:
        self.last_tk_window_id = tk_window_id
        return self.root

    def find_desktop_parent(self) -> tuple[int, str]:
        return self.desktop_parent, self.backend

    def displays(self) -> list[DisplayInfo]:
        return list(self.monitors)

    def is_window(self, hwnd: int) -> bool:
        return hwnd in self.valid

    def get_parent(self, hwnd: int) -> int:
        return self.parents.get(hwnd, 0)

    def get_style(self, hwnd: int) -> int:
        return self.styles[hwnd]

    def get_ex_style(self, hwnd: int) -> int:
        return self.ex_styles[hwnd]

    def set_style(self, hwnd: int, style: int) -> None:
        self.styles[hwnd] = style

    def set_ex_style(self, hwnd: int, style: int) -> None:
        self.ex_styles[hwnd] = style

    def set_parent(self, hwnd: int, parent: int) -> None:
        self.parents[hwnd] = parent

    def position_on_display(self, hwnd: int, parent: int, display: DisplayInfo) -> None:
        if self.fail_position:
            raise OSError("resize failed")
        self.position_calls.append((hwnd, parent, display))

    def apply_opacity(self, hwnd: int, opacity: float) -> None:
        self.opacity_calls.append((hwnd, opacity))

    def refresh_frame(self, hwnd: int) -> None:
        self.refresh_calls.append(hwnd)

    def show(self, hwnd: int) -> None:
        self.show_calls.append(hwnd)


class WindowsDesktopHostTest(unittest.TestCase):
    def test_attach_uses_only_selected_monitor_and_restores_on_detach(self) -> None:
        api = FakeWindowsApi()
        original_style = api.styles[100]
        original_ex_style = api.ex_styles[100]
        host = WindowsDesktopHost(api)

        result = host.attach(77, display_index=1, opacity=0.72)

        self.assertTrue(result.success)
        self.assertEqual("WorkerW", result.backend)
        self.assertEqual(1, result.display_index)
        self.assertTrue(host.attached)
        self.assertEqual(200, api.parents[100])
        self.assertTrue(api.styles[100] & _WS_CHILD)
        self.assertTrue(api.styles[100] & 0x10000000)
        self.assertFalse(api.styles[100] & _WS_POPUP)
        self.assertFalse(api.styles[100] & _WS_CAPTION)
        self.assertTrue(api.ex_styles[100] & _WS_EX_LAYERED)
        self.assertEqual((100, 200, api.monitors[1]), api.position_calls[-1])
        self.assertEqual((100, 0.72), api.opacity_calls[-1])

        detached = host.detach()

        self.assertTrue(detached.success)
        self.assertFalse(host.attached)
        self.assertEqual(0, api.parents[100])
        self.assertEqual(original_style, api.styles[100])
        self.assertEqual(original_ex_style, api.ex_styles[100])

    def test_invalid_monitor_index_falls_back_to_primary(self) -> None:
        api = FakeWindowsApi()
        host = WindowsDesktopHost(api)

        result = host.attach(77, display_index=99, opacity=0.86)

        self.assertTrue(result.success)
        self.assertEqual(0, result.display_index)
        self.assertEqual(api.monitors[0], api.position_calls[-1][2])

    def test_maintain_repositions_and_reapplies_opacity(self) -> None:
        api = FakeWindowsApi()
        host = WindowsDesktopHost(api)
        self.assertTrue(host.attach(77).success)

        result = host.maintain(77, display_index=1, opacity=0.61)

        self.assertTrue(result.success)
        self.assertEqual(1, result.display_index)
        self.assertEqual(api.monitors[1], api.position_calls[-1][2])
        self.assertEqual((100, 0.61), api.opacity_calls[-1])

    def test_maintain_reconnects_after_explorer_replaces_workerw(self) -> None:
        api = FakeWindowsApi()
        host = WindowsDesktopHost(api)
        self.assertTrue(host.attach(77, display_index=1, opacity=0.75).success)

        api.valid.remove(200)
        api.desktop_parent = 300
        api.valid.add(300)

        result = host.maintain(77, display_index=1, opacity=0.75)

        self.assertTrue(result.success)
        self.assertEqual(300, api.parents[100])
        self.assertEqual((100, 300, api.monitors[1]), api.position_calls[-1])

    def test_partial_attach_failure_rolls_back_window_state(self) -> None:
        api = FakeWindowsApi()
        original_style = api.styles[100]
        original_ex_style = api.ex_styles[100]
        api.fail_position = True
        host = WindowsDesktopHost(api)

        result = host.attach(77)

        self.assertFalse(result.success)
        self.assertEqual(0, api.parents[100])
        self.assertEqual(original_style, api.styles[100])
        self.assertEqual(original_ex_style, api.ex_styles[100])

    def test_missing_explorer_parent_fails_without_mutation(self) -> None:
        api = FakeWindowsApi()
        original_style = api.styles[100]
        api.desktop_parent = 0
        host = WindowsDesktopHost(api)

        result = host.attach(77)

        self.assertFalse(result.success)
        self.assertEqual(original_style, api.styles[100])
        self.assertEqual(0, api.parents[100])


class UnsupportedDesktopHostTest(unittest.TestCase):
    def test_non_windows_host_is_safe_noop(self) -> None:
        host = UnsupportedDesktopHost()
        self.assertFalse(host.supported)
        self.assertEqual([], host.displays())
        self.assertFalse(host.attach(1).success)
        self.assertTrue(host.detach().success)
        self.assertTrue(host.maintain(1).success)


if __name__ == "__main__":
    unittest.main()
