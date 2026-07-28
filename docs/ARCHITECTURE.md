# Architecture

## Process boundary

### Electron main process

- OS window와 tray lifecycle 관리
- single-instance lock으로 중복 프로세스 방지
- 종료 전에 renderer flush를 요청하고 완료 응답 후 실제 quit
- Windows desktop helper 실행
- local file I/O 독점
- remote sync request 수행
- renderer store IPC 형태 검증
- OS system idle time 제공

### Preload

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` 상태에서 필요한 IPC 함수만 `window.daymark`로 공개한다. Event subscription은 반드시 unsubscribe 함수를 반환한다. 종료 handshake도 preload의 좁은 event/send API만 통과한다.

### Renderer

DOM rendering과 사용자 interaction만 담당한다. Local filesystem, PostgreSQL, child process에 직접 접근하지 않는다. 종료 요청을 받으면 active editor를 blur하고 analytics와 persistence queue를 flush한 뒤 main process에 완료를 알린다.

## Main-process modules

### `data-model.js`

순수 데이터 규칙이다. Electron이나 filesystem에 의존하지 않으므로 `node:test`에서 직접 검증한다.

- store normalization
- record timestamp와 deterministic conflict
- payload/tombstone merge
- stale deletion protection
- record-version acknowledgement
- pending upload selection

### `store.js`

- canonical in-memory store
- concurrent save queue
- stale snapshot merge
- sync acknowledgement revision 보호
- atomic write
- backup and corruption recovery

### `sync.js`

- HTTPS endpoint validation
- request timeout
- version 기반 pending upload
- 1,000개 단위 upload chunk
- paginated download loop
- server response merge와 acknowledgement
- partial failure cursor 저장
- local tombstone cleanup

## Renderer modules

### `app.js`

페이지 선택, task workflow, inspector orchestration, controlled shutdown flush를 담당한다.

### Controllers

- `persistence.js`: 빠르게 연속된 save를 coalesce하고 순차 실행
- `syncController.js`: 변경 후 debounce sync, 1분 주기 poll, manual sync, visible status
- `desktopController.js`: Desktop Mode, auto-start, resize, tray callback
- `descriptionEditor.js`: description textarea 높이와 bullet indentation

### Pages

각 page는 전달받은 state selector와 action을 사용해 DOM을 만들며 storage나 IPC를 직접 다루지 않는다. Analytics는 main process가 제공한 system idle time으로 실제 활동 구간만 기록한다.

## Sync server

`sync_records`는 `(account_hash, collection, record_id)`를 primary key로 사용한다. Client record timestamp가 더 최신할 때 upsert하며, 동일 timestamp에서는 stable JSON tie-break가 큰 payload가 이기고 삭제가 최우선이다.

각 insert/update는 `change_seq`를 받는다. 동일 account의 sync transaction은 PostgreSQL transaction advisory lock으로 직렬화되므로 cursor 순서와 commit 순서가 어긋나지 않는다. Server는 `change_seq > cursor`를 page 단위로 반환하고 submitted record의 authoritative state도 함께 반환한다.

한 요청의 records는 `jsonb_to_recordset`으로 PostgreSQL에 전달한다. Record limit를 넘으면 일부를 자르지 않고 요청 전체를 거부한다.

## Verification layers

1. `node --check`: main, preload, server, renderer module 문법
2. `node --test`: 저장·병합·sync client·sync server boundary·commit policy
3. PostgreSQL CI: 두 client pagination과 concurrent sync serialization
4. Windows smoke test: single instance, close flush, WorkerW attach/detach, tray 복귀, auto-start
5. Windows package workflow: verify → desktop helper build → portable ZIP artifact
