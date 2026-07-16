# Test Plan

## Automated

- 월간 42일과 월 이동
- SQLite CRUD, 순서, 체크, 삭제
- v0.4 DB의 `origin_task_id` 무손실 마이그레이션
- 오늘 이전 전체 미완료 복사, 원본 보존, 같은 날 중복 방지
- 계보 최신 사본 완료 후 다음 복사 제외
- WorkerW 연결·분리·실패 롤백·Explorer 재연결
- 현재 창 모니터 자동 탐색과 선택 모니터 배치
- layered alpha 재적용
- 토요일 파란색, 일요일·대한민국 공휴일 빨간색
- `python-holidays` 미사용 상태의 2050년 내장 폴백
- LLM 응답 파싱과 API 키 비저장

## Commands

```bash
PYTHONPATH=src python -m compileall src
PYTHONPATH=src python -m unittest discover -s tests -v
PYTHONPATH=src xvfb-run -a python scripts/check.py
```

## Windows Manual Release Check

1. 일반 창을 보조 모니터로 이동한다.
2. `Ctrl+Shift+D`를 눌러 같은 모니터의 바탕화면에 고정되는지 확인한다.
3. 여러 과거 날짜의 미완료 업무를 만든 뒤 오늘로 복사하고 원본 유지 여부를 확인한다.
4. 토·일요일과 대한민국 공휴일 색상을 확인한다.
5. Explorer 재시작 후 위치와 투명도 유지 여부를 확인한다.
6. `--window` 복구를 확인한다.

## Release Gate

- 전체 자동 테스트 성공
- ZIP 재압축 해제 환경에서도 같은 검사 성공
- API 키, DB, settings.json, 캐시, 빌드 산출물 미포함
- Windows에서 직접 확인하지 못한 항목을 완료로 과장하지 않음
