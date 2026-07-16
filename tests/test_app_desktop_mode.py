from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from daymark.app import DaymarkApp
from daymark.platform_integration.desktop_host import DesktopAttachResult, DisplayInfo


class FakeDesktopHost:
    def __init__(self, *, attach_success: bool = True) -> None:
        self.attach_success = attach_success
        self.attach_calls = 0
        self.detach_calls = 0
        self.maintain_calls = 0
        self._attached = False
        self.last_display_index = -1
        self.last_opacity: float | None = -1.0
        self.current_window_display = 0
        self._displays = [
            DisplayInfo(0, "PRIMARY", 0, 0, 1920, 1080, True),
            DisplayInfo(1, "SECONDARY", 1920, 0, 1920, 1080, False),
        ]

    @property
    def supported(self) -> bool:
        return True

    @property
    def attached(self) -> bool:
        return self._attached

    def displays(self) -> list[DisplayInfo]:
        return list(self._displays)

    def current_display_index(self, tk_window_id: int) -> int | None:
        del tk_window_id
        return self.current_window_display

    def attach(
        self,
        tk_window_id: int,
        *,
        display_index: int = 0,
        opacity: float | None = 1.0,
    ) -> DesktopAttachResult:
        del tk_window_id
        self.attach_calls += 1
        self.last_display_index = display_index
        self.last_opacity = opacity
        self._attached = self.attach_success
        return DesktopAttachResult(
            self.attach_success,
            "WorkerW",
            "test",
            display_index=display_index,
        )

    def detach(self) -> DesktopAttachResult:
        self.detach_calls += 1
        self._attached = False
        return DesktopAttachResult(True, message="window")

    def maintain(
        self,
        tk_window_id: int,
        *,
        display_index: int = 0,
        opacity: float | None = 1.0,
    ) -> DesktopAttachResult:
        del tk_window_id
        self.maintain_calls += 1
        self.last_display_index = display_index
        self.last_opacity = opacity
        return DesktopAttachResult(
            self._attached,
            "WorkerW",
            "maintain",
            display_index=display_index,
        )


class AppDesktopModeTest(unittest.TestCase):
    def test_toggle_passes_saved_monitor_and_opacity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            host = FakeDesktopHost()
            app = DaymarkApp(Path(directory), desktop_host=host, auto_desktop_mode=False)
            app.settings.desktop_display_index = 1
            app.settings.window_opacity = 0.83
            app.settings_store.save(app.settings)
            app.window_opacity = 1.0

            app._set_desktop_mode(True, notify=False)

            self.assertTrue(app.desktop_mode_active)
            self.assertTrue(app.settings.desktop_mode)
            self.assertEqual("창 모드", app.desktop_mode_label.get())
            self.assertEqual(1, host.last_display_index)
            self.assertEqual(0.83, host.last_opacity)
            self.assertEqual(1, host.attach_calls)

            app._set_desktop_mode(False, notify=False)
            self.assertFalse(app.desktop_mode_active)
            self.assertFalse(app.settings.desktop_mode)
            self.assertEqual("바탕화면", app.desktop_mode_label.get())
            self.assertEqual(1, host.detach_calls)
            app._close()

    def test_user_toggle_uses_monitor_containing_window(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            host = FakeDesktopHost()
            host.current_window_display = 1
            app = DaymarkApp(Path(directory), desktop_host=host, auto_desktop_mode=False)
            app.settings.desktop_display_index = 0

            app._toggle_desktop_mode()

            self.assertTrue(app.desktop_mode_active)
            self.assertEqual(1, host.last_display_index)
            self.assertEqual(1, app.settings.desktop_display_index)
            app._close()

    def test_settings_change_repositions_active_desktop(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            host = FakeDesktopHost()
            app = DaymarkApp(Path(directory), desktop_host=host, auto_desktop_mode=False)
            app._set_desktop_mode(True, notify=False)
            app.settings.desktop_display_index = 1
            app.settings.window_opacity = 0.84

            app._apply_saved_visual_settings()

            self.assertEqual(1, host.maintain_calls)
            self.assertEqual(1, host.last_display_index)
            self.assertEqual(0.84, host.last_opacity)
            app._close()

    def test_failed_attach_falls_back_and_disables_saved_mode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            host = FakeDesktopHost(attach_success=False)
            app = DaymarkApp(Path(directory), desktop_host=host, auto_desktop_mode=False)
            app._set_desktop_mode(True, notify=False)
            self.assertFalse(app.desktop_mode_active)
            self.assertFalse(app.settings.desktop_mode)
            self.assertEqual("바탕화면", app.desktop_mode_label.get())
            app._close()

    def test_split_surface_keeps_foreground_opaque_and_previews_backdrop(self) -> None:
        import tkinter as tk

        with tempfile.TemporaryDirectory() as directory:
            foreground = FakeDesktopHost()
            backdrop_host = FakeDesktopHost()
            app = DaymarkApp(
                Path(directory),
                desktop_host=foreground,
                backdrop_host=backdrop_host,
                auto_desktop_mode=False,
            )
            app.split_surface_enabled = True
            app.backdrop = tk.Toplevel(app)
            app.backdrop.withdraw()
            app.settings.window_opacity = 0.88
            app.settings_store.save(app.settings)

            app._set_desktop_mode(True, notify=False)

            self.assertIsNone(foreground.last_opacity)
            self.assertEqual(0.88, backdrop_host.last_opacity)

            app._preview_opacity(0.81)
            self.assertIsNone(foreground.last_opacity)
            self.assertEqual(0.81, backdrop_host.last_opacity)
            app._close()

    def test_backdrop_attach_failure_detaches_successful_foreground(self) -> None:
        import tkinter as tk

        with tempfile.TemporaryDirectory() as directory:
            foreground = FakeDesktopHost(attach_success=True)
            backdrop_host = FakeDesktopHost(attach_success=False)
            app = DaymarkApp(
                Path(directory),
                desktop_host=foreground,
                backdrop_host=backdrop_host,
                auto_desktop_mode=False,
            )
            app.split_surface_enabled = True
            app.backdrop = tk.Toplevel(app)
            app.backdrop.withdraw()

            app._set_desktop_mode(True, notify=False)

            self.assertFalse(app.desktop_mode_active)
            self.assertFalse(foreground.attached)
            self.assertGreaterEqual(foreground.detach_calls, 1)
            app._close()

    def test_maintenance_failure_detaches_both_surfaces(self) -> None:
        import tkinter as tk

        with tempfile.TemporaryDirectory() as directory:
            foreground = FakeDesktopHost()
            backdrop_host = FakeDesktopHost()
            app = DaymarkApp(
                Path(directory),
                desktop_host=foreground,
                backdrop_host=backdrop_host,
                auto_desktop_mode=False,
            )
            app.split_surface_enabled = True
            app.backdrop = tk.Toplevel(app)
            app.backdrop.withdraw()
            app._set_desktop_mode(True, notify=False)
            app._cancel_desktop_maintenance()
            backdrop_host._attached = False

            app._maintain_desktop_mode()

            self.assertFalse(app.desktop_mode_active)
            self.assertFalse(foreground.attached)
            self.assertFalse(backdrop_host.attached)
            app._close()


if __name__ == "__main__":
    unittest.main()
