from datetime import date
from pathlib import Path
import tempfile
import unittest

from daymark.app import DaymarkApp
from daymark.ui.day_cell import DayCell
from daymark.ui.task_row import TaskRow


class GuiInteractionTest(unittest.TestCase):
    def test_enter_persists_task_and_creates_next_row(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
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
            draft.content_var.set("테스트 업무")
            draft._commit(None)
            app.update_idletasks()
            self.assertEqual("테스트 업무", app.repository.list_for_date(target)[0].content)
            drafts = [
                widget
                for widget in cell.rows_frame.winfo_children()
                if isinstance(widget, TaskRow) and widget.task is None
            ]
            self.assertGreaterEqual(len(drafts), 1)
            self.assertEqual(target, app.selected_date)
            app._close()

    def test_pressing_enter_on_existing_task_reuses_single_draft(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
            cell = app.day_cells[date.today()]
            draft = next(
                widget
                for widget in cell.rows_frame.winfo_children()
                if isinstance(widget, TaskRow) and widget.task is None
            )
            draft.content_var.set("업무")
            draft._commit(None)
            app.update_idletasks()
            saved = next(
                widget
                for widget in cell.rows_frame.winfo_children()
                if isinstance(widget, TaskRow) and widget.task is not None
            )

            saved._commit(None)
            saved._commit(None)
            app.update_idletasks()

            drafts = [
                widget
                for widget in cell.rows_frame.winfo_children()
                if isinstance(widget, TaskRow) and widget.task is None
            ]
            self.assertEqual(1, len(drafts))
            app._close()

    def test_focus_out_updates_without_adding_another_draft(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = DaymarkApp(Path(directory), auto_desktop_mode=False)
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
            draft.content_var.set("초기 업무")
            draft._commit(None)
            app.update_idletasks()
            draft_count_before = sum(
                isinstance(widget, TaskRow) and widget.task is None
                for widget in cell.rows_frame.winfo_children()
            )
            draft.content_var.set("수정 업무")
            draft._focus_out(None)
            app.update_idletasks()
            draft_count_after = sum(
                isinstance(widget, TaskRow) and widget.task is None
                for widget in cell.rows_frame.winfo_children()
            )
            self.assertEqual(draft_count_before, draft_count_after)
            self.assertEqual("수정 업무", app.repository.list_for_date(target)[0].content)
            app._close()


if __name__ == "__main__":
    unittest.main()
