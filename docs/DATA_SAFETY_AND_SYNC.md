# Data Safety and Sync

## 로컬 저장 순서

1. renderer의 저장 요청을 persistence controller가 합친다.
2. main process의 store queue가 요청을 하나씩 처리한다.
3. 현재 canonical store와 incoming snapshot을 record timestamp로 병합한다.
4. JSON을 고유한 temporary file에 쓴다.
5. file handle을 `fsync`한다.
6. 기존 정상 파일을 `.bak`에 복사한다.
7. temporary file을 primary store 이름으로 rename한다.

이 순서로 앱이 저장 도중 종료되어도 기존 primary 또는 backup이 남는다.

## 프로세스와 종료 안전성

Daymark는 `app.requestSingleInstanceLock()`으로 한 프로세스만 local store를 소유하도록 한다. 두 번째 실행은 새 store manager를 만들지 않고 기존 창을 활성화한다.

창 닫기, tray 종료, `app.quit()`은 즉시 프로세스를 끝내지 않는다.

1. main process가 renderer에 `app:prepare-close`를 보낸다.
2. renderer가 active input을 blur해 마지막 편집을 state에 반영한다.
3. analytics 마지막 구간과 persistence queue를 flush한다.
4. renderer가 `app:flush-complete`를 보낸다.
5. main process가 quit을 허용한다.

Renderer가 응답하지 못하는 비정상 상황에서는 5초 fallback 후 종료한다.

## 손상 감지와 복구

Primary JSON을 읽거나 parse하지 못하면 해당 파일을 즉시 덮어쓰지 않는다.

- 원본을 `.corrupted-<timestamp>`로 복사한다.
- 정상 `.bak`가 있으면 backup을 primary로 복구한다.
- backup도 읽을 수 없으면 빈 store를 생성하지만 corrupted copy는 유지한다.
- 복구 결과는 `settings.lastStoreRecovery`에 기록되어 Settings에서 확인할 수 있다.

## Record timestamp

각 sync 대상은 다음 우선순위로 conflict timestamp를 가진다.

```text
updatedAt → lastSeenAt → createdAt → collection fallback
```

Task content, completion, date 이동, sort order 변경은 모두 `updatedAt`을 갱신해야 한다.

## 충돌 규칙

### 수정 대 수정

더 최신 timestamp의 payload가 이긴다. Timestamp가 정확히 같으면 client와 server가 동일한 stable JSON 문자열을 C collation 순서로 비교해 모든 기기가 같은 결과를 선택한다. 삭제 marker는 가장 큰 값이므로 exact tie에서는 삭제가 우선한다.

### 수정 대 삭제

- `local.updatedAt > remote.deletedAt`: local record 유지
- `local.updatedAt <= remote.deletedAt`: 삭제 적용
- `new payload.updatedAt > tombstone.deletedAt`: payload로 복구
- 동일 timestamp에서는 삭제가 우선

### 삭제 전파

삭제는 배열에서 record를 제거하는 것만으로 끝내지 않고 tombstone을 남긴다.

```json
{
  "collection": "tasks",
  "recordId": "...",
  "deletedAt": "2026-07-20T10:00:00.000Z"
}
```

서버 동기화가 완료되면 `syncedAt`이 추가된다. `syncedAt`이 있고 삭제 후 30일이 지난 local tombstone만 정리한다. 서버는 장기 오프라인 기기에 삭제를 전달하기 위해 tombstone을 유지한다.

## Upload acknowledgement

Server cursor와 client record timestamp는 upload selection에 같이 사용하지 않는다. 기기 시간은 서버보다 느리거나 변경될 수 있기 때문이다.

각 local sync record는 collection, record ID, timestamp, payload 또는 deletion을 stable JSON으로 만들고 SHA-256 version을 계산한다. `meta.syncAck`에는 서버가 authoritative response로 확인한 version만 저장한다.

```text
upload pending = current record version != acknowledged version
```

같은 timestamp에서 payload가 달라져도 version이 달라지므로 다시 업로드된다. Sync 중 오래된 renderer snapshot이 저장되어도 더 높은 `syncAckRevision`이 acknowledgement map을 보호한다.

## Download cursor

Server는 `sync_change_seq` sequence와 `sync_records.change_seq`를 사용한다. 같은 account의 sync transaction은 advisory lock으로 직렬화한다.

```text
download = change_seq > cursor
```

일반 cursor page는 최대 10개 record를 반환한다. `hasMore`가 있으면 client가 cursor를 전진시키며 다음 page를 요청한다. 작은 page는 개별 payload가 큰 경우에도 응답 메모리와 JSON 크기를 제한하기 위한 선택이다. Submitted record의 authoritative state는 cursor page와 별도로 같은 응답에 포함될 수 있다.

기존 ISO timestamp cursor는 migration 시 `0`으로 해석되어 한 번 전체 authoritative state를 다시 받는다.

## 대량 전송

Client는 pending upload를 다음 두 제한 안에서 나눈다.

```text
records <= 1,000
serialized records <= 3.5 MB
```

Server request body limit은 5 MB이며 record 하나는 최대 256 KB다. Server는 request record가 limit를 넘으면 `413`을 반환하며 일부만 조용히 처리하지 않는다. 중간 round가 실패하면 마지막 성공 cursor와 merge 결과를 local store에 저장해 다음 실행에서 이어간다.

## 보안 경계

Sync key는 사용자 인증 계정 대신 사용하는 shared secret이다.

- 최소 32자
- UI의 secure key generator 권장
- 원격 서버는 HTTPS 필수
- 서버 DB에는 raw key 대신 `HMAC-SHA256(SYNC_PEPPER, syncKey)` 저장
- 서버는 request rate, body size, record count, record ID/payload ID, collection, timestamp, payload size를 검증
- `X-Forwarded-For`는 `TRUST_PROXY=1`인 신뢰 가능한 proxy 환경에서만 사용
- rate bucket은 만료 후 cleanup

이 방식은 개인용 sync에 적합한 단순 모델이다. 다중 사용자 서비스로 확장할 때는 계정 인증, key rotation, device revoke, audit log를 별도로 도입해야 한다.
