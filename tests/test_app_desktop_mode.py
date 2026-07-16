from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from daymark.app import DaymarkApp
from daymark.platform_integration.desktop_host import DesktopAttachResult


class FakeDesktopHost:
    def __init__(self, *, attach_success: bool = True) -> None:
        self.attach_success = attach_success
        self.attach_calls = 0
        self.detach_calls = 0
        self.maintain_calls = 0
        self._attached = False

    @property
    def supported(self) -> bool:
        return True

    @property
    def attached(self) -> bool:
        return self._attached

    def attach(self, tk_window_id: int) -> DesktopAttachResult:
        del tk_window_id
        self.attach_calls += 1
        self._attached = self.attach_success
        return DesktopAttachResult(self.attach_success, "WorkerW", "test")

    def detach(self) -> DesktopAttachResult:
        self.detach_calls += 1
        self._attached = False
        return DesktopAttachResult(True, message="window")

    def maintain(self, tk_window_id: int) -> DesktopAttachResult:
        del tk_window_id
        self.maintain_calls += 1
        return DesktopAttachResult(self._attached, "WorkerW", "maintain")


class AppDesktopModeTest(unittest.TestCase):
    def test_toggle_persists_desktop_mode_and_restores_window_mode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            host = FakeDesktopHost()
            app = DaymarkApp(
                Path(directory), desktop_host=host, auto_desktop_mode=False
            )
            app._set_desktop_mode(True, notify=False)
            self.assertTrue(app.desktop_mode_active)
            self.assertTrue(app.settings.desktop_mode)
            self.assertEqual("창 모드", app.desktop_mode_label.get())
            self.assertEqual(1, host.attach_calls)

            app._set_desktop_mode(False, notify=False)
            self.assertFalse(app.desktop_mode_active)
            self.assertFalse(app.settings.desktop_mode)
            self.assertEqual("바탕화면", app.desktop_mode_label.get())
            self.assertEqual(1, host.detach_calls)
            app._close()

    def test_failed_attach_falls_back_and_disables_saved_mode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            host = FakeDesktopHost(attach_success=False)
            app = DaymarkApp(
                Path(directory), desktop_host=host, auto_desktop_mode=False
            )
            app._set_desktop_mode(True, notify=False)
            self.assertFalse(app.desktop_mode_active)
            self.assertFalse(app.settings.desktop_mode)
            self.assertEqual("바탕화면", app.desktop_mode_label.get())
            app._close()


if __name__ == "__main__":
    unittest.main()
