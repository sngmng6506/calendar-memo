# Daymark Ops Console

Daymark는 날짜별 할 일을 빠르게 기록하고 완료 여부를 관리하는 Windows 중심 Electron 데스크톱 캘린더입니다. 바탕화면 뒤에 붙는 Desktop Mode, 오늘 할 일, OS 유휴 시간 기반 활동 분석, PostgreSQL 자동 동기화를 제공합니다.

## 핵심 기능

- 월간 캘린더에서 날짜별 task 작성·완료·이동
- Enter 중심의 빠른 입력과 task description
- 오늘 할 일 전용 화면
- 15분 단위 system-active-time analytics
- Windows WorkerW 기반 Desktop Mode와 일반 창 fallback
- 로컬 JSON 원자 저장, 자동 백업, 손상 파일 보존 및 복구
- record timestamp 충돌 처리와 version 기반 자동 동기화
- 단일 앱 인스턴스와 종료 전 저장 flush

## 실행과 검증

```powershell
npm install
npm run start
```

개발 모드:

```powershell
npm run dev
```

문법 검사와 저장·동기화·서버 경계·커밋 정책 테스트:

```powershell
npm run verify
```

Pull request와 `main`, `fix/**` push에서는 GitHub Actions가 PostgreSQL 16을 포함한 전체 검증을 실행합니다.

## Windows portable 패키지

.NET 8 SDK와 Node.js가 설치된 Windows에서 다음 명령을 실행합니다.

```powershell
npm ci
npm run package:win
```

테스트와 Desktop Mode helper 빌드가 성공하면 다음 결과가 생성됩니다.

```text
dist/Daymark-win32-x64/
dist/Daymark-<version>-win32-x64.zip
```

`v*` 태그 push 또는 수동 workflow 실행 시 Windows GitHub Actions가 같은 ZIP을 빌드합니다. 태그 빌드는 GitHub Release에도 자동 첨부됩니다. 현재 빌드는 portable 배포이며 설치 프로그램, code signing, 앱 내부 자동 업데이트는 포함하지 않습니다. 외부 공개 배포 전에는 인증서와 업데이트 정책을 별도로 결정해야 합니다.

## Agent 커밋 정책

Coding agent는 작업을 논리 단위별 커밋으로 나누며, 모든 비-merge 커밋에는 다음 항목이 필요합니다.

```text
<하나의 논리 변경을 설명하는 요약>

Why:
- 변경이 필요했던 구체적인 문제·위험·사용자 요구

Decision:
- 선택한 구현과 주요 trade-off 또는 배제한 대안

Verification:
- 수행한 검사와 테스트 (선택)
```

`npm install`은 `.gitmessage`와 `.githooks/commit-msg`를 설정합니다. 다시 적용하려면 `npm run setup:git`을 실행합니다. 상세 규칙은 [`AGENTS.md`](AGENTS.md)를 따릅니다.

## Desktop Mode

Windows 바탕화면 아이콘 뒤에 앱을 붙이려면 helper를 먼저 빌드합니다.

```powershell
npm run build:desktop-host
npm run start
```

helper가 없거나 WorkerW attach에 실패하면 앱은 bottom-window mode로 fallback합니다. Tray 메뉴에서 창 모드로 돌아갈 수 있습니다.

## 로컬 데이터

데이터는 Electron `userData/daymark-calendar` 아래에 저장됩니다.

```text
daymark-store.json       현재 저장소
daymark-store.json.bak   직전 정상 저장 백업
daymark-store.json.corrupted-<timestamp>  손상 감지 시 보존본
```

저장은 temporary file write → file `fsync` → backup → rename 순서로 수행됩니다. 여러 저장 요청은 queue에서 직렬화되고 오래된 renderer snapshot은 record timestamp로 병합됩니다.

