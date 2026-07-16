# Daymark Calendar

바탕화면 위에 놓인 달력에서 날짜별 업무를 바로 적고 체크한 뒤, 기록을 기반으로 AI 업무보고를 만드는 초경량 데스크톱 앱입니다.

## 핵심 기능

- 월간 달력의 각 날짜 셀에서 업무를 바로 입력
- 중앙 월 이동 내비게이션과 테두리 없는 미니멀 달력
- 배경이 은은하게 비치는 반투명 표면
- Windows에서 Explorer의 WorkerW 바탕화면 레이어에 고정
- 토요일과 일요일·대한민국 공휴일을 낮은 채도의 파랑·빨강으로 표시
- 한 줄 입력 후 `Enter`를 누르면 다음 업무 입력 행 생성
- 업무 왼쪽의 24px 클릭 영역을 가진 원형 체크 컨트롤로 완료 여부 기록
- 오늘 이전 모든 날짜의 미완료 업무를 원본을 남긴 채 오늘로 복사하고 비차단 토스트로 결과 표시
- 일간·주간·월간 로컬 요약 및 OpenAI 호환 LLM 보고서
- 계정·서버 없이 SQLite에 로컬 저장
- API 키를 파일에 저장하지 않고 `OPENAI_API_KEY` 환경변수로만 사용

## 바탕화면 모드

Windows에서는 첫 실행 시 기본적으로 WorkerW 또는 Progman 바탕화면 레이어에 연결합니다. 창 테두리가 사라지고 **설정에서 선택한 모니터 한 대의 영역에만** 표시됩니다.

- 우측 `···` 메뉴의 모드 전환: 일반 창과 바탕화면 모드 전환
- `Ctrl+Shift+D`: 두 모드 전환. 일반 창에서 전환하면 현재 창이 있는 모니터를 자동 선택
- Explorer가 재시작되어 WorkerW가 교체되면 2.5초 이내에 재탐색
- 바탕화면 모드 전환·유지 때 투명도를 네이티브 Win32 alpha로 재적용
- 연결에 실패하면 일반 창으로 자동 폴백

바탕화면 모드에서 화면을 조작하기 어렵거나 Explorer 구성과 맞지 않으면 다음 명령으로 일반 창 모드를 강제하고 설정에도 저장할 수 있습니다.

```powershell
py -m daymark.main --window
```

다시 바탕화면 모드를 기본값으로 저장하려면:

```powershell
py -m daymark.main --desktop
```

WorkerW 생성에 사용하는 Shell 메시지는 공개 Win32 계약이 아니므로 Windows 업데이트나 Explorer 대체 셸에 따라 폴백할 수 있습니다. 앱은 이 실패가 업무 데이터 손상으로 이어지지 않도록 창 모드와 저장 기능을 분리합니다.

## 미완료 오늘로 이동

`···` 메뉴의 `미완료 오늘로 이동`을 실행하면 오늘 이전 날짜에 남아 있는 모든 미완료 업무를 오늘 끝에 복사합니다. 원래 날짜의 업무는 삭제되지 않으며, 같은 날 버튼을 반복해서 눌러도 같은 원본 업무가 중복 생성되지 않습니다.

## 주말과 대한민국 공휴일

- 토요일 날짜는 낮은 채도의 파란색
- 일요일·대한민국 법정 공휴일·대체공휴일 날짜는 낮은 채도의 빨간색
- 토·일 요일 헤더는 날짜보다 한 단계 흐리게 표시
- `python-holidays`가 설치되어 있으면 `KR` 달력을 동적으로 사용
- 라이브러리가 없어도 2020~2050년 내장 데이터로 동작

## 화면 설정

앱의 `설정`에서 다음 값을 바로 바꿀 수 있습니다.

- **바탕화면 표시 모니터**: 주 모니터 또는 연결된 다른 모니터 한 대 선택
- **배경 투명도**: 78%~100%, 움직이는 즉시 미리보기하고 글자·체크는 선명하게 유지

설정을 저장하면 현재 바탕화면 모드에서도 즉시 위치와 투명도가 갱신됩니다. 유효하지 않은 모니터 번호가 남아 있으면 주 모니터로 안전하게 폴백합니다.

## 디자인 원칙

- 월 제목과 이전·다음·오늘 이동은 화면 가로 중앙에 고정합니다.
- 날짜는 카드나 흰 칸 없이 7열 정렬과 여백만으로 구분합니다.
- 빈 날짜에는 입력 상자와 체크박스가 보이지 않습니다.
- 날짜 영역을 클릭하면 입력 커서가 나타납니다.
- 저장된 업무만 원형 체크와 텍스트로 표시합니다.
- 오늘은 파란 원형 날짜, 선택 날짜는 아주 약한 셀 배경으로 구분합니다.
- 기본 창 불투명도는 `0.94`입니다.

불투명도는 실행 전에 조절할 수 있습니다.

```powershell
$env:DAYMARK_OPACITY = "0.90"
py -m daymark.main
```

허용 범위는 `0.78`부터 `1.0`입니다.

## 화면 구성

