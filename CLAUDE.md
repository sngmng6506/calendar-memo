# CLAUDE.md

이 파일은 Claude Code용 **얇은 어댑터**입니다. 프로젝트 규칙·아키텍처 불변식·커밋 규칙은
모두 [`AGENTS.md`](./AGENTS.md)에 있으며, 그것이 진실의 원천입니다. 규칙을 바꿀 때는
이 파일이 아니라 `AGENTS.md`를 고치세요.

## 시작 전 반드시 읽기

1. [`AGENTS.md`](./AGENTS.md) — 영구 계약. 특히 **2절 아키텍처 불변식**과 **3절 보안 규칙**.
2. 건드리는 영역의 문서:
   - 엔드포인트 → [`docs/API.md`](./docs/API.md)
   - 보드 스키마·동기화 → [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md)
   - 전체 구조 → [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
   - 설계 결정 배경 → [`docs/adr/`](./docs/adr/)

## Claude Code 관점 요약 (세부는 AGENTS.md)

- 빌드 스텝 없음. 변경 후 `node --check`로 전 파일 문법 검사 (AGENTS.md 6절).
- 계산 로직은 `core/`에만. 프론트/서버/위젯이 공유하니 한쪽만 고치면 안 됨.
- 사용자 입력 → `innerHTML`은 반드시 `escapeHtml()`.
- 커밋 본문에 `Why:` / `Decision:` (AGENTS.md 5절). 설계 결정은 ADR로.

## 로컬 실행

```bash
npm install
npm start          # http://localhost:3000
# 동기화 없이 확인만: index.html 을 브라우저로 직접 열기 (localStorage 전용)
```
