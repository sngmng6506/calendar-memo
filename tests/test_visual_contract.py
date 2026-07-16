from datetime import date, timedelta
from pathlib import Path
import tempfile
import tkinter as tk
import unittest
from unittest.mock import patch

from daymark.app import DaymarkApp, resolve_window_opacity
from daymark.theme import (
    DEFAULT_WINDOW_OPACITY,
    HOLIDAY_HEADER,
    HOLIDAY_RED,
    MIN_WINDOW_OPACITY,
    MUTED_TEXT,
    OUTSIDE_HOLIDAY,
    OUTSIDE_SATURDAY,
    SATURDAY_BLUE,
    SATURDAY_HEADER,
    SELECTED_BG,
)
from daymark.ui.day_cell import DayCell
from daymark.ui.more_menu import MoreMenuPopover
from daymark.ui.task_row import RoundCheck, TaskRow


class VisualContractTest(unittest.TestCase):
    def test_opacity_defaults_and_is_clamped(self) -> None:
        self.assertEqual(0.94, DEFAULT_WINDOW_OPACITY)
        self.assertEqual(0.78, MIN_WINDOW_OPACITY)
        self.assertEqual(DEFAULT_WINDOW_OPACITY, resolve_window_opacity(""))
        self.assertEqual(MIN_WINDOW_OPACITY, resolve_window_opacity("0.1"))
        self.assertEqual(1.0, resolve_window_opacity("2"))
        self.assertEqual(resolve_window_opacity(""), resolve_window_opacity("invalid"))

    def test_navigation_is_centered_and_calendar_has_no_card_borders(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            app.update_idletasks()
            self.assertEqual("0.5", app.nav_frame.place_info()["relx"])
            cell = next(
                widget for widget in app.calendar_frame.grid_slaves()
                if isinstance(widget, DayCell) and widget.task_date != date.today()
            )
            self.assertEqual(0, int(cell.cget("borderwidth")))
            self.assertEqual(0, int(cell.cget("highlightthickness")))
            draft = next(
                widget
                for widget in cell.rows_frame.winfo_children()
                if isinstance(widget, TaskRow) and widget.task is None
            )
            self.assertEqual("flat", draft.entry.cget("relief"))
            self.assertEqual(0, int(draft.entry.cget("borderwidth")))
            self.assertEqual("", draft.checkbox.winfo_manager())
            app._close()

    def test_toolbar_exposes_only_ai_and_more_as_right_actions(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            buttons = [
                child
                for frame in app.toolbar.winfo_children()
                if isinstance(frame, tk.Frame) and frame is not app.nav_frame
                for child in frame.winfo_children()
                if isinstance(child, tk.Button)
            ]
            self.assertEqual(["AI 요약", "···"], [button.cget("text") for button in buttons])
            labels = [action.label for action in app._more_actions()]
            self.assertIn("설정", labels)
            self.assertIn("미완료 오늘로 이동", labels)
            self.assertIn("앱 종료", labels)
            self.assertIsInstance(app.more_menu, MoreMenuPopover)
            app._close()

    def test_more_menu_opens_non_modal_and_closes_on_escape(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            app._show_more_menu()
            app.update_idletasks()
            self.assertTrue(app.more_menu.visible)
            self.assertIsNone(app.more_menu.grab_current())
            app.more_menu.focus_force()
            app.more_menu.event_generate("<KeyPress-Escape>", when="tail")
            app.update()
            self.assertFalse(app.more_menu.visible)
            app._close()

    def test_selected_date_uses_subtle_surface_and_today_badge(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            today = date.today()
            today_cell = app.day_cells[today]
            self.assertEqual(SELECTED_BG, today_cell.cget("background"))
            self.assertTrue(today_cell.header.today)
            self.assertEqual("bold", today_cell.header.font[2])
            other = next(day for day in app.day_cells if day != today)
            app._select_date(other)
            self.assertEqual(app.surface_bg, today_cell.cget("background"))
            self.assertEqual(SELECTED_BG, app.day_cells[other].cget("background"))
            app._close()

    def test_weekends_and_korean_holidays_use_subdued_calendar_colors(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            app.current = date(2026, 7, 1)
            app.selected_date = date(2026, 7, 1)
            app.render_month()
            cells = app.day_cells
            self.assertEqual(HOLIDAY_RED, cells[date(2026, 7, 17)].header.foreground)
            self.assertEqual(SATURDAY_BLUE, cells[date(2026, 7, 18)].header.foreground)
            self.assertEqual(HOLIDAY_RED, cells[date(2026, 7, 19)].header.foreground)
            self.assertEqual(OUTSIDE_SATURDAY, cells[date(2026, 8, 1)].header.foreground)
            self.assertEqual(OUTSIDE_HOLIDAY, cells[date(2026, 8, 2)].header.foreground)

            weekday_headers = {
                widget.cget("text"): widget.cget("foreground")
                for widget in app.calendar_frame.grid_slaves()
                if widget.grid_info().get("row") == 0
            }
            self.assertEqual(SATURDAY_HEADER, weekday_headers["토"])
            self.assertEqual(HOLIDAY_HEADER, weekday_headers["일"])
            self.assertNotEqual(SATURDAY_BLUE, weekday_headers["토"])
            self.assertNotEqual(HOLIDAY_RED, weekday_headers["일"])
            app._close()

    def test_saved_task_reveals_24px_round_check_control_without_green(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            cell = app.day_cells[date.today()]
            draft = next(
                widget
                for widget in cell.rows_frame.winfo_children()
                if isinstance(widget, TaskRow) and widget.task is None
            )
            draft.content_var.set("원형 체크 테스트")
            draft._commit(None)
            app.update_idletasks()
            self.assertEqual("pack", draft.checkbox.winfo_manager())
            self.assertIsInstance(draft.checkbox, RoundCheck)
            self.assertEqual(24, int(draft.checkbox.cget("width")))
            draft.completed_var.set(True)
            draft._apply_completed_style()
            self.assertEqual(MUTED_TEXT, draft.entry.cget("foreground"))
            app._close()

    def test_six_week_grid_renders_outside_month_dates_with_regular_date_font(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            app.current = date(2026, 8, 1)
            app.selected_date = date(2026, 8, 1)
            app.render_month()
            app.update_idletasks()
            cells = list(app.day_cells.values())
            self.assertEqual(42, len(cells))
            self.assertTrue(any(widget.task_date.month != 8 for widget in cells))
            regular = next(widget for widget in cells if not widget.header.today)
            self.assertEqual("normal", regular.header.font[2])
            app._close()

    def test_long_day_list_reveals_scrollbar(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            target = date.today()
            for index in range(24):
                app.repository.add(target, f"스크롤 업무 {index}")
            app.render_month()
            app.update_idletasks()
            cell = app.day_cells[target]
            cell._update_scroll_region()
            self.assertEqual("pack", cell.scrollbar.winfo_manager())
            app._close()

    def test_carry_over_updates_non_blocking_toast_without_messagebox(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory, patch("tkinter.messagebox.askyesno") as ask:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            app.repository.add(date.today() - timedelta(days=1), "이전 업무")
            app._carry_over()
            app.update_idletasks()
            ask.assert_not_called()
            self.assertIn("원본 유지", app.status_message.get())
            self.assertEqual("place", app.status_label.winfo_manager())
            app._close()


if __name__ == "__main__":
    unittest.main()
