# AGENTS.md

이 파일은 **툴에 무관한 영구 계약(permanent contract)** 레이어입니다. 특정 AI 도구(Claude
Code, Cursor, Copilot 등)에 종속되지 않으며, 각 툴은 얇은 어댑터 파일(`CLAUDE.md` 등)에서
이 문서를 참조하기만 합니다. 규칙이 바뀌면 **여기만** 고칩니다.

## 1. 프로젝트 정체성

- **이름**: 업무 · 일정 관리 (work-schedule-board)
- **한 줄**: 여러 목표·회사 업무·하루 업무량·컨디션을 같은 날짜 축에서 보는 웹앱.
  로그인 없이 `localStorage`로 동작하고, 구글 로그인 시 Railway Postgres에 동기화.
- **성격**: 개인 프로젝트. 유료화(auto-sync, 위젯 자동 새로고침)를 염두에 둔 free/paid 경계 존재.
- **진실의 원천(source of truth)**: 편집은 **웹앱**이 담당. 위젯(데스크톱/모바일)은 같은 서버
  데이터를 쓰는 얇은 read/quick-write 클라이언트. 위젯은 보드 계산 로직을 복제하지 않는다.

## 2. 아키텍처 불변식 (지켜야 할 것)

이 규칙들은 리팩터링·기능 추가 시에도 깨지면 안 된다.

1. **보드 계산 로직은 `core/`에만 존재한다.** `board-schema.js`(정규화)와
   `board-metrics.js`(요약·컨디션 보간)는 프론트(`app.js`)·서버(`server.js`)·위젯(`widget.js`)이
   **공유**한다. 같은 계산을 두 번 구현하지 않는다.
2. **`core/` 모듈은 UMD 패턴을 유지한다.** 브라우저 전역과 CommonJS(`module.exports`)
   양쪽에서 로드되므로, 이 이중 로딩을 깨는 import/export 문법을 도입하지 않는다.
3. **모든 서버 진입점은 `normalizeBoard()`를 통과시킨다.** 로드·저장 양쪽에서 방어.
4. **plan/feature 플래그의 진실의 원천은 서버다.** 프론트·위젯은 `/api/me`,
   `/api/auth/google` 응답의 feature 플래그를 **읽기만** 한다. 클라이언트에서 권한을 판단하지 않는다.
5. **동기화는 무조건 덮어쓰지 않는다.** 로컬·서버 중 `updatedAt`이 최신인 쪽을 채택하고,
   저장 시 `baseUpdatedAt` 낙관적 잠금으로 충돌(409)을 감지한다. (→ ADR-0002)
6. **정적 서빙은 백엔드/설정 파일을 노출하지 않는다.** `server.js`, `.env*`, `package*.json`
   등은 차단 목록 + `dotfiles: "ignore"`로 이중 차단.

## 3. 보안 규칙

- **사용자 입력을 `innerHTML`에 넣을 때는 반드시 `escapeHtml()`를 거친다.** 목표명·노트·
  마일스톤 노트·공휴일명 등 모든 지점. 새 렌더 코드도 동일.
- **prod에서 `JWT_SECRET`이 없으면 기동 실패시킨다.** 취약한 기본값으로 조용히 뜨지 않는다.
- **시크릿을 커밋하지 않는다.** `.env`는 gitignore됨. Railway는 서비스 Variables 사용.
- DB 연결 SSL은 공개 프록시일 때만 켠다. internal URL(`.railway.internal`)이면 불필요.

## 4. 코드 스타일

- 언어: Vanilla JS (프레임워크 없음). 프론트도 빌드 스텝 없이 `<script>` 직접 로드.
- 주석·UI 문자열은 한국어. 변수/함수명은 영어.
- 날짜 키는 항상 `YYYY-MM-DD` 문자열, 기준 시간대는 `Asia/Seoul`
  (`getKoreaDateKey`). 서버가 UTC여도 이 함수를 거친다.
- 공휴일은 `holidays/<연도>.js`에 `registerHolidays()`로 추가 (HTML 수정 불필요).

## 5. 커밋 규칙

한 줄 요약 뒤 본문에 **왜/무엇을 결정했는지**를 남긴다. 특히 비자명한 변경은 필수.

```
<요약: 무엇을 했는가 (명령형)>

Why: <이 변경이 필요한 이유 — 어떤 문제/버그/요구를 해결하는가>
Decision: <여러 선택지 중 이 방식을 택한 근거 (해당 시)>
```

- 설계 수준의 결정은 커밋 본문이 아니라 `docs/adr/`에 ADR로 남기고 커밋에서 참조한다.
- Co-Authored-By 트레일러는 AI 도구가 실질 기여한 경우 유지.

## 6. 검증 (변경 후 필수)

빌드 스텝이 없으므로 최소한 문법 검사는 항상 돌린다.

```bash
node --check app.js
node --check server.js
node --check widget.js
node --check core/board-schema.js
node --check core/board-metrics.js
```

- `core/` 로직을 바꿨으면 순수 함수 단위로 격리 테스트를 작성해 확인한다
  (프론트 전역 없이 재현 가능해야 한다 — 이것이 `core/` 분리의 목적).
- 동기화·충돌 로직을 건드렸으면 최소 5개 시나리오를 검증한다:
  로컬 최신 / 서버 최신 / 동률 / 레거시 로컬(updatedAt 없음) / 서버 시간 null.

## 7. 문서 지도

| 문서 | 역할 |
|------|------|
| `AGENTS.md` (이 파일) | 툴 무관 영구 계약. 규칙의 진실의 원천 |
| `CLAUDE.md` | Claude Code용 얇은 어댑터 → 이 파일 참조 |
| `README.md` | 사용자·운영자용 (실행·배포·기능) |
| `docs/ARCHITECTURE.md` | 시스템 구조·데이터 흐름·모듈 경계 |
| `docs/API.md` | HTTP 엔드포인트 계약 |
| `docs/DATA_MODEL.md` | 보드 스키마·동기화·충돌 규칙 |
| `docs/adr/` | 아키텍처 의사결정 기록(ADR) |
| `docs/WIDGET_PLAN.md` | 위젯/데스크톱 확장 로드맵 |

## 8. 작업 시 태도

- 추측하지 말고 실제 코드를 확인한 뒤 바꾼다. 특히 엔드포인트 계약·스키마·동기화 흐름.
- 위 불변식(2절)을 깨야만 하는 상황이면, 먼저 ADR로 결정을 남기고 이 문서를 갱신한 뒤 진행한다.
- 과설계를 피한다. 예: 현재 동기화는 보드 단위 최신 선택이면 충분하다. 필드 단위 병합/CRDT는
  auto-sync를 유료로 켤 때 다시 판단한다 (→ ADR-0002 "한계" 참조).
