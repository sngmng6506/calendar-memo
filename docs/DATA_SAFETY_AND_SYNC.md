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

## 손상 감지와 복구

Primary JSON을 읽거나 parse하지 못하면 해당 파일을 즉시 덮어쓰지 않는다.

- 원본을 `.corrupted-<timestamp>`로 복사한다.
- 정상 `.bak`가 있으면 backup을 primary로 복구한다.
- backup도 읽을 수 없으면 빈 store를 생성하지만 corrupted copy는 유지한다.
- 복구 결과는 `settings.lastStoreRecovery`에 기록되어 Settings에서 확인할 수 있다.

## Record timestamp

각 sync 대상은 다음 우선순위로 timestamp를 가진다.

```text
updatedAt → lastSeenAt → createdAt → collection fallback
```

Task content, completion, date 이동, sort order 변경은 모두 `updatedAt`을 갱신해야 한다.

## 충돌 규칙

### 수정 대 수정

더 최신 timestamp의 payload가 이긴다. Timestamp가 정확히 같으면 stable JSON 문자열 비교를 사용해 모든 기기가 같은 결과를 선택한다.

### 수정 대 삭제

- `local.updatedAt > remote.deletedAt`: local record 유지
- `local.updatedAt <= remote.deletedAt`: 삭제 적용
- `new payload.updatedAt > tombstone.deletedAt`: payload로 복구
- 동일 timestamp에서는 삭제가 우선

### 삭제 전파

삭제는 배열에서 record를 제거하는 것만으로 끝내지 않고 다음 tombstone을 남긴다.

```json
{
  "collection": "tasks",
  "recordId": "...",
  "deletedAt": "2026-07-20T10:00:00.000Z"
}
```

서버 동기화가 완료되면 `syncedAt`이 추가된다. `syncedAt`이 있고 삭제 후 30일이 지난 local tombstone만 정리한다. 서버는 장기 오프라인 기기에 삭제를 전달하기 위해 tombstone을 유지한다.

## 증분 동기화

Client는 마지막 성공 cursor를 `settings.syncCursor`에 저장한다.

```text
upload: record.updatedAt > cursor 또는 아직 확인되지 않은 tombstone
download: server_updated_at > cursor and <= nextCursor
```

Server transaction 안에서 cursor를 정하고 upload batch를 반영한 뒤 해당 범위의 record를 반환한다. 따라서 같은 요청에서 업로드한 record도 확인 응답에 포함될 수 있다.

## 보안 경계

Sync key는 사용자 인증 계정 대신 사용하는 shared secret이다.

- 최소 32자
- UI의 secure key generator 권장
- 원격 서버는 HTTPS 필수
- 서버 DB에는 raw key 대신 `HMAC-SHA256(SYNC_PEPPER, syncKey)` 저장
- 서버는 request rate, body size, record count, collection, timestamp, payload size를 검증

이 방식은 개인용 sync에 적합한 단순 모델이다. 다중 사용자 서비스로 확장할 때는 계정 인증, key rotation, device revoke, audit log를 별도로 도입해야 한다.
