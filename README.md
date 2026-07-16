# Daymark Calendar

바탕화면 위에 놓인 달력에서 날짜별 업무를 바로 적고 체크한 뒤, 기록을 기반으로 AI 업무보고를 만드는 초경량 데스크톱 앱입니다.

## 핵심 기능

- 월간 달력의 각 날짜 셀에서 업무를 바로 입력
- 중앙 월 이동 내비게이션과 테두리 없는 미니멀 달력
- 배경이 은은하게 비치는 반투명 표면
- Windows에서 Explorer의 WorkerW 바탕화면 레이어에 고정
- 토요일 파란색, 일요일·대한민국 공휴일 빨간색 표시
- 한 줄 입력 후 `Enter`를 누르면 다음 업무 입력 행 생성
- 업무 왼쪽 `□ / ✓`로 완료 여부 기록
- 오늘 이전 모든 날짜의 미완료 업무를 원본을 남긴 채 오늘로 복사
- 일간·주간·월간 로컬 요약 및 OpenAI 호환 LLM 보고서
- 계정·서버 없이 SQLite에 로컬 저장
- API 키를 파일에 저장하지 않고 `OPENAI_API_KEY` 환경변수로만 사용

## 바탕화면 모드

Windows에서는 첫 실행 시 기본적으로 WorkerW 또는 Progman 바탕화면 레이어에 연결합니다. 창 테두리가 사라지고 **설정에서 선택한 모니터 한 대의 영역에만** 표시됩니다.

- 우측 `창 모드` 버튼: 일반 창으로 복귀
- 일반 창의 `바탕화면` 버튼: 다시 바탕화면에 고정
- `Ctrl+Shift+D`: 두 모드 전환. 일반 창에서 전환하면 현재 창이 있는 모니터를 자동 선택
- Explorer가 재시작되어 WorkerW가 교체되면 2.5초 이내에 재탐색
- 바탕화면 모드 전환·유지 때 투명도를 네이티브 Win32 alpha로 재적용
- 연결에 실패하면 일반 창으로 자동 폴백

```powershell
py -m daymark.main --window
py -m daymark.main --desktop
```

## 미완료 업무 복사

우측 `미완료 복사`를 누르면 오늘 이전 날짜에 남아 있는 모든 미완료 업무를 오늘 끝에 복사합니다. 원래 날짜의 업무는 삭제되지 않으며, 같은 날 버튼을 반복해서 눌러도 같은 원본 업무가 중복 생성되지 않습니다. 오늘로 복사된 최신 사본을 완료하면 오래된 원본이 미체크여도 다음 날 다시 복사되지 않습니다.

## 주말과 대한민국 공휴일

- 토요일 날짜와 요일은 파란색
- 일요일 날짜와 요일은 빨간색
- 대한민국 법정 공휴일과 대체공휴일은 빨간색
- `python-holidays`가 설치되어 있으면 `KR` 달력을 동적으로 사용
- 라이브러리가 없어도 2020~2050년 내장 데이터로 동작

## 화면 설정

앱의 `설정`에서 바탕화면 표시 모니터와 투명도를 바꿀 수 있습니다. 일반 창에서 바탕화면 모드로 전환할 때는 창이 현재 위치한 모니터가 자동 선택됩니다.

## 실행

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

API 키는 설정 파일이나 SQLite에 저장하지 않습니다.

## 데이터 위치

Windows:

```text
%LOCALAPPDATA%\daymark-calendar\daymark.db
```

기존 v0.4 데이터베이스는 첫 실행 시 미완료 복사 계보 컬럼이 자동 추가되며 기존 업무는 유지됩니다.

## 테스트

```powershell
.\scripts\check.ps1
```

검증 범위에는 SQLite 마이그레이션, 과거 미완료 원본 보존 복사, 현재 창 모니터 자동 선택, WorkerW 연결, 토·일요일 및 대한민국 공휴일 색상, 2020~2050 폴백이 포함됩니다.

## 프로젝트 구조

```text
src/daymark/
  app.py                         앱 셸과 모드 전환
  repository.py                  SQLite 저장소와 미완료 복사 계보
  holiday_calendar.py            대한민국 공휴일 라이브러리·내장 폴백
  platform_integration/
    desktop_host.py              OS 중립 인터페이스
    windows_desktop.py           WorkerW/모니터 Win32 어댑터
```

제품 명세는 [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md), 에이전트 작업 규칙은 [`AGENTS.md`](AGENTS.md)를 기준으로 합니다.

## 라이선스

MIT
