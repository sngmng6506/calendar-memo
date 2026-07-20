# Calendar Memo 안정화 구현 계획

## 목표

기능 추가 전에 다음 조건을 만족하는 데이터 안전 기반을 만든다.

- 저장 중 종료되더라도 정상 JSON 또는 복구 가능한 백업이 남는다.
- 동시에 발생한 저장 요청이 task를 되돌리거나 누락시키지 않는다.
- 여러 기기에서 수정·삭제가 충돌해도 최신 record가 일관되게 남는다.
- 데이터가 증가해도 매번 전체 record를 주고받지 않는다.
- 핵심 규칙을 UI 없이 자동 테스트할 수 있다.

## 작업 단계와 완료 상태

### 1. 저장 계층 분리 및 원자적 저장 — 완료

- `electron/store.js` 추가
- temp write → fsync → backup → rename 순서 적용
- save queue로 파일 쓰기 직렬화
- renderer의 오래된 전체 snapshot을 record timestamp 기반으로 병합

### 2. 손상 파일 복구 — 완료

- JSON parse/read 실패 시 원본을 `.corrupted-<timestamp>`로 보존
- `.bak`가 정상이라면 자동 복구
- backup도 사용할 수 없으면 새 store를 만들되 손상본은 삭제하지 않음
- Settings에 recovery notice 표시

### 3. conflict-safe sync model — 완료

- `electron/data-model.js`로 payload/tombstone 병합 규칙 통합
- 최신 local 수정이 과거 remote 삭제보다 우선
- 최신 삭제는 과거 record 제거
- 삭제 이후 더 최신 수정은 record 복구 허용
- 동일 timestamp는 stable JSON 비교로 결정적 수렴

### 4. tombstone lifecycle — 완료

- 중복 tombstone을 최신 삭제 시각으로 합침
- 서버가 삭제를 확인한 tombstone에 `syncedAt` 기록
- 서버 확인 완료 후 30일이 지난 로컬 tombstone만 정리
- 서버 tombstone은 장기 오프라인 기기를 위해 자동 삭제하지 않음

### 5. 증분·batch sync — 완료

- client cursor 이후 변경 record만 업로드
- server cursor 이후 변경 record만 다운로드
- PostgreSQL `jsonb_to_recordset` 기반 단일 batch upsert
- collection whitelist, record/body size 제한, timestamp 검증

### 6. sync 보안 기본값 — 완료

- 원격 HTTPS 강제, localhost만 HTTP 허용
- 32자 이상 sync key
- 256-bit key 생성 UI
- `SYNC_PEPPER` 기반 HMAC account hash
- IP 단위 rate limit과 15초 client timeout

### 7. renderer 모듈화 — 완료

- persistence, sync, description editor, desktop controller 분리
- settings page 분리
- `app.js`는 page orchestration과 task workflow 중심으로 축소
- preload subscription이 unsubscribe 함수를 반환하도록 변경

### 8. 테스트·문서화 — 완료

- 저장 복구와 concurrent snapshot merge 테스트
- stale/new deletion conflict 테스트
- tombstone cleanup과 incremental sync 테스트
- HTTPS endpoint 및 cursor sync 테스트
- README, architecture, data safety 문서 갱신

## 완료 기준

```powershell
npm run verify
```

위 명령이 통과하고, Desktop Mode를 제외한 renderer 시작 흐름이 기존 페이지 API와 호환되면 완료로 판단한다. Desktop Mode는 Windows + helper 실행 환경에서 수동 smoke test가 추가로 필요하다.
