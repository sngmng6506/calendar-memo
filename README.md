# Daymark Ops Console

Daymark는 날짜별 할 일을 빠르게 기록하고 완료 여부를 관리하는 Windows 중심 Electron 데스크톱 캘린더입니다. 바탕화면 뒤에 붙는 Desktop Mode, 오늘 할 일, 활동 시간 분석, PostgreSQL 자동 동기화를 제공합니다.

## 핵심 기능

- 월간 캘린더에서 날짜별 task 작성·완료·이동
- Enter 중심의 빠른 입력과 task description
- 오늘 할 일 전용 화면
- 15분 단위 active-time analytics
- Windows WorkerW 기반 Desktop Mode와 일반 창 fallback
- 로컬 JSON 저장, 자동 백업, 손상 파일 보존 및 복구
- 변경 직후 자동 동기화와 timestamp 기반 최신 변경 우선 처리

## 실행

```powershell
npm install
npm run start
```

개발 모드에서는 renderer 변경 시 reload하고 Electron 프로세스 파일 변경 시 앱을 재시작합니다.

```powershell
npm run dev
```

## 검증

```powershell
npm run verify
```

`verify`는 모든 JavaScript 파일의 문법 검사와 저장·동기화·커밋 정책 단위 테스트를 실행합니다.

## Agent 커밋 정책

Coding agent는 작업을 하나의 큰 커밋으로 묶지 않고 **논리 단위별 커밋**으로 나눠야 합니다. 모든 비-merge 커밋에는 다음 항목이 필수입니다.

```text
<하나의 논리 변경을 설명하는 요약>

Why:
- 이 변경이 필요했던 구체적인 문제·위험·사용자 요구

Decision:
- 선택한 구현과 주요 trade-off 또는 배제한 대안

Verification:
- 수행한 검사와 테스트 (선택)
```

`npm install`은 `.gitmessage`와 `.githooks/commit-msg`를 자동 설정합니다. 설정을 다시 적용하려면 다음을 실행합니다.

```powershell
npm run setup:git
```

로컬 hook은 잘못된 메시지를 커밋 전에 막고, CI는 pull request의 모든 비-merge 커밋을 다시 검사합니다. `TBD`, `N/A`, `none`, 제목 반복 같은 형식적 내용은 허용되지 않습니다. 상세 작업 규칙은 [`AGENTS.md`](AGENTS.md)를 따릅니다.

## Desktop Mode

Windows 바탕화면 아이콘 뒤에 앱을 붙이려면 .NET 8 SDK로 helper를 먼저 빌드합니다.

```powershell
npm run build:desktop-host
npm run start
```

helper가 없거나 WorkerW attach에 실패하면 앱은 자동으로 bottom-window mode를 사용합니다. Tray 메뉴에서 언제든 창 모드로 돌아갈 수 있습니다.

## 로컬 데이터

데이터는 Electron `userData/daymark-calendar` 아래에 저장됩니다.

```text
daymark-store.json       현재 저장소
daymark-store.json.bak   직전 정상 저장 백업
daymark-store.json.corrupted-<timestamp>  손상 감지 시 보존본
```

저장은 임시 파일을 먼저 디스크에 기록한 뒤 rename하는 방식으로 수행됩니다. 여러 저장 요청은 queue에서 직렬화되며, 오래된 renderer snapshot이 들어와도 record timestamp를 기준으로 병합해 최신 task를 잃지 않도록 합니다.

복구 정책과 충돌 규칙은 [`docs/DATA_SAFETY_AND_SYNC.md`](docs/DATA_SAFETY_AND_SYNC.md)에 정리되어 있습니다.

## 동기화

서버 필수 환경 변수:

```text
DATABASE_URL=<PostgreSQL connection string>
SYNC_PEPPER=<32자 이상의 무작위 server secret>
PGSSLMODE=require
```

서버 선택 환경 변수:

```text
PORT=3000
SYNC_RATE_LIMIT=60
```

서버 실행:

```powershell
npm run server
```

데스크톱 앱은 사용자에게 서버 주소를 묻지 않습니다. 앱 실행 환경의 다음 값이 있으면 이를 고정 endpoint로 사용합니다.

```text
DAYMARK_SYNC_URL=https://your-app.up.railway.app
```

기존 설치에 이미 저장된 `syncUrl`이 있으면 마이그레이션 호환을 위해 fallback으로 계속 사용하므로 URL 입력란을 제거해도 기존 연결은 유지됩니다.

개인 sync code는 최초 실행 시 자동 생성됩니다. 다른 PC에서 같은 데이터를 쓰려면 Settings의 `PERSONAL SYNC CODE`를 복사해 동일하게 맞춥니다. 로컬 변경은 저장 완료 후 약 0.8초 동안 묶어 자동 전송하고, 다른 기기의 변경은 1분마다 확인합니다. 상단 원형 아이콘은 변경 대기, 동기화 중, 완료, 오류 상태를 표시하며 클릭하면 즉시 다시 동기화합니다.

원격 HTTP 주소는 거부되며, 개발용 `localhost`만 HTTP를 허용합니다. Sync code는 서버에서 HMAC-SHA256으로 변환되어 account key로 사용됩니다.

## 구조

```text
electron/
  main.js                 Electron lifecycle, window, tray, desktop helper IPC
  preload.js              context-isolated renderer bridge
  data-model.js           record merge, tombstone, conflict rules
  store.js                atomic local storage and recovery
  sync.js                 HTTPS client and incremental sync

web/
  app.js                  application orchestration
  tasks.js                task domain operations
  controllers/
    persistence.js        renderer save coalescing
    syncController.js     always-on sync scheduling and status
    descriptionEditor.js  task description editor behavior
    desktopController.js  desktop/window mode and resize flow
  pages/
    calendar.js
    dateInspector.js
    today.js
    analytics.js
    settings.js

server/
  sync-server.js          PostgreSQL incremental sync API

test/
  data-model.test.js
  store.test.js
  sync.test.js
  commit-policy.test.js
```

## 설계 원칙

1. 메모를 기능보다 우선하여 보호합니다.
2. renderer는 Node API에 직접 접근하지 않습니다.
3. sync 충돌은 record 단위 timestamp로 처리하며, 동일 timestamp는 결정적으로 병합합니다.
4. 삭제는 tombstone으로 전파하고 서버 확인 후 30일이 지난 로컬 tombstone만 정리합니다.
5. 서버는 cursor 이후 변경분만 반환하고, 업로드는 단일 batch upsert로 처리합니다.

## 관련 문서

- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md): 이번 안정화 작업의 계획과 완료 기준
- [`docs/DATA_SAFETY_AND_SYNC.md`](docs/DATA_SAFETY_AND_SYNC.md): 저장 복구와 sync conflict 상세
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): 모듈 책임과 데이터 흐름
