# API 계약

> 서버 구현: `server.js`. 모든 `/api/*`는 JSON. 웹 인증은 httpOnly 쿠키 `session`(JWT, 30일).
> 데스크톱 위젯은 `Authorization: Bearer <widget token>`을 사용한다.

## 인증·설정

### `GET /api/config`

프론트가 GIS 초기화에 쓸 값.

```json
{ "googleClientId": "…", "syncEnabled": true }
```

`syncEnabled`는 `pool && GOOGLE_CLIENT_ID`가 모두 있을 때만 `true`.

### `POST /api/auth/google`

구글 ID 토큰 검증 → 웹 세션 쿠키 발급.

- 요청: `{ "credential": "<google id token>" }`
- 응답: `{ "user": { "email", "name" }, "plan": "free", "features": {…} }`
- 실패: `400 missing credential` / `500 google not configured` / `401 invalid token`

### `POST /api/auth/logout`

세션 쿠키 삭제. → `{ "ok": true }`

### `GET /api/me`

현재 웹 세션 + plan/feature 플래그. 미로그인 시 `user: null`.

```json
{
  "user": { "email": "…", "name": "…" },
  "plan": "free",
  "features": {
    "manualSync": true,
    "autoSync": false,
    "widgetAutoRefresh": false
  }
}
```

## 데스크톱 위젯 인증

### `POST /api/widget/token` — 웹 세션 필요

로그인한 사용자의 데스크톱 연결 토큰을 발급한다. 토큰은 180일 JWT이고 권한은 일정 읽기와 컨디션
quick-write로 제한된다.

```json
{
  "token": "<jwt>",
  "scopes": ["widget:read", "energy:write"],
  "expiresAt": 1780000000000
}
```

브라우저용 발급 화면은 `/desktop-setup.html`이다.

## 보드 — 웹 세션 필요

### `GET /api/board`

사용자 보드 + 서버 버전(epoch ms). 보드 없으면 `board: null`.

```json
{ "board": { "…": "normalized" }, "updatedAt": 1730000000000 }
```

`board.updatedAt`은 DB `updated_at` 컬럼값으로 맞춰져 내려온다.

### `PUT /api/board`

보드 전체 저장(업서트) + 낙관적 잠금.

- 요청: `{ "board": { … }, "baseUpdatedAt": 1730000000000 }`
- 정상: `{ "ok": true, "updatedAt": <새 서버 버전> }`
- 충돌: 서버 현재 버전 > `baseUpdatedAt`이면 `409`와 서버 최신본 반환
- 검증 실패: `400 invalid board`

## 위젯 요약 — 웹 세션 또는 위젯 토큰

Tauri origin(`tauri://localhost`, `http(s)://tauri.localhost`)과 로컬 Vite 개발 origin에 한해 CORS를
허용한다. 계산은 `core/board-metrics.js`가 담당한다.

### `GET /api/widget/today?date=YYYY-MM-DD`

`date` 생략 시 오늘(Asia/Seoul).

```json
{
  "summary": {
    "date": "2026-07-13",
    "workload": 50,
    "condition": { "value": 80, "type": "actual" },
    "status": "balanced",
    "items": [
      {
        "id": "…",
        "name": "…",
        "fixed": false,
        "companyProject": false,
        "includedInTotal": true,
        "workload": 25
      }
    ]
  },
  "updatedAt": 1730000000000
}
```

### `GET /api/widget/range?start=YYYY-MM-DD&days=30`

`days`는 1–120으로 clamp한다.

```json
{
  "summary": {
    "start": "2026-07-13",
    "days": 14,
    "dates": [
      { "date": "…", "workload": 0, "condition": {}, "status": "…", "items": [], "milestones": [] }
    ],
    "tasks": []
  },
  "updatedAt": 1730000000000
}
```

### `PATCH /api/widget/energy` — `energy:write`

보드 전체를 덮어쓰지 않고 `energy[date]`만 Postgres JSONB에 부분 병합한다.

- 요청: `{ "date": "2026-07-13", "value": 80 }`
- 범위: `value` 0–120
- 응답: `{ "ok": true, "updatedAt": <ms>, "summary": <해당 날짜 요약> }`
- 실패: `400 invalid energy` / `401 unauthorized` / `403 forbidden`

## 공휴일 계산

서버 시작 시 `holidays/<연도>.js` 파일을 로드하여 `BoardCalendar`에 등록한다. 회사 업무 고정 행은
토·일요일뿐 아니라 등록된 한국 공휴일에도 자동 업무량을 발생시키지 않는다. 명시적 날짜 기록이 있으면
공휴일에도 그 기록은 표시한다.

## 정적 서빙

- `/api/*` 미매칭 → `404 { "error": "not found" }`
- 그 외 경로 → `index.html`
- 차단: 서버/환경/package 파일, `/node_modules/*`, `/desktop/*`, `/test/*`, `/scripts/*`
