from pathlib import Path
import tempfile
import unittest

from datetime import date

from daymark.app import DaymarkApp
from daymark.ui.report_dialog import ReportDialog
from daymark.ui.settings_dialog import SettingsDialog


class GuiSmokeTest(unittest.TestCase):
    def test_application_can_render_and_close(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = DaymarkApp(Path(directory))
            app.update_idletasks()
            self.assertIn("Daymark", app.title())
            self.assertEqual(42, sum(1 for widget in app.calendar_frame.grid_slaves() if int(widget.grid_info()["row"]) > 0))
            app._close()

    def test_dialogs_can_render_with_minimal_theme(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = DaymarkApp(Path(directory))
            report = ReportDialog(app, app.repository, app.settings, date.today())
            settings = SettingsDialog(app, app.settings, app.settings_store)
            app.update_idletasks()
            self.assertEqual("#15181c", report.cget("background"))
            self.assertEqual("#15181c", settings.cget("background"))
            settings.destroy()
            report.destroy()
            app._close()


if __name__ == "__main__":
    unittest.main()
