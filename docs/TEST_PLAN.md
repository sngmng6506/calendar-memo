# Test Plan

## Test Levels

### Unit

- 월간 달력이 항상 42일인지 검증
- 월 이동 시 말일 보정 검증
- 업무 추가·중간 삽입·수정·체크·삭제 검증
- 삭제 후 `sort_order` 연속성 검증
- 미완료 업무만 다음 날짜로 이동하는지 검증
- 보고서 프롬프트가 완료·미완료를 사실대로 포함하는지 검증
- OpenAI 호환 응답 파싱과 API 키 누락 오류 검증

### GUI Smoke

가상 디스플레이에서 앱을 생성하고 다음을 확인한다.

- 창 제목에 Daymark 포함
- 월간 날짜 셀 42개 렌더링
- 저장소를 닫고 창을 정상 종료 가능

### Contract

- README, AGENTS, CLAUDE 및 핵심 명세 파일 존재
- Scope Guard에 로그인, 클라우드 동기화, Enter 규칙이 명시됨

## Commands

```bash
PYTHONPATH=src python -m compileall src
PYTHONPATH=src python -m unittest discover -s tests -v
PYTHONPATH=src xvfb-run -a python scripts/check.py
```

## CI Matrix

- Ubuntu latest: Python 3.11, 3.13, Xvfb GUI 테스트
- Windows latest: Python 3.11, 3.13

## Release Gate

- 모든 CI 조합 성공
- 명세와 실제 키보드 동작 일치
- API 키 또는 DB 파일이 저장소에 없음
- 알려진 제약이 README에 기록됨