두 번째 앱 실행은 기존 프로세스로 전환되어 두 프로세스가 같은 파일을 동시에 쓰지 않습니다. 창 닫기와 tray 종료 시 renderer가 현재 입력, 마지막 analytics 구간, persistence queue를 저장한 뒤 main process가 실제 종료합니다. 자세한 정책은 [`docs/DATA_SAFETY_AND_SYNC.md`](docs/DATA_SAFETY_AND_SYNC.md)를 참고합니다.

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
TRUST_PROXY=1
```

`TRUST_PROXY=1`은 Railway처럼 신뢰 가능한 reverse proxy가 `X-Forwarded-For`를 덮어쓰는 환경에서만 설정합니다.

```powershell
npm run server
```

서버 시작 시 `change_seq`와 deterministic tie-break column을 자동 생성·마이그레이션합니다. 기존 ISO timestamp cursor는 최초 새 동기화에서 `0`으로 해석되어 authoritative state를 다시 내려받고 record merge가 중복을 제거합니다.

데스크톱 앱 endpoint는 실행 환경에서 고정합니다.

```text
DAYMARK_SYNC_URL=https://your-app.up.railway.app
```

기존 설치에 저장된 `syncUrl`은 migration fallback으로 유지됩니다. Personal sync code는 최초 실행 시 생성되며 다른 PC에서 같은 code를 사용하면 동일 데이터를 공유합니다. 저장 변경은 약 0.8초 debounce 후 전송되고 다른 기기 변경은 1분마다 확인합니다.

### 동기화 안전성

- 업로드 대상은 server cursor와 기기 시각이 아니라 현재 record version과 `meta.syncAck`의 차이로 결정합니다.
- 업로드는 최대 1,000개씩 나누며 server는 limit 초과 요청을 일부 처리하지 않고 거부합니다.
- 다운로드는 account별 PostgreSQL advisory lock 아래 증가하는 `change_seq` cursor를 사용합니다.
- 다운로드는 page 단위로 반복하며 중간 실패 시 마지막 성공 cursor와 merge 결과를 저장합니다.
- 동일 timestamp에서는 client와 server가 같은 stable JSON tie-break를 사용하고 삭제가 우선합니다.
- 원격 HTTP는 거부하며 localhost 개발 환경만 HTTP를 허용합니다.
- Sync code는 DB에 raw value 대신 `HMAC-SHA256(SYNC_PEPPER, syncKey)`로 저장됩니다.

## 활동 분석

Analytics는 앱이 열린 시간을 그대로 더하지 않습니다. Electron `powerMonitor.getSystemIdleTime()`을 사용해 각 측정 구간에서 마지막 키보드·마우스 입력 이후의 idle 시간을 제외합니다. Desktop Mode로 계속 실행해도 실제 입력이 없는 시간은 활동 시간에 포함되지 않습니다.

## 구조

```text
electron/
  main.js                 single instance, safe close, tray, desktop helper IPC
  preload.js              context-isolated renderer bridge
  data-model.js           record merge, tombstone, version acknowledgement
  store.js                atomic local storage and recovery
  sync.js                 HTTPS client, chunk upload, paginated sync

web/
  app.js                  application orchestration and close flush
  tasks.js                task domain operations
  controllers/            persistence, sync, description, desktop controllers
  pages/                  calendar, date inspector, today, analytics, settings

server/
  sync-server.js          PostgreSQL sync API, sequence cursor, per-account lock

scripts/
  package-windows.ps1     portable Windows packaging

test/
  data-model.test.js
  store.test.js
  sync.test.js
  sync-server.test.js
  sync-server-postgres.test.js
  commit-policy.test.js
```

## 설계 원칙

1. 메모를 기능보다 우선하여 보호합니다.
2. renderer는 Node API에 직접 접근하지 않고 main process는 store IPC 형태를 검증합니다.
3. sync 충돌은 record timestamp로 처리하며 동일 timestamp는 stable JSON tie-break로 결정적으로 병합하고 삭제를 우선합니다.
4. upload dirty 상태는 record version acknowledgement로, download 진행은 server change sequence로 관리합니다.
5. 삭제는 tombstone으로 전파하고 서버 확인 후 30일이 지난 local tombstone만 정리합니다.
6. 서버는 account별 transaction을 직렬화하고 cursor 이후 변경분을 page 단위로 반환합니다.

## 관련 문서

- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- [`docs/DATA_SAFETY_AND_SYNC.md`](docs/DATA_SAFETY_AND_SYNC.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
