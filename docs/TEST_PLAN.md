# Test Plan

## Unit

- 월간 42일과 월 이동 말일 보정
- SQLite CRUD, 순서, 체크, 삭제, 미완료 이동
- 보고서 사실성과 LLM 응답 파싱
- WorkerW 연결 시 부모와 스타일 변경
- 분리 시 원래 부모·스타일 복원
- Explorer 부모 교체 후 재연결
- 연결 중 일부 실패 시 롤백
- 비 Windows 폴백의 안전한 no-op
- `--window`와 `--desktop` 상호 배타성

## GUI Smoke

- 앱 생성과 종료
- 날짜 셀 42개
- 중앙 내비게이션
- 무테두리·무흰칸 시각 계약
- 저장 전 체크 숨김, 저장 후 표시
- 불투명도 범위
- 가짜 DesktopHost로 모드 전환과 설정 저장

## Commands

```bash
PYTHONPATH=src python -m compileall src
PYTHONPATH=src python -m unittest discover -s tests -v
PYTHONPATH=src xvfb-run -a python scripts/check.py
```

## CI Matrix

- Ubuntu latest: Python 3.11, 3.13, Xvfb 전체 테스트
- Windows latest: Python 3.11, 3.13, 전체 테스트

네이티브 WorkerW 호출은 CI에서 실제 Explorer 데스크톱을 변경하지 않는다. `WindowsDesktopHost` 상태 기계는 가짜 Win32 어댑터로 검증하고, 실제 Windows 데스크톱 연결은 수동 릴리스 체크리스트에서 확인한다.

## Windows Manual Release Check

1. Windows 10/11에서 기본 실행 시 바탕화면 모드 진입
2. 날짜 셀 클릭과 입력 가능
3. 데스크톱 아이콘과 일반 앱 창 동작 확인
4. `창 모드`와 `Ctrl+Shift+D` 전환
5. Explorer 재시작 후 재연결
6. `--window` 복구 실행
7. 종료 후 Explorer와 작업표시줄 정상 상태 확인

## Release Gate

- 모든 자동 테스트 성공
- Windows 수동 체크 결과 기록
- 명세와 실제 동작 일치
- API 키, DB, 캐시 미포함
- Windows에서 확인하지 못한 항목을 완료로 과장하지 않음
