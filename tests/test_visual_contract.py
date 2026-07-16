from datetime import date
from pathlib import Path
import tempfile
import unittest

from daymark.app import DaymarkApp, resolve_window_opacity
from daymark.theme import WINDOW_BG
from daymark.ui.day_cell import DayCell
from daymark.ui.task_row import TaskRow


class VisualContractTest(unittest.TestCase):
    def test_opacity_defaults_and_is_clamped(self) -> None:
        self.assertGreater(resolve_window_opacity(""), 0.5)
        self.assertLess(resolve_window_opacity(""), 1.0)
        self.assertEqual(0.55, resolve_window_opacity("0.1"))
        self.assertEqual(1.0, resolve_window_opacity("2"))
        self.assertEqual(resolve_window_opacity(""), resolve_window_opacity("invalid"))

    def test_navigation_is_centered_and_calendar_has_no_card_borders(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = DaymarkApp(Path(directory))
            app.update_idletasks()
            self.assertEqual("0.5", app.nav_frame.place_info()["relx"])
            cell = next(widget for widget in app.calendar_frame.grid_slaves() if isinstance(widget, DayCell))
            self.assertEqual(0, int(cell.cget("borderwidth")))
            self.assertEqual(0, int(cell.cget("highlightthickness")))
            self.assertEqual(WINDOW_BG, cell.cget("background"))
            draft = next(
                widget
                for widget in cell.rows_frame.winfo_children()
                if isinstance(widget, TaskRow) and widget.task is None
            )
            self.assertEqual("flat", draft.entry.cget("relief"))
            self.assertEqual(0, int(draft.entry.cget("borderwidth")))
            self.assertEqual(WINDOW_BG, draft.entry.cget("background"))
            self.assertEqual("", draft.checkbox.winfo_manager())
            app._close()

    def test_saved_task_reveals_flat_checkbox(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = DaymarkApp(Path(directory))
            target = date.today()
            cell = next(
                widget
                for widget in app.calendar_frame.grid_slaves()
                if isinstance(widget, DayCell) and widget.task_date == target
            )
            draft = next(
                widget
                for widget in cell.rows_frame.winfo_children()
                if isinstance(widget, TaskRow) and widget.task is None
            )
            draft.content_var.set("평면 체크 테스트")
            draft._commit(None)
            app.update_idletasks()
            self.assertEqual("pack", draft.checkbox.winfo_manager())
            self.assertEqual("flat", draft.checkbox.cget("relief"))
            app._close()


if __name__ == "__main__":
    unittest.main()
