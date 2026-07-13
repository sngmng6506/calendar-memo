# API 계약

> 서버 구현: `server.js`. 모든 `/api/*`는 JSON. 인증은 httpOnly 쿠키 `session`(JWT, 30일).
> `requireUser` 표시된 엔드포인트는 세션 없으면 `401 { error: "unauthorized" }`.
> DB 미설정 시 보드 계열은 `503 { error: "db not configured" }`.

## 인증·설정

### `GET /api/config`
프론트가 GIS 초기화에 쓸 값.
```json
{ "googleClientId": "…", "syncEnabled": true }
```
`syncEnabled`는 `pool && GOOGLE_CLIENT_ID`가 모두 있을 때만 `true`.

### `POST /api/auth/google`
구글 ID 토큰 검증 → 세션 쿠키 발급.
- 요청: `{ "credential": "<google id token>" }`
- 응답: `{ "user": { "email", "name" }, "plan": "free", "features": {…} }`
- 실패: `400 missing credential` / `500 google not configured` / `401 invalid token`

### `POST /api/auth/logout`
세션 쿠키 삭제. → `{ "ok": true }`

### `GET /api/me`
현재 세션 + plan/feature 플래그. 미로그인 시 `user: null`.
```json
{ "user": { "email", "name" } | null,
  "plan": "free",
  "features": { "manualSync": true, "autoSync": false, "widgetAutoRefresh": false } }
```

## 보드 (requireUser)

### `GET /api/board`
사용자 보드 + 서버 버전(epoch ms). 보드 없으면 `board: null`.
```json
{ "board": { … normalized … } | null, "updatedAt": 1730000000000 | null }
```
`board.updatedAt`은 DB `updated_at` 컬럼값으로 맞춰져 내려온다(컬럼이 권위).

### `PUT /api/board`
보드 저장(업서트) + **낙관적 잠금**.
- 요청: `{ "board": { … }, "baseUpdatedAt": 1730000000000 }`
  - `baseUpdatedAt` = 클라이언트가 마지막으로 읽은 서버 버전. 생략 시(숫자 아님) 잠금 검사 없이 강제 저장.
- 정상: `{ "ok": true, "updatedAt": <새 서버 버전> }`
- **충돌**: 서버 현재 버전 > `baseUpdatedAt`이면 `409`:
  ```json
  { "error": "conflict", "serverUpdatedAt": <ms>, "board": { … 서버 최신본 … } }
  ```
  클라이언트는 이 응답으로 `reconcileWithServer`를 다시 돌린다.
- 검증 실패: `400 invalid board`

## 위젯 요약 (requireUser)

계산은 `core/board-metrics.js`가 담당. 위젯은 결과만 렌더.

### `GET /api/widget/today?date=YYYY-MM-DD`
`date` 생략 시 오늘(Asia/Seoul).
```json
{ "summary": { "date", "workload", "condition", "status", "items": [ { "id","name","fixed","workload" } ] } }
```

### `GET /api/widget/range?start=YYYY-MM-DD&days=30`
`days`는 1–120으로 clamp.
```json
{ "summary": { "start", "days", "dates": [ { "date","workload","condition","status","items","milestones" } ], "tasks": [ … ] } }
```

## 정적 서빙

- `/api/*` 미매칭 → `404 { error: "not found" }`.
- 그 외 경로 → SPA 폴백으로 `index.html`.
- 차단: `/server.js`, `/package.json`, `/package-lock.json`, `/.env`, `/.env.example`,
  `/.gitignore`, `/node_modules/*` → `404`. 추가로 `dotfiles: "ignore"`.

## 위젯/데스크톱 클라이언트를 위한 메모

데스크톱 위젯(Tauri)은 위 위젯 요약 API를 쓰되, **웹 세션 쿠키에 의존하지 말 것**.
위젯 전용 인증 방식은 [`adr/0003-desktop-widget-tauri.md`](./adr/0003-desktop-widget-tauri.md)에서
결정한다(미해결 항목).
