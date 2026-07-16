# Architecture

## Overview

```mermaid
flowchart TD
    UI[Tkinter UI] --> Repo[TaskRepository]
    UI --> Report[ReportService]
    UI --> Host[DesktopHost]
    UI --> Holiday[KoreanHolidayCalendar]
    Host --> Win[WindowsDesktopHost / ctypes]
    Win --> Shell[Explorer WorkerW or Progman]
    Repo --> SQLite[(SQLite)]
    Report --> Models[Task / ReportPeriod]
    UI --> LLM[OpenAICompatibleClient]
    LLM --> API[OpenAI-compatible API]
    Settings[SettingsStore] --> JSON[(settings.json)]
    Holiday --> HolidayLib[python-holidays KR]
    Holiday --> Fallback[2020-2050 bundled JSON]
```

## Rationale

핵심 UI·저장·Windows 통합은 Python 표준 라이브러리로 구성하고, 공휴일 갱신에는 `python-holidays`를 선택적으로 사용한다.

- Tkinter: UI와 입력
- sqlite3: 로컬 저장
- urllib: OpenAI 호환 HTTP
- ctypes: Windows Shell 및 User32 연결
- unittest: 테스트
- python-holidays: 대한민국 법정 공휴일과 대체공휴일 생성

## Module Responsibilities

### `app.py`

월 달력과 모드 전환을 조립한다. Win32 함수를 직접 호출하지 않고 `DesktopHost`만 사용한다.

### `platform_integration/desktop_host.py`

운영체제 중립 인터페이스, 결과 객체, 비 Windows 안전 폴백을 제공한다.

### `platform_integration/windows_desktop.py`

Win32 모니터 열거, WorkerW/Progman 부모 탐색, 선택 모니터 상대 좌표 계산, `WS_EX_LAYERED` alpha 적용을 담당한다. WorkerW가 가상 데스크톱 전체 크기여도 Daymark 자식 창은 선택 모니터 영역에만 배치한다.

- Progman 탐색과 WorkerW 생성 요청
- `EnumWindows`와 `FindWindowExW`로 아이콘 호스트 뒤 WorkerW 탐색
- Tk 최상위 HWND 해석
- `MonitorFromWindow`로 일반 창이 현재 위치한 모니터 탐색
- 원래 부모와 스타일 보존
- `SetParent` 및 창 스타일 전환
- 선택 모니터 좌표를 WorkerW 부모 기준으로 변환한 `SetWindowPos`
- `WS_EX_LAYERED`와 `SetLayeredWindowAttributes`로 alpha 재적용
- Explorer 재시작 시 재연결
- 부분 실패 시 원상 복구

WorkerW 생성 메시지는 공개 Win32 계약이 아니므로 이 모듈 밖에서는 WorkerW 존재를 가정하지 않는다.

### `holiday_calendar.py`

`python-holidays`의 대한민국 `KR` 달력을 우선 사용한다. 패키지를 사용할 수 없으면 함께 배포된 2020~2050년 JSON으로 폴백한다. UI는 이 모듈의 `is_holiday()`만 사용한다.

### `theme.py`

반투명도, 색상, 평면 위젯 옵션을 관리한다.

### `ui/day_cell.py`

한 날짜의 업무 목록과 빈 입력 행을 렌더링한다.

### `repository.py`

SQLite 스키마, CRUD, 정렬, 미완료 원본 보존 복사와 보고서 저장을 담당한다. `origin_task_id`로 복사 계보를 추적해 반복 클릭과 이전 사본으로 인한 중복을 방지한다.

### `services/report_service.py`

업무 기록을 근거가 보존된 프롬프트 또는 로컬 요약으로 변환한다.

### `services/llm_client.py`

OpenAI 호환 요청과 응답 파싱만 담당한다.

## Desktop Mode Sequence

```mermaid
sequenceDiagram
    participant A as DaymarkApp
    participant H as WindowsDesktopHost
    participant E as Explorer
    participant W as WorkerW

    A->>H: attach(Tk HWND, display index, opacity)
    H->>E: Progman 찾기 + WorkerW 생성 요청
    H->>E: top-level windows 열거
    E-->>H: DefView 뒤 WorkerW
    H->>H: 원래 parent/style 저장
    H->>W: SetParent + WS_CHILD
    H->>W: 선택 모니터 상대 좌표로 resize
    H->>W: layered alpha 적용
    H-->>A: success / fallback reason
```

## Failure Boundaries

- WorkerW 탐색 실패: 일반 창 유지
- `SetParent` 이후 크기 조정 실패: 원래 부모와 스타일로 롤백
- Explorer 재시작: 2.5초 주기 유지 검사에서 새 부모 탐색
- LLM 또는 네트워크 실패: SQLite와 입력 UI는 계속 동작
- 앱 종료: 가능한 경우 먼저 원래 부모로 분리한 뒤 DB를 닫음

## Security Boundary

업무 데이터는 사용자가 LLM 생성 버튼을 누른 경우에만 외부로 전송된다. API 키는 환경변수에서 읽으며 파일에 쓰지 않는다. Win32 통합은 로컬 창 핸들과 스타일만 다루고 업무 내용에는 접근하지 않는다.

## Split Surface Transparency

Windows에서는 Tk 전경 창에 transparent-color key를 사용하고 별도 backdrop 창에만 alpha를 적용한다. 전경 창은 날짜, 업무, 체크와 선택 상태를 불투명하게 렌더링한다. WorkerW 연결 시 두 창을 같은 모니터 영역에 각각 연결하고 전경 host에는 `opacity=None`을 전달해 기존 layered 속성을 보존한다.

## Shared UI Tokens

`theme.py`가 색상, 불투명도 범위, 폰트 계층과 버튼 옵션을 제공한다. `ui/controls.py`는 설정과 보고서에서 공통으로 쓰는 평면 선택 컨트롤을 제공한다. 개별 화면은 플랫폼 기본 테두리를 직접 노출하지 않는다.
