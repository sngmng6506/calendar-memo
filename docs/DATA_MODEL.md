# Data Model

## Task

| Field | Type | Rule |
|---|---|---|
| `id` | UUID string | Primary key |
| `task_date` | ISO date | 사용자가 기록한 날짜 |
| `content` | text | trim 후 비어 있지 않음 |
| `completed` | integer boolean | 0 또는 1 |
| `sort_order` | integer | 날짜별 0부터 연속 |
| `created_at` | UTC ISO datetime | 생성 시간 |
| `updated_at` | UTC ISO datetime | 마지막 변경 시간 |

## Report

| Field | Type | Rule |
|---|---|---|
| `id` | UUID string | Primary key |
| `report_type` | text | daily, weekly, monthly |
| `start_date` | ISO date | 포함 시작일 |
| `end_date` | ISO date | 포함 종료일 |
| `content` | text | 생성된 보고서 |
| `created_at` | UTC ISO datetime | 생성 시간 |

## Schema

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    task_date TEXT NOT NULL,
    content TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_date_order ON tasks(task_date, sort_order);
```

## Invariants

- 같은 날짜의 두 업무가 동일한 `sort_order`를 갖지 않도록 애플리케이션이 순서를 이동한다.
- 삽입 위치 이후의 순서를 먼저 +1 한다.
- 삭제 후 뒤의 순서를 -1 한다.
- 빈 텍스트 업데이트는 삭제로 취급한다.
- 미완료 이동은 대상 날짜 끝에 삽입한 뒤 원본을 삭제한다.
