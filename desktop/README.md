# Windows 데스크톱 타임라인

웹앱 데이터를 읽어 Windows 바탕화면의 아이콘 뒤(WorkerW 레이어)에 붙이는 Tauri v2 클라이언트입니다.
메인 화면은 목표 × 날짜 타임라인만 보여주며, 날짜별 컨디션은 바로 기록할 수 있습니다. 업무량·컨디션
그래프는 상단 메뉴에서 열 때만 표시합니다.

## 준비

- Node.js 18+
- Rust 1.93+
- Visual Studio Build Tools의 Desktop development with C++
- 서버가 배포되어 있고 Google 로그인/DB 동기화가 설정되어 있어야 함

## 연결

1. 웹앱에서 Google 로그인합니다.
2. 같은 서버의 `/desktop-setup.html`을 열어 위젯 토큰을 발급합니다.
3. 데스크톱 앱 설정에 서버 주소와 토큰을 붙여넣습니다.

토큰 권한은 `widget:read`, `energy:write`로 제한되고 180일 후 만료됩니다. 현재 MVP는 토큰을 Tauri
WebView의 localStorage에 저장합니다. 상용화 단계에서는 OS 자격 증명 저장소로 옮겨야 합니다.

## 실행

```powershell
cd desktop
npm install
npm run tauri dev
```

릴리스 빌드:

```powershell
npm run tauri build
```

## 창 동작

- 설정이 완료되어 있으면 시작 시 `tauri-plugin-wallpaper`의 `attach("main")`을 호출합니다.
- `일반 창으로 분리` 버튼으로 `detach("main")`할 수 있습니다.
- 플러그인은 Windows WorkerW 방식의 검증용 의존성입니다. 장기 배포 시 Win32 코드를 앱 내부로
  가져오는 방안을 ADR-0004에 따라 재검토합니다.
