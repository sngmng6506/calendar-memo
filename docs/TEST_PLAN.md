# Test Plan

## Unit

- 월간 42일과 월 이동 말일 보정
- SQLite CRUD, 순서, 체크, 삭제, 과거 전체 미완료 원본 보존 복사와 중복 방지
- 보고서 사실성과 LLM 응답 파싱
- WorkerW 연결 시 부모와 스타일 변경
- 분리 시 원래 부모·스타일 복원
- Explorer 부모 교체 후 재연결
- 연결 중 일부 실패 시 롤백
- 비 Windows 폴백의 안전한 no-op
- `--window`와 `--desktop` 상호 배타성
- 현재 창 모니터 자동 탐색 후 바탕화면 대상 선택
- 대한민국 공휴일과 대체공휴일 조회, 2050년 내장 폴백

## GUI Smoke

- 앱 생성과 종료
- 날짜 셀 42개
- 중앙 내비게이션
- 무테두리·무흰칸 시각 계약
- 저장 전 체크 숨김, 저장 후 표시
- 불투명도 범위
- 가짜 DesktopHost로 모드 전환과 설정 저장
- 낮은 채도의 토요일·일요일·공휴일 색상과 더 흐린 요일 헤더

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
4. 일반 창을 보조 모니터로 이동한 뒤 `Ctrl+Shift+D` 전환 시 같은 모니터에 고정
5. Explorer 재시작 후 재연결
6. `--window` 복구 실행
7. 종료 후 Explorer와 작업표시줄 정상 상태 확인

## Release Gate

- 모든 자동 테스트 성공
- Windows 수동 체크 결과 기록
- 명세와 실제 동작 일치
- API 키, DB, 캐시 미포함
- Windows에서 확인하지 못한 항목을 완료로 과장하지 않음

## Multi-monitor / Transparency Contract

- 두 개 이상의 가짜 모니터에서 선택 인덱스의 좌표·해상도만 사용
- 일반 창에서 전환 시 현재 창의 모니터 인덱스를 attach에 전달
- 유효하지 않은 모니터 인덱스는 주 모니터로 폴백
- attach와 maintain 모두 동일 opacity를 Win32 layered alpha에 전달
- 설정 변경 시 활성 바탕화면 위치와 투명도를 즉시 갱신
- settings.json에 모니터·투명도는 저장하되 API 키는 저장하지 않음

실제 Windows에서는 서로 다른 배율(DPI)의 듀얼 모니터, 좌측에 음수 좌표를 가진 모니터, Explorer 재시작 후 위치·투명도 유지 여부를 수동 확인한다.

## v0.6 Visual Contract

- 기본 불투명도 0.94, 최소값 0.78
- 상단 우측 기본 액션이 `AI 요약`, `···` 두 개뿐인지 확인
- 오늘 원형 표시와 선택 셀 배경이 함께 구분되는지 확인
- 이전·다음 월 날짜가 렌더링되지 않는지 확인
- 저장된 업무에 원형 체크 Canvas가 나타나는지 확인
- 긴 날짜 목록에서 스크롤바가 필요할 때만 나타나는지 확인
- 설정 슬라이더가 즉시 미리보기되고 취소 시 원래 값으로 복구되는지 확인
- AI 생성 중 주요 컨트롤이 비활성화되는지 확인
- 상단 직접 노출은 AI 요약·더보기뿐이며 더보기 팝업은 Esc로 닫힘
- 미완료 복사 후 messagebox 없이 비차단 토스트 갱신
- 원형 체크의 24px 클릭 영역과 완료 녹색 미사용
