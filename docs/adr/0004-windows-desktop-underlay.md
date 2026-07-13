# ADR-0004: Windows 데스크톱 위젯은 WorkerW underlay로 시작한다

- 상태: 채택(Accepted) — MVP 구현
- 날짜: 2026-07
- 관련: ADR-0002, ADR-0003, `desktop/README.md`

## 맥락

데스크톱 앱은 일반 always-on-top 위젯이 아니라 DesktopCal처럼 **다른 앱 창 뒤에 가려지지만 바탕화면을
볼 때는 항상 존재하는 타임라인**이어야 한다. 메인 웹앱의 목표 × 날짜 축을 유지하되, 바탕화면 본문에서는
그래프를 숨기고 날짜별 컨디션만 quick-write한다.

Windows에서 이 동작은 일반적인 Tauri 창 옵션만으로 만들 수 없고, Explorer의 WorkerW 레이어에 창을
붙이는 Win32 처리가 필요하다.

## 결정

1차 MVP는 Tauri v2와 `tauri-plugin-wallpaper` 3.x를 사용한다.

- 앱 시작 시 연결 정보가 있으면 `attach("main")`으로 바탕화면 아이콘 뒤에 창을 붙인다.
- 상단 메뉴의 `일반 창으로 분리`를 누르면 `detach("main")`한다.
- 프론트는 `desktop/` 아래의 별도 Vite 앱이지만, 서버의 `/api/widget/*` 요약 계약을 사용하여 계산 로직을
  복제하지 않는다.
- 데스크톱 앱은 보드 전체 수정 권한을 갖지 않는다. 장기 위젯 토큰의 권한은 `widget:read`,
  `energy:write`로 제한한다.
- 컨디션 저장은 보드 전체 PUT이 아니라 `PATCH /api/widget/energy`의 JSONB 부분 갱신으로 처리하여
  웹 편집과의 충돌 범위를 줄인다.
- 네트워크가 끊기면 마지막 성공 요약을 localStorage 캐시에서 읽어 read-only로 표시한다.

## UI 범위

- 기본 화면: 목표 × 날짜 타임라인, 회사 업무/회사 프로젝트, 마일스톤, 컨디션 행
- quick-write: 날짜별 컨디션 0–120
- 숨김 패널: 업무량·컨디션 그래프
- 제외: 목표 생성/수정, 메모 편집, 업무량 편집, 자동 동기화, 시작 프로그램 등록

## 보안과 한계

- 위젯 토큰은 180일 JWT이며 현재 서버 측 즉시 폐기 목록은 없다. 유출 시 `JWT_SECRET` 교체 전까지
  만료를 기다려야 하므로 상용화 전 token id + revocation 저장소를 추가한다.
- MVP는 토큰을 Tauri WebView localStorage에 저장한다. 상용화 전 Windows Credential Manager 또는
  Tauri Stronghold로 이전한다.
- 플러그인 저자도 장기 제품에서는 Win32 로직을 앱 내부로 가져올 것을 권고한다. 플러그인 유지보수 상태와
  Windows Explorer 변경을 검토한 뒤 WorkerW 코드를 내재화한다.
- Windows 전용이다. macOS/Linux 동작은 ADR-0003의 후속 결정으로 남긴다.

## 결과

기존 Vanilla 웹 UI를 재사용하면서도 상주 리소스가 작은 데스크톱 앱을 빠르게 검증할 수 있다. 반면 Rust
1.93+와 Windows C++ 빌드 도구가 필요하고, 플러그인 및 토큰 저장 방식은 MVP 수준의 기술 부채로 남는다.
