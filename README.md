# Daymark Ops Console

Daymark는 날짜별 할 일을 빠르게 기록하고 완료 여부를 관리하는 Windows 중심 Electron 데스크톱 캘린더입니다. 바탕화면 뒤에 붙는 Desktop Mode, 오늘 할 일, 활동 시간 분석, 선택적 PostgreSQL 동기화를 제공합니다.

## 핵심 기능

- 월간 캘린더에서 날짜별 task 작성·완료·이동
- Enter 중심의 빠른 입력과 task description
- 오늘 할 일 전용 화면
- 15분 단위 active-time analytics
- Windows WorkerW 기반 Desktop Mode와 일반 창 fallback
- 로컬 JSON 저장, 자동 백업, 손상 파일 보존 및 복구
- 여러 기기 간 증분 동기화와 timestamp 기반 충돌 처리

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

`verify`는 모든 JavaScript 파일의 문법 검사와 저장·동기화 단위 테스트를 실행합니다.

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

## 동기화 서버

필수 환경 변수:

```text
DATABASE_URL=<PostgreSQL connection string>
SYNC_PEPPER=<32자 이상의 무작위 server secret>
PGSSLMODE=require
```

선택 환경 변수:

```text
PORT=3000
SYNC_RATE_LIMIT=60
```

서버 실행:

```powershell
npm run server
```

앱 Settings에서 다음을 설정합니다.

- `SYNC URL`: 배포된 서버의 HTTPS 주소
- `SYNC KEY`: 최소 32자. `GENERATE SECURE KEY` 버튼 사용 권장

원격 HTTP 주소는 거부되며, 개발용 `localhost`만 HTTP를 허용합니다. Sync key는 서버에서 HMAC-SHA256으로 변환되어 account key로 사용됩니다.

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
    syncController.js     sync scheduling and settings
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
