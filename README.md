# Daymark Calendar

바탕화면 위에 놓인 달력에서 날짜별 업무를 바로 적고 체크한 뒤, 기록을 기반으로 AI 업무보고를 만드는 초경량 데스크톱 앱입니다.

## 핵심 기능

- 월간 달력의 각 날짜 셀에서 업무를 바로 입력
- 중앙 월 이동 내비게이션과 테두리 없는 미니멀 달력
- 배경이 은은하게 비치는 반투명 표면
- Windows에서 Explorer의 WorkerW 바탕화면 레이어에 고정
- 한 줄 입력 후 `Enter`를 누르면 다음 업무 입력 행 생성
- 업무 왼쪽 `□ / ✓`로 완료 여부 기록
- 어제의 미완료 업무를 오늘로 이동
- 일간·주간·월간 로컬 요약 및 OpenAI 호환 LLM 보고서
- 계정·서버 없이 SQLite에 로컬 저장
- API 키를 파일에 저장하지 않고 `OPENAI_API_KEY` 환경변수로만 사용

## 바탕화면 모드

Windows에서는 첫 실행 시 기본적으로 WorkerW 또는 Progman 바탕화면 레이어에 연결합니다. 창 테두리가 사라지고 Explorer 바탕화면 크기에 맞춰 표시됩니다.

- 우측 `창 모드` 버튼: 일반 창으로 복귀
- 일반 창의 `바탕화면` 버튼: 다시 바탕화면에 고정
- `Ctrl+Shift+D`: 두 모드 전환
- Explorer가 재시작되어 WorkerW가 교체되면 2.5초 이내에 재탐색
- 연결에 실패하면 일반 창으로 자동 폴백

바탕화면 모드에서 화면을 조작하기 어렵거나 Explorer 구성과 맞지 않으면 다음 명령으로 일반 창 모드를 강제하고 설정에도 저장할 수 있습니다.

```powershell
python -m daymark.main --window
```

다시 바탕화면 모드를 기본값으로 저장하려면:

```powershell
python -m daymark.main --desktop
```

WorkerW 생성에 사용하는 Shell 메시지는 공개 Win32 계약이 아니므로 Windows 업데이트나 Explorer 대체 셸에 따라 폴백할 수 있습니다. 앱은 이 실패가 업무 데이터 손상으로 이어지지 않도록 창 모드와 저장 기능을 분리합니다.

## 디자인 원칙

- 월 제목과 이전·다음·오늘 이동은 화면 가로 중앙에 고정합니다.
- 날짜는 카드나 흰 칸 없이 7열 정렬과 여백만으로 구분합니다.
- 빈 날짜에는 입력 상자와 체크박스가 보이지 않습니다.
- 날짜 영역을 클릭하면 입력 커서가 나타납니다.
- 저장된 업무만 `□ / ✓`와 텍스트로 표시합니다.
- 기본 창 불투명도는 `0.86`입니다.

불투명도는 실행 전에 조절할 수 있습니다.

```powershell
$env:DAYMARK_OPACITY = "0.78"
python -m daymark.main
```

허용 범위는 `0.55`부터 `1.0`입니다.

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
python -m daymark.main
```

또는:

```powershell
.\scripts\run.ps1
```

개발 설치 후:

```powershell
python -m pip install -e .
daymark
```

## LLM 설정

```powershell
$env:OPENAI_API_KEY = "YOUR_API_KEY"
python -m daymark.main
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

`settings.json`에는 LLM API 주소, 모델, 바탕화면 모드 사용 여부만 저장됩니다.

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
- 체크 상태와 미완료 이동
- LLM 요청·응답 및 보고서 사실성
- 42개 날짜 셀 GUI 렌더링
- 중앙 내비게이션과 무테두리 시각 계약
- WorkerW 연결·해제·실패 롤백·Explorer 재연결 상태 기계
- 바탕화면 모드 설정 저장 및 CLI 복구 옵션
- API 키 비저장

## 프로젝트 구조

```text
src/daymark/
  app.py                         앱 셸과 모드 전환
  calendar_utils.py              월간 6주 달력 계산
  repository.py                  SQLite 저장소
  settings.py                    비밀키 제외 설정 저장
  theme.py                       색상·평면 위젯·불투명도
  platform_integration/
    desktop_host.py              OS 중립 인터페이스와 폴백
    windows_desktop.py           WorkerW/Progman Win32 어댑터
  services/
    report_service.py            보고서 프롬프트·로컬 요약
    llm_client.py                OpenAI 호환 HTTP 클라이언트
  ui/
    day_cell.py                  날짜 셀과 인라인 업무 목록
    task_row.py                  체크·입력 행
    report_dialog.py             보고서 생성 화면
    settings_dialog.py           모델·API 주소 설정

docs/                            제품·UX·아키텍처·테스트 명세
tests/                           unittest와 GUI 스모크 테스트
```

## 현재 제약

- 실제 WorkerW 구조와 입력 전달은 Windows Shell 구성에 영향을 받습니다.
- 다중 모니터에서는 Explorer가 제공하는 부모 레이어 크기를 사용합니다.
- 한 날짜에 업무가 매우 많으면 셀 높이가 부족할 수 있습니다.
- 반복 일정, 알림, 검색, 태그는 제공하지 않습니다.
- 배포용 단일 실행 파일은 후속 릴리스 범위입니다.

## 라이선스

MIT
