# AGENTS.md

이 문서는 Daymark에서 사람과 코딩 에이전트가 따라야 하는 영구 작업 계약이다. 코드, 이슈, PR 설명과 이 문서가 충돌하면 이 문서를 우선하며, 제품 범위를 바꾸는 작업은 먼저 이 문서를 수정해야 한다.

## 1. Product Contract

> 달력의 날짜 셀에서 업무를 빠르게 적고 완료 체크한 기록을, 별도 정리 없이 업무보고로 변환한다.

## 2. Scope Guard

### 반드시 유지할 기능

- 월간 달력과 날짜별 인라인 한 줄 업무
- `Enter` 저장 및 다음 입력 행 생성
- 완료 체크와 로컬 SQLite 자동 저장
- 오늘 이전 모든 미완료 업무를 원본 보존 방식으로 오늘에 복사
- 일간·주간·월간 로컬 요약과 OpenAI 호환 LLM 보고서
- API 키 비저장
- Windows WorkerW 바탕화면 모드와 일반 창 폴백

### 명시적으로 제외할 기능

- 로그인, 계정, 권한, 클라우드 동기화
- 팀 협업, 프로젝트, 태그, 우선순위, 담당자
- 알림, 반복 일정, 간트 차트, 모바일 앱, 외부 캘린더 연동
- 채팅형 AI 인터페이스

## 3. UX Invariants

- 날짜 셀 안에서 입력과 체크가 끝나야 한다.
- 월 이동과 현재 월은 창 가로 중앙에 유지한다.
- 날짜 셀과 입력 행은 카드·흰 배경·테두리로 구분하지 않는다.
- Windows 바탕화면 모드는 선택한 모니터 한 대만 사용한다.
- 일반 창에서 바탕화면 모드로 전환할 때 현재 창이 있는 모니터를 자동 선택한다.
- 창/바탕화면 전환과 Explorer 재연결 뒤에도 투명도를 유지한다.
- 토요일은 파란색, 일요일과 대한민국 공휴일은 빨간색이다.
- AI 보고서는 입력 기록에 없는 사실을 생성하지 않는다.

## 4. Architecture Boundaries

```text
ui -> repository/services/models
services -> models
repository -> models
platform_integration -> standard library / Win32 ctypes
models -> standard library only
```

- `repository.py`만 SQLite SQL을 가진다.
- `windows_desktop.py`만 WorkerW, SetParent, 모니터 Win32 API를 안다.
- `app.py`는 `DesktopHost` 인터페이스만 사용한다.
- 대한민국 공휴일은 `python-holidays`를 우선 사용하고 ZIP 직접 실행을 위한 2020~2050년 폴백을 유지한다.

## 5. Data Rules

- 날짜는 `YYYY-MM-DD`, 시간은 UTC ISO 8601로 저장한다.
- 빈 업무는 저장하지 않는다.
- 미완료 복사는 원본 업무를 삭제하거나 완료 상태를 바꾸지 않는다.
- 복사본은 최초 원본 ID를 계보로 저장하고 같은 날짜 중복 복사를 막는다.
- 계보의 최신 사본을 완료하면 과거 원본이 미완료여도 다음 복사에서 제외한다.
- v0.4 DB에는 `origin_task_id`를 자동 마이그레이션한다.

## 6. Definition of Done

1. `python -m compileall src` 성공
2. `python -m unittest discover -s tests -v` 성공
3. Linux에서는 `xvfb-run -a python scripts/check.py` 성공
4. README와 관련 명세가 실제 동작과 일치
5. 비밀키·DB·캐시·빌드 결과가 commit되지 않음
6. 미완료 복사, 현재 창 모니터 선택, 주말·공휴일 색상 테스트 통과
7. Windows 실기기에서 확인하지 못한 동작은 검증 범위를 명시

## 7. Agent Procedure

1. `AGENTS.md`와 관련 명세를 먼저 읽는다.
2. 실패하는 테스트 또는 검증 기준을 먼저 작성한다.
3. 가장 작은 변경으로 구현한다.
4. 전체 검사 스크립트를 실행한다.
5. 코드와 문서를 함께 갱신한다.

자동 생성된 DB, 캐시, 빌드 결과는 commit하지 않는다.
