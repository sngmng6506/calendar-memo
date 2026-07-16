from pathlib import Path
import os
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from datetime import date

from daymark.app import DaymarkApp
from daymark.theme import WINDOW_BG
from daymark.services.llm_client import OpenAICompatibleClient
from daymark.ui.report_dialog import ReportDialog
from daymark.ui.settings_dialog import SettingsDialog


class GuiSmokeTest(unittest.TestCase):
    def test_application_can_render_and_close(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            app.update_idletasks()
            self.assertIn("Daymark", app.title())
            visible_cells = [
                widget
                for widget in app.calendar_frame.grid_slaves()
                if int(widget.grid_info()["row"]) > 0
            ]
            expected_weeks = len({widget.grid_info()["row"] for widget in visible_cells})
            self.assertEqual(6, expected_weeks)
            self.assertEqual(42, sum(1 for widget in visible_cells if hasattr(widget, "task_date")))
            app._close()

    def test_dialogs_can_render_with_minimal_theme(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            report = ReportDialog(app, app.repository, app.settings, date.today())
            settings = SettingsDialog(app, app.settings, app.settings_store)
            app.update_idletasks()
            self.assertEqual(WINDOW_BG, report.cget("background"))
            self.assertEqual(WINDOW_BG, settings.cget("background"))
            self.assertEqual("AI 요약", report.title())
            settings.destroy()
            report.destroy()
            app._close()

    def test_report_busy_state_disables_primary_controls(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            report = ReportDialog(app, app.repository, app.settings, date.today())
            report._set_busy(True)
            self.assertEqual("disabled", report.generate_button.cget("state"))
            self.assertEqual("생성 중…", report.generate_button.cget("text"))
            self.assertEqual("disabled", report.preview_button.cget("state"))
            self.assertEqual("disabled", report.copy_button.cget("state"))
            report._set_busy(False)
            self.assertEqual("normal", report.generate_button.cget("state"))
            report.destroy()
            app._close()

    def test_settings_opacity_slider_previews_and_cancel_restores(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            previews: list[float] = []
            dialog = SettingsDialog(
                app,
                app.settings,
                app.settings_store,
                on_opacity_preview=previews.append,
            )
            dialog.opacity.set(0.82)
            dialog._update_opacity_label("0.82")
            app.update_idletasks()
            self.assertAlmostEqual(0.82, previews[-1], places=2)
            dialog._cancel()
            self.assertAlmostEqual(app.settings.window_opacity, previews[-1], places=2)
            app._close()

    def test_unexpected_ai_error_restores_controls(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory, patch.dict(
            os.environ, {"OPENAI_API_KEY": "test"}
        ), patch.object(
            OpenAICompatibleClient, "generate", side_effect=ValueError("bad endpoint")
        ), patch("tkinter.messagebox.showerror"):
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            report = ReportDialog(app, app.repository, app.settings, date.today())
            report._generate()
            deadline = time.monotonic() + 2
            while report._generation_active and time.monotonic() < deadline:
                app.update()
                time.sleep(0.02)
            self.assertFalse(report._generation_active)
            self.assertEqual("normal", report.generate_button.cget("state"))
            self.assertEqual("보고서 생성에 실패했습니다.", report.status.get())
            report.destroy()
            app._close()

    def test_closing_report_while_generating_has_no_tk_or_thread_error(self) -> None:
        thread_errors: list[BaseException] = []
        callback_errors: list[BaseException] = []
        previous_hook = threading.excepthook
        threading.excepthook = lambda args: thread_errors.append(args.exc_value)
        try:
            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory, patch.dict(
                os.environ, {"OPENAI_API_KEY": "test"}
            ), patch.object(
                OpenAICompatibleClient,
                "generate",
                side_effect=lambda *_args, **_kwargs: (time.sleep(0.1) or "ok"),
            ):
                app = DaymarkApp(Path(directory), auto_desktop_mode=False)
                app.report_callback_exception = (
                    lambda _exc_type, exc_value, _traceback: callback_errors.append(exc_value)
                )
                report = ReportDialog(app, app.repository, app.settings, date.today())
                report._generate()
                report._close_dialog()
                deadline = time.monotonic() + 0.3
                while time.monotonic() < deadline:
                    app.update()
                    time.sleep(0.01)
                self.assertEqual([], callback_errors)
                self.assertEqual([], thread_errors)
                app._close()
        finally:
            threading.excepthook = previous_hook


if __name__ == "__main__":
    unittest.main()
