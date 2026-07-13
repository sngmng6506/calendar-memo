# 아키텍처 의사결정 기록 (ADR)

설계 수준의 결정을 하나씩 남긴다. 형식·규칙은 [ADR-0001](./0001-record-architecture-decisions.md).

| # | 제목 | 상태 |
|---|------|------|
| [0001](./0001-record-architecture-decisions.md) | 아키텍처 의사결정을 ADR로 기록한다 | 채택 |
| [0002](./0002-board-sync-optimistic-locking.md) | 보드 동기화에 버전 기반 낙관적 잠금을 쓴다 | 채택 |
| [0003](./0003-desktop-widget-tauri.md) | 데스크톱 위젯을 Tauri로 만든다 | 채택(결정만) |

새 ADR은 다음 번호로 추가하고 이 표에 등록한다. 결정을 뒤집을 때는 기존 ADR을 지우지 않고
새 ADR에서 `대체됨`으로 링크한다.
