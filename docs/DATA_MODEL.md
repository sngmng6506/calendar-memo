# Data Model

## Task

| Field | Type | Rule |
|---|---|---|
| `id` | UUID string | Primary key |
| `task_date` | ISO date | 기록 날짜 |
| `content` | text | trim 후 비어 있지 않음 |
| `completed` | integer boolean | 0 또는 1 |
| `sort_order` | integer | 날짜별 0부터 연속 |
| `created_at` | UTC ISO datetime | 생성 시간 |
| `updated_at` | UTC ISO datetime | 변경 시간 |
| `origin_task_id` | UUID string or null | 미완료 복사 계보의 최초 원본 ID |

## Carry-over Invariants

- 최초 업무의 `origin_task_id`는 `NULL`이다.
- 복사본은 최초 원본의 ID를 가진다.
- 원본은 복사 시 삭제하거나 수정하지 않는다.
- 같은 날짜에는 동일한 `origin_task_id` 복사본을 두 번 만들지 않는다.
- 다음 복사 여부는 계보에서 날짜가 가장 최근인 업무의 완료 상태로 판단한다.
- v0.4 DB는 시작 시 `ALTER TABLE tasks ADD COLUMN origin_task_id TEXT`로 마이그레이션한다.

## Schema

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    task_date TEXT NOT NULL,
    content TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    origin_task_id TEXT
);

CREATE INDEX idx_tasks_date_order ON tasks(task_date, sort_order);
CREATE INDEX idx_tasks_origin_date ON tasks(origin_task_id, task_date);
```
