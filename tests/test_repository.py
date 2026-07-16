from datetime import date
from pathlib import Path
import tempfile
import unittest

from daymark.repository import TaskRepository


class TaskRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo = TaskRepository(Path(self.temp_dir.name) / "test.db")
        self.day = date(2026, 7, 16)

    def tearDown(self) -> None:
        self.repo.close()
        self.temp_dir.cleanup()

    def test_crud_and_order(self) -> None:
        first = self.repo.add(self.day, "첫 업무")
        third = self.repo.add(self.day, "세 번째 업무")
        second = self.repo.add(self.day, "두 번째 업무", after_task_id=first.id)
        tasks = self.repo.list_for_date(self.day)
        self.assertEqual(["첫 업무", "두 번째 업무", "세 번째 업무"], [t.content for t in tasks])
        self.repo.set_completed(second.id, True)
        self.assertTrue(self.repo.list_for_date(self.day)[1].completed)
        self.repo.update_content(third.id, "수정된 업무")
        self.assertEqual("수정된 업무", self.repo.list_for_date(self.day)[2].content)
        self.repo.delete(first.id)
        self.assertEqual([0, 1], [t.sort_order for t in self.repo.list_for_date(self.day)])

    def test_blank_update_deletes_task(self) -> None:
        task = self.repo.add(self.day, "삭제 대상")
        self.repo.update_content(task.id, "   ")
        self.assertEqual([], self.repo.list_for_date(self.day))

    def test_move_incomplete_only(self) -> None:
        completed = self.repo.add(self.day, "완료")
        self.repo.set_completed(completed.id, True)
        self.repo.add(self.day, "미완료")
        target = date(2026, 7, 17)
        self.assertEqual(1, self.repo.move_incomplete(self.day, target))
        self.assertEqual(["완료"], [t.content for t in self.repo.list_for_date(self.day)])
        self.assertEqual(["미완료"], [t.content for t in self.repo.list_for_date(target)])


if __name__ == "__main__":
    unittest.main()
