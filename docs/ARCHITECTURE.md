# Architecture

## Process boundary

### Electron main process

- OS window와 tray lifecycle 관리
- Windows desktop helper 실행
- local file I/O 독점
- remote sync request 수행
- renderer IPC 입력 검증 및 직렬화

### Preload

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` 상태에서 필요한 IPC 함수만 `window.daymark`로 공개한다. Event subscription은 반드시 unsubscribe 함수를 반환한다.

### Renderer

DOM rendering과 사용자 interaction만 담당한다. Local filesystem, PostgreSQL, child process에 직접 접근하지 않는다.

## Main-process modules

### `data-model.js`

순수 데이터 규칙이다. Electron이나 filesystem에 의존하지 않으므로 `node:test`에서 직접 검증한다.

- store normalization
- record timestamp
- payload merge
- tombstone merge
- stale deletion protection
- incremental record selection

### `store.js`

- canonical in-memory store
- concurrent save queue
- stale snapshot merge
- atomic write
- backup and corruption recovery

### `sync.js`

- HTTPS endpoint validation
- request timeout
- incremental upload body
- server response merge
- cursor update
- local tombstone acknowledgement and cleanup

## Renderer modules

### `app.js`

페이지 선택, task workflow, inspector orchestration을 담당한다.

### Controllers

- `persistence.js`: 빠르게 연속된 save를 coalesce하고 순차 실행
- `syncController.js`: 3분 주기 sync, manual sync, sync settings
- `desktopController.js`: Desktop Mode, auto-start, resize, tray callback
- `descriptionEditor.js`: description textarea 높이와 bullet indentation

### Pages

각 page는 전달받은 state selector와 action을 사용해 DOM을 만들며 storage나 IPC를 직접 다루지 않는다.

## Sync server

`sync_records`는 `(account_hash, collection, record_id)`를 primary key로 사용한다. Client record timestamp가 기존 timestamp 이상일 때만 upsert한다.

한 요청의 records는 `jsonb_to_recordset`으로 PostgreSQL에 전달해 개별 record별 network round trip을 제거한다.

## Verification layers

1. `node --check`: main, preload, server, renderer module 문법
2. `node --test`: 저장·병합·sync 순수 로직
3. Windows smoke test: WorkerW attach/detach, tray 복귀, auto-start
4. PostgreSQL smoke test: 두 client cursor와 delete/edit conflict
