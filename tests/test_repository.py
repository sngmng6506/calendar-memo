from datetime import date
from pathlib import Path
import sqlite3
import tempfile
import unittest

from daymark.repository import TaskRepository


class TaskRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
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

    def test_existing_v04_database_adds_origin_column_without_data_loss(self) -> None:
        self.repo.close()
        database = Path(self.temp_dir.name) / "legacy.db"
        connection = sqlite3.connect(database)
        connection.execute(
            """
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY, task_date TEXT NOT NULL, content TEXT NOT NULL,
                completed INTEGER NOT NULL, sort_order INTEGER NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("legacy", "2026-07-15", "기존 데이터", 0, 0, "2026-07-15T00:00:00+00:00", "2026-07-15T00:00:00+00:00"),
        )
        connection.commit()
        connection.close()

        migrated = TaskRepository(database)
        try:
            task = migrated.list_for_date(date(2026, 7, 15))[0]
            self.assertEqual("기존 데이터", task.content)
            self.assertIsNone(task.origin_task_id)
            self.assertEqual(1, migrated.copy_incomplete_before(date(2026, 7, 16)))
        finally:
            migrated.close()
        self.repo = TaskRepository(Path(self.temp_dir.name) / "test.db")

    def test_copy_all_past_incomplete_keeps_originals_and_is_idempotent(self) -> None:
        older = date(2026, 7, 14)
        completed = self.repo.add(older, "완료")
        self.repo.set_completed(completed.id, True)
        self.repo.add(older, "오래된 미완료")
        self.repo.add(self.day, "어제 미완료")
        target = date(2026, 7, 17)

        self.assertEqual(2, self.repo.copy_incomplete_before(target))
        self.assertEqual(0, self.repo.copy_incomplete_before(target))

        self.assertEqual(
            ["완료", "오래된 미완료"],
            [task.content for task in self.repo.list_for_date(older)],
        )
        self.assertEqual(["어제 미완료"], [t.content for t in self.repo.list_for_date(self.day)])
        copied = self.repo.list_for_date(target)
        self.assertEqual(["오래된 미완료", "어제 미완료"], [t.content for t in copied])
        self.assertTrue(all(task.origin_task_id for task in copied))

    def test_carried_copy_uses_one_root_when_multiple_past_copies_exist(self) -> None:
        original_day = date(2026, 7, 13)
        first_target = date(2026, 7, 14)
        final_target = date(2026, 7, 16)
        self.repo.add(original_day, "연속 업무")
        self.assertEqual(1, self.repo.copy_incomplete_before(first_target))
        self.assertEqual(1, self.repo.copy_incomplete_before(final_target))
        self.assertEqual(["연속 업무"], [t.content for t in self.repo.list_for_date(final_target)])

    def test_completing_latest_copy_stops_future_carry(self) -> None:
        original_day = date(2026, 7, 13)
        first_target = date(2026, 7, 14)
        final_target = date(2026, 7, 16)
        self.repo.add(original_day, "완료로 종료할 업무")
        self.assertEqual(1, self.repo.copy_incomplete_before(first_target))
        carried = self.repo.list_for_date(first_target)[0]
        self.repo.set_completed(carried.id, True)

        self.assertEqual(0, self.repo.copy_incomplete_before(final_target))
        self.assertEqual([], self.repo.list_for_date(final_target))


if __name__ == "__main__":
    unittest.main()
