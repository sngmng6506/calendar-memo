from __future__ import annotations

import sqlite3
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from .models import Task


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


class TaskRepository:
    def __init__(self, database_path: str | Path) -> None:
        self.database_path = str(database_path)
        self._connection = sqlite3.connect(self.database_path)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA foreign_keys = ON")
        self._connection.execute("PRAGMA journal_mode = WAL")
        self._migrate()

    def close(self) -> None:
        self._connection.close()

    def _migrate(self) -> None:
        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                task_date TEXT NOT NULL,
                content TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
                sort_order INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                origin_task_id TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_date_order
                ON tasks(task_date, sort_order);

            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                report_type TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        columns = {row["name"] for row in self._connection.execute("PRAGMA table_info(tasks)")}
        if "origin_task_id" not in columns:
            self._connection.execute("ALTER TABLE tasks ADD COLUMN origin_task_id TEXT")
        self._connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_origin_date "
            "ON tasks(origin_task_id, task_date)"
        )
        self._connection.commit()

    def list_between(self, start_date: date, end_date: date) -> list[Task]:
        rows = self._connection.execute(
            """
            SELECT * FROM tasks
            WHERE task_date BETWEEN ? AND ?
            ORDER BY task_date, sort_order, created_at
            """,
            (start_date.isoformat(), end_date.isoformat()),
        ).fetchall()
        return [self._to_task(row) for row in rows]

    def list_for_date(self, task_date: date) -> list[Task]:
        return self.list_between(task_date, task_date)

    def add(
        self,
        task_date: date,
        content: str,
        after_task_id: str | None = None,
        *,
        origin_task_id: str | None = None,
    ) -> Task:
        normalized = content.strip()
        if not normalized:
            raise ValueError("Task content must not be blank")

        tasks = self.list_for_date(task_date)
        if after_task_id is None:
            insert_at = len(tasks)
        else:
            ids = [task.id for task in tasks]
            if after_task_id not in ids:
                raise KeyError(f"Task not found on {task_date}: {after_task_id}")
            insert_at = ids.index(after_task_id) + 1

        self._shift_orders(task_date, insert_at, 1)
        now = utc_now()
        task = Task(
            id=str(uuid.uuid4()),
            task_date=task_date,
            content=normalized,
            completed=False,
            sort_order=insert_at,
            created_at=now,
            updated_at=now,
            origin_task_id=origin_task_id,
        )
        self._connection.execute(
            """
            INSERT INTO tasks(
                id, task_date, content, completed, sort_order, created_at, updated_at, origin_task_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task.id,
                task.task_date.isoformat(),
                task.content,
                0,
                task.sort_order,
                task.created_at.isoformat(),
                task.updated_at.isoformat(),
                task.origin_task_id,
            ),
        )
        self._connection.commit()
        return task

    def update_content(self, task_id: str, content: str) -> None:
        normalized = content.strip()
        if not normalized:
            self.delete(task_id)
            return
        cursor = self._connection.execute(
            "UPDATE tasks SET content = ?, updated_at = ? WHERE id = ?",
            (normalized, utc_now().isoformat(), task_id),
        )
        if cursor.rowcount != 1:
            raise KeyError(f"Task not found: {task_id}")
        self._connection.commit()

    def set_completed(self, task_id: str, completed: bool) -> None:
        cursor = self._connection.execute(
            "UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?",
            (int(completed), utc_now().isoformat(), task_id),
        )
        if cursor.rowcount != 1:
            raise KeyError(f"Task not found: {task_id}")
        self._connection.commit()

    def delete(self, task_id: str) -> None:
        row = self._connection.execute(
            "SELECT task_date, sort_order FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if row is None:
            return
        self._connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        self._connection.execute(
            """
            UPDATE tasks SET sort_order = sort_order - 1
            WHERE task_date = ? AND sort_order > ?
            """,
            (row["task_date"], row["sort_order"]),
        )
        self._connection.commit()

    def copy_incomplete_before(self, target_date: date) -> int:
        """오늘 이전의 미완료 업무를 원본 보존 방식으로 대상 날짜에 복사한다.

        같은 원본에서 파생된 업무는 하루에 한 번만 복사된다. 따라서 버튼을
        반복해서 눌러도 같은 업무가 중복 생성되지 않는다.
        """
        rows = self._connection.execute(
            """
            SELECT * FROM tasks
            WHERE task_date < ?
            ORDER BY task_date, sort_order, created_at
            """,
            (target_date.isoformat(),),
        ).fetchall()
        history = [self._to_task(row) for row in rows]
        if not history:
            return 0

        latest_by_origin: dict[str, Task] = {}
        for task in history:
            origin = task.origin_task_id or task.id
            latest_by_origin[origin] = task

        already_copied = {
            task.origin_task_id
            for task in self.list_for_date(target_date)
            if task.origin_task_id is not None
        }
        copied = 0
        for origin, task in latest_by_origin.items():
            if task.completed or origin in already_copied:
                continue
            self.add(target_date, task.content, origin_task_id=origin)
            already_copied.add(origin)
            copied += 1
        return copied

    def save_report(
        self, report_type: str, start_date: date, end_date: date, content: str
    ) -> str:
        report_id = str(uuid.uuid4())
        self._connection.execute(
            """
            INSERT INTO reports(id, report_type, start_date, end_date, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                report_type,
                start_date.isoformat(),
                end_date.isoformat(),
                content,
                utc_now().isoformat(),
            ),
        )
        self._connection.commit()
        return report_id

    def _shift_orders(self, task_date: date, from_order: int, delta: int) -> None:
        self._connection.execute(
            """
            UPDATE tasks SET sort_order = sort_order + ?
            WHERE task_date = ? AND sort_order >= ?
            """,
            (delta, task_date.isoformat(), from_order),
        )

    @staticmethod
    def _to_task(row: sqlite3.Row) -> Task:
        return Task(
            id=row["id"],
            task_date=date.fromisoformat(row["task_date"]),
            content=row["content"],
            completed=bool(row["completed"]),
            sort_order=row["sort_order"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            origin_task_id=row["origin_task_id"],
        )
