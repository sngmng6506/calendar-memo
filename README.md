# Daymark Calendar

날짜별 업무를 달력 안에서 바로 적고 체크한 뒤, 기록을 기반으로 AI 업무보고를 만드는 초경량 데스크톱 앱입니다.

## 핵심 기능

- 월간 달력의 각 날짜 셀에서 업무를 바로 입력
- 한 줄 입력 후 `Enter`를 누르면 바로 다음 업무 입력 행 생성
- 업무 왼쪽 체크박스로 완료 여부 기록
- 공백으로 비운 기존 업무는 자동 삭제
- 어제의 미완료 업무를 오늘로 한 번에 이동
- 일간·주간·월간 범위의 로컬 요약 및 OpenAI 호환 LLM 보고서 생성
- 계정·서버 없이 SQLite에 로컬 저장
- API 키를 파일에 저장하지 않고 `OPENAI_API_KEY` 환경변수로만 사용

## 제품 원칙

Daymark는 종합 일정 관리 도구가 아닙니다. 날짜별 업무 기록, 완료 체크, 보고서 생성만 제공합니다. 프로젝트 관리, 협업, 클라우드 동기화, 알림, 간트 차트는 MVP 범위에 포함하지 않습니다.

자세한 명세는 [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md), 에이전트 작업 규칙은 [`AGENTS.md`](AGENTS.md)를 기준으로 합니다.

## 실행

### 요구 사항

- Python 3.11 이상
- Windows, Linux 또는 macOS의 Tk 8.6 환경

### 가장 빠른 실행

PowerShell:

```powershell
$env:PYTHONPATH = "$PWD\src"
python -m daymark.main
```

또는:

```powershell
.\scripts\run.ps1
```

개발 설치 후에는 다음 명령도 사용할 수 있습니다.

```powershell
python -m pip install -e .
daymark
```

## LLM 설정

기본값은 OpenAI 호환 API입니다. API 키는 앱 내부에 저장하지 않습니다.

PowerShell:

```powershell
$env:OPENAI_API_KEY = "YOUR_API_KEY"
python -m daymark.main
```

앱의 `설정`에서 API 주소와 모델 이름을 바꿀 수 있습니다. OpenAI 호환 엔드포인트를 사용하는 다른 제공자도 연결할 수 있습니다.

## 데이터 위치

Windows:

```text
%LOCALAPPDATA%\daymark-calendar\daymark.db
```

Linux:

```text
~/.local/share/daymark-calendar/daymark.db
```

저장 데이터는 SQLite 파일 하나이므로 해당 파일을 복사하면 백업할 수 있습니다.

## 테스트

Windows PowerShell:

```powershell
.\scripts\check.ps1
```

Linux의 GUI 스모크 테스트 포함:

```bash
PYTHONPATH=src xvfb-run -a python scripts/check.py
```

검증 항목:

- 전체 Python 모듈 컴파일
- 날짜 계산
- SQLite CRUD 및 정렬
- 완료/미완료 이동
- LLM 요청·응답 파싱
- 보고서 프롬프트의 사실성 규칙
- 42개 날짜 셀 GUI 렌더링
- 필수 명세 문서 존재 및 Scope Guard

## 프로젝트 구조

```text
src/daymark/
  app.py                 앱 셸과 월 이동
  calendar_utils.py      월간 6주 달력 계산
  repository.py          SQLite 저장소
  models.py              Task·Report 모델
  settings.py            비밀키 제외 설정 저장
  services/
    report_service.py    보고서 프롬프트·로컬 요약
    llm_client.py        OpenAI 호환 HTTP 클라이언트
  ui/
    day_cell.py          날짜 셀과 인라인 업무 목록
    task_row.py          체크박스·입력 행
    report_dialog.py     보고서 생성 화면
    settings_dialog.py   모델·API 주소 설정

docs/                    제품·UX·아키텍처·데이터·테스트 명세
tests/                   표준 라이브러리 unittest
```

## 현재 제약

- 한 날짜에 업무가 매우 많으면 셀 높이가 커질 수 있습니다.
- 반복 일정, 알림, 검색, 태그는 제공하지 않습니다.
- 보고서 이력은 DB에 저장하지만 이력 조회 화면은 아직 제공하지 않습니다.
- 배포용 단일 실행 파일은 후속 릴리스 범위입니다.

## 라이선스

MIT
