from pathlib import Path
import tempfile
import unittest

from daymark.app import DaymarkApp


class GuiSmokeTest(unittest.TestCase):
    def test_application_can_render_and_close(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = DaymarkApp(Path(directory))
            app.update_idletasks()
            self.assertIn("Daymark", app.title())
            self.assertEqual(42, sum(1 for widget in app.calendar_frame.grid_slaves() if int(widget.grid_info()["row"]) > 0))
            app._close()


if __name__ == "__main__":
    unittest.main()
