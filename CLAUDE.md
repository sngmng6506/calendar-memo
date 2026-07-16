# CLAUDE.md

이 저장소에서 작업하기 전에 반드시 [`AGENTS.md`](AGENTS.md)를 읽는다. 제품 범위, UX 불변식, 아키텍처 경계, 테스트 완료 조건의 진실의 원천은 `AGENTS.md`다.

작업 시작 순서:

1. `AGENTS.md`
2. `docs/PRODUCT_SPEC.md`
3. 변경 대상에 따라 `docs/UX_SPEC.md`, `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`
4. `python scripts/check.py`

기능 추가 요청이 Scope Guard와 충돌하면 바로 구현하지 말고, 충돌 지점과 제품 복잡도 증가를 먼저 설명한다.