- 상단 중앙: 이전 달, 월 제목, 다음 달, 오늘
- 상단 우측: `AI 요약`, `···`
- `···` 평면 팝업: 미완료 오늘로 이동, 설정, 창/바탕화면 전환, 앱 종료
- 월간 화면은 항상 6주·42칸을 유지하며 이전·다음 달 날짜와 업무는 흐린 명암으로 표시합니다.
- 선택 날짜는 `#272A2E`의 낮은 대비 배경, 오늘 날짜는 파란 원형 표시로 동시에 구분됩니다.
- 날짜별 업무가 많아지면 그 날짜 셀에만 얇은 스크롤이 나타납니다.

## 제품 원칙

Daymark는 종합 일정 관리 도구가 아닙니다. 날짜별 업무 기록, 완료 체크, 보고서 생성만 제공합니다. 프로젝트 관리, 협업, 클라우드 동기화, 알림, 간트 차트는 MVP 범위에 포함하지 않습니다.

제품 명세는 [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md), 에이전트 작업 규칙은 [`AGENTS.md`](AGENTS.md)를 기준으로 합니다.

## 실행

### 요구 사항

- Python 3.11 이상
- Windows 10/11 권장
- Linux 또는 macOS에서는 일반 반투명 창 모드
- Tk 8.6

### PowerShell

```powershell
$env:PYTHONPATH = "$PWD\src"
py -m daymark.main
```

또는:

```powershell
.\scripts\run.ps1
```

개발 설치 후:

```powershell
py -m pip install -e .
daymark
```

## LLM 설정

```powershell
$env:OPENAI_API_KEY = "YOUR_API_KEY"
py -m daymark.main
```

앱의 `설정`에서 OpenAI 호환 API 주소와 모델 이름을 바꿀 수 있습니다. API 키는 설정 파일이나 SQLite에 저장하지 않습니다.

## 데이터 위치

Windows:

```text
%LOCALAPPDATA%\daymark-calendar\daymark.db
```

Linux:

```text
~/.local/share/daymark-calendar/daymark.db
```

`settings.json`에는 LLM API 주소, 모델, 바탕화면 모드 사용 여부, 선택 모니터 번호, 투명도만 저장됩니다. API 키는 저장하지 않습니다.

## 테스트

Windows PowerShell:

```powershell
.\scripts\check.ps1
```

Linux GUI 스모크 테스트 포함:

```bash
PYTHONPATH=src xvfb-run -a python scripts/check.py
```

검증 항목:

- 전체 Python 모듈 컴파일
- 날짜 계산과 SQLite CRUD
- 체크 상태와 과거 미완료 원본 보존 복사
- LLM 요청·응답 및 보고서 사실성
- 월간 6주·42개 날짜 셀과 현재 월 밖 날짜의 약한 명암
- 중앙 내비게이션과 무테두리 시각 계약
- WorkerW 연결·해제·실패 롤백·Explorer 재연결 상태 기계
- 선택 모니터 한 대의 좌표·해상도만 사용하는지 검증
- 일반 창이 위치한 모니터를 바탕화면 전환 대상으로 자동 선택
- 바탕화면 전환·유지 시 layered alpha 재적용
- 모니터·투명도 설정 저장 및 CLI 복구 옵션
- 토·일요일 및 대한민국 공휴일 색상과 2050년 폴백 데이터
- API 키 비저장

## 프로젝트 구조

```text
src/daymark/
  app.py                         앱 셸과 모드 전환
  calendar_utils.py              월간 6주 달력 계산
  repository.py                  SQLite 저장소와 미완료 복사 계보
  settings.py                    비밀키 제외 설정 저장
  holiday_calendar.py            대한민국 공휴일 라이브러리·내장 폴백
  theme.py                       색상·평면 위젯·불투명도
  platform_integration/
    desktop_host.py              OS 중립 인터페이스와 폴백
    windows_desktop.py           WorkerW/Progman Win32 어댑터
  services/
    report_service.py            보고서 프롬프트·로컬 요약
    llm_client.py                OpenAI 호환 HTTP 클라이언트
  ui/
    controls.py                  공통 평면 선택·슬라이더 컨트롤
    day_cell.py                  선택·오늘·외부 월 상태와 스크롤이 있는 날짜 셀
    task_row.py                  원형 체크·입력 행
    more_menu.py                 비모달 평면 더보기 팝업
    report_dialog.py             AI 요약 생성 화면
    settings_dialog.py           모델·API 주소 설정

docs/                            제품·UX·아키텍처·테스트 명세
tests/                           unittest와 GUI 스모크 테스트
```

## 현재 제약

- 실제 WorkerW 구조와 입력 전달은 Windows Shell 구성에 영향을 받습니다.
- 다중 모니터의 실제 WorkerW 좌표와 투명도는 Windows 10/11 실기기에서 추가 확인이 필요합니다.
- 한 날짜의 업무가 셀 높이를 넘으면 해당 날짜 안에서만 스크롤합니다.
- 반복 일정, 알림, 검색, 태그는 제공하지 않습니다.
- 배포용 단일 실행 파일은 후속 릴리스 범위입니다.

## 라이선스

MIT
