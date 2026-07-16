# Architecture

## Dependency Direction

```text
Tkinter UI -> repository / services / models
Tkinter UI -> DesktopHost
Tkinter UI -> KoreanHolidayCalendar
WindowsDesktopHost -> ctypes / User32 / Explorer
TaskRepository -> sqlite3 / Task
```

## Modules

### `repository.py`

SQLite CRUD와 미완료 복사 계보를 담당한다. `origin_task_id`로 최초 원본을 추적하고 계보의 최신 사본 상태를 기준으로 다음 복사를 결정한다.

### `platform_integration/desktop_host.py`

OS 중립 인터페이스와 비 Windows 폴백을 제공한다. 현재 창이 위치한 모니터 인덱스 조회도 이 경계를 통한다.

### `platform_integration/windows_desktop.py`

- WorkerW/Progman 탐색
- 모니터 열거와 `MonitorFromWindow`
- 선택 모니터 좌표를 WorkerW 부모 좌표로 변환
- `SetParent`, 창 스타일 및 layered alpha 적용
- Explorer 재시작 후 재연결
- 실패 시 원래 부모와 스타일 복구

### `holiday_calendar.py`

`python-holidays`의 대한민국 `KR` 달력을 우선 사용한다. 패키지가 없으면 함께 배포된 2020~2050년 JSON으로 폴백한다. UI는 `is_holiday()`만 사용한다.

### `app.py`

달력, 미완료 복사, 모드 전환을 조립한다. Win32 API나 SQL을 직접 호출하지 않는다.

## Failure Boundaries

- WorkerW 실패는 일반 창 폴백으로 끝나며 SQLite에 영향을 주지 않는다.
- 공휴일 라이브러리 import 실패는 내장 데이터 폴백으로 처리한다.
- v0.4 DB 마이그레이션은 기존 행을 삭제하거나 다시 작성하지 않는다.
- LLM 실패와 네트워크 실패는 업무 입력을 막지 않는다.
