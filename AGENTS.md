# AGENTS.md

이 문서는 Daymark에서 사람과 코딩 에이전트가 따라야 하는 영구 작업 계약이다. 코드, 이슈, PR 설명과 이 문서가 충돌하면 이 문서를 우선하며, 제품 범위를 바꾸는 작업은 먼저 이 문서를 수정해야 한다.

## 1. Product Contract

Daymark의 목적은 다음 한 문장으로 고정한다.

> 달력의 날짜 셀에서 업무를 빠르게 적고 완료 체크한 기록을, 별도 정리 없이 업무보고로 변환한다.

MVP의 사용자 흐름은 정확히 다음과 같다.

1. 앱을 연다.
2. 날짜 셀의 빈 행을 클릭한다.
3. 한 업무를 입력하고 `Enter`를 누른다.
4. 같은 날짜의 다음 빈 행으로 포커스가 이동한다.
5. 업무를 끝내면 왼쪽 체크박스를 누른다.
6. 일간·주간·월간 보고서를 생성하고 복사한다.

## 2. Scope Guard

### 반드시 유지할 기능

- 월간 달력
- 날짜별 인라인 한 줄 업무
- `Enter`로 현재 업무 저장 및 다음 입력 행 생성
- 각 업무 왼쪽 완료 체크박스
- 로컬 SQLite 자동 저장
- 어제 미완료 업무를 오늘로 이동
- 일간·주간·월간 로컬 요약
- OpenAI 호환 LLM 보고서 생성
- API 키 비저장

### 명시적으로 제외할 기능

다음 기능은 사용자가 별도로 제품 범위 변경을 승인하기 전까지 구현하지 않는다.

- 로그인, 계정, 권한
- 클라우드 동기화 및 서버
- 팀 협업과 공유
- 프로젝트, 태그, 우선순위, 담당자
- 알림과 반복 일정
- 간트 차트, 업무량·컨디션 그래프
- 채팅형 AI 인터페이스
- 모바일 앱
- 외부 캘린더 연동

“나중에 필요할 수 있다”는 이유만으로 데이터 필드, 추상화 또는 의존성을 미리 추가하지 않는다.

## 3. UX Invariants

- 날짜 셀을 떠나는 모달 없이 업무 입력과 체크가 끝나야 한다.
- 새 업무 입력에 필요한 클릭 수는 날짜 셀 클릭 한 번 이하로 유지한다.
- 기존 업무에서 `Enter`를 누르면 저장 후 바로 아래 새 행에 포커스를 둔다.
- 기존 업무 내용을 공백으로 만들면 해당 업무를 삭제한다.
- 체크 상태 변경은 즉시 저장한다.
- 완료 업무는 시각적으로 흐리게 표시하되 내용은 계속 읽을 수 있어야 한다.
- AI 보고서는 입력 기록에 없는 사실을 만들어서는 안 된다.
- API 키는 DB, JSON, 로그, Git에 기록하지 않는다.

## 4. Architecture Boundaries

의존 방향은 다음을 지킨다.

```text
ui -> repository/services/models
services -> models
repository -> models
models -> standard library only
```

- `repository.py`만 SQLite SQL을 가진다.
- `llm_client.py`만 외부 LLM HTTP 형식을 안다.
- `report_service.py`는 GUI를 import하지 않는다.
- UI 테스트를 가능하게 하기 위해 데이터 디렉터리는 생성자에서 주입할 수 있어야 한다.
- MVP에서는 외부 런타임 의존성을 추가하지 않는다. Python 표준 라이브러리를 우선한다.

## 5. Data Rules

- 날짜는 `YYYY-MM-DD` 문자열로 저장한다.
- 시간은 UTC ISO 8601로 저장한다.
- 업무 순서는 날짜별 `sort_order` 0부터 연속된 정수로 유지한다.
- 빈 업무는 저장하지 않는다.
- 삭제 후 해당 날짜의 순서를 다시 연속으로 만든다.
- 미완료 이동은 완료 업무를 원래 날짜에 남긴다.
- 모든 DB 변경은 같은 사용자 동작 안에서 commit한다.

## 6. LLM Safety and Privacy

- 사용자 업무 기록은 사용자가 `LLM으로 생성`을 누를 때만 외부 API로 보낸다.
- 로컬 미리보기는 네트워크를 사용하지 않는다.
- 시스템 프롬프트에는 허위 성과 생성 금지와 완료/미완료 구분을 포함한다.
- 오류 메시지에 Authorization 헤더나 API 키를 포함하지 않는다.
- API 키 저장 기능을 추가하지 않는다.

## 7. Definition of Done

변경은 아래 조건을 모두 만족해야 완료다.

1. `python -m compileall src` 성공
2. `python -m unittest discover -s tests -v` 성공
3. Linux에서는 `xvfb-run -a python scripts/check.py` 성공
4. 새 동작에 대한 테스트 추가 또는 기존 테스트가 충분한 이유 기록
5. README와 관련 `docs/*.md`가 실제 동작과 일치
6. 로그인·클라우드 동기화 등 Scope Guard 위반 없음
7. 비밀키, 토큰, 개인 DB 파일이 commit되지 않음

## 8. Change Procedure for Agents

1. `AGENTS.md`와 관련 명세를 먼저 읽는다.
2. 요구 사항을 기존 불변식과 비교한다.
3. 데이터 모델 변경이 필요한지 판단한다.
4. 실패하는 테스트를 먼저 추가하거나 검증 기준을 명시한다.
5. 가장 작은 변경으로 구현한다.
6. 전체 검사 스크립트를 실행한다.
7. 코드와 문서를 함께 갱신한다.
8. 커밋 메시지에 사용자 관점 결과를 적는다.

## 9. Commit Convention

```text
feat: add weekly report generation
fix: preserve task order after deletion
test: cover incomplete task carry-over
docs: clarify API key handling
refactor: isolate report prompt builder
```

하나의 커밋에는 하나의 논리적 변경만 포함한다. 자동 생성된 DB, 캐시, 빌드 결과는 commit하지 않는다.
