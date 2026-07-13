# 데이터 모델 · 동기화

> 스키마 구현: `core/board-schema.js`. 계산: `core/board-metrics.js`.
> localStorage 키: `schedule-wave-board`. 서버 저장: Postgres `boards` (사용자당 1행 JSONB).

## 보드 스키마

```
BOARD_STATE {
  tasks         array    목표 목록
  energy        object   날짜(YYYY-MM-DD) → 컨디션 값(0–120)
  taskOrderMode string   "due" | "manual"
  updatedAt     number   로컬 편집 시각(epoch ms). 동기화 충돌 감지용
  schemaVersion number   현재 1
}

TASK {
  id             string
  name           string
  start / end    string   YYYY-MM-DD
  entries        object   날짜 → DATE_ENTRY
  recurring      object?  정기 일정 설정
  completed      boolean?
  parentId       string?  회사 프로젝트가 속한 상위
  fixed          boolean? 고정 "회사 업무" 행(id = "company-work")
  companyProject boolean? 회사 프로젝트 그룹
  weight/hours   number?  기본 업무량
}

DATE_ENTRY {
  milestone     boolean
  progressDelta number   진척률 증감(%)
  workload      number   그날 업무량(비우면 목표 기본값 사용)
  note          string
}

ENERGY: energy[date] = number (0–120)
```

## 정규화 (`normalizeBoard`)

로드·저장 양쪽에서 통과하는 방어 계층. 하는 일:
- `tasks` 배열, `energy` 객체, `taskOrderMode`, `updatedAt`(기본 0), `schemaVersion` 보장.
- 고정 "회사 업무" 태스크(`company-work`)를 항상 맨 앞에 존재하도록 보정.
- `taskOrderMode !== "manual"`이면 종료일 임박순 정렬(고정·회사 프로젝트 우선).
- 레거시 샘플 보드 감지(`isLegacySample`)로 예시 데이터 오인 저장 방지.

> 스키마 진화 시: 단계별 변환을 `normalizeBoard`(또는 프론트 `migrateState`)에 **비파괴적으로**
> 추가하고 `SCHEMA_VERSION`을 올린다.

## 업무량·컨디션 계산 (`board-metrics.js`)

- **업무량**: `소요 시간 / 12시간 × 100`(%). 날짜 셀에 직접 입력값이 있으면 그 값 우선.
  축은 컨디션과 맞춰 0–120%로 표시, 초과분은 천장 클램프.
- **회사 업무**: 평일이면 기록이 없어도 업무량에 반영. 회사 프로젝트 업무량은 회사 업무에 포함.
- **컨디션 보간**: 기록 사이는 시간 가중(지수 감쇠 `tau=3.5`) 추정. 마지막 기록 이후는
  기준선 90 + 최근 기울기 + 감쇠 파형으로 예측(forecast). 값은 0–120 클램프.

## 동기화 모델

**단위: 보드 전체.** 로컬·서버 각각 `updatedAt`을 가지며, **더 최신인 쪽을 채택**한다.

### 규칙 (프론트 `reconcileWithServer`)
1. `server.updatedAt > local.updatedAt` → 서버 채택(`applyServerBoard`, 로컬 덮어씀).
2. 그 외(로컬 최신·동률·서버 없음) → 로컬을 서버로 push.

### 낙관적 잠금 (서버 `PUT /api/board`)
- 클라이언트가 `baseUpdatedAt`(마지막으로 읽은 서버 버전)을 보낸다.
- 서버 현재 `updated_at` > `baseUpdatedAt`이면 저장하지 않고 `409` + 서버 최신본 반환.
- 클라이언트는 409를 받으면 반환된 보드로 다시 `reconcileWithServer`.

### 왜 이렇게? / 한계
- 근거·대안 검토: [`adr/0002-board-sync-optimistic-locking.md`](./adr/0002-board-sync-optimistic-locking.md).
- **한계**: 이것은 필드 단위 병합이 아니다. 두 기기가 서로 다른 목표를 **동시에** 편집하면
  나중 저장이 이긴 쪽 보드 전체를 채택하므로 진 쪽 편집이 유실될 수 있다.
  free 플랜은 수동 동기화라 이 창이 매우 좁다. auto-sync를 유료로 켤 때 필드 병합/CRDT를 재검토한다.

## 검증 시나리오 (동기화 변경 시 필수)

| 케이스 | 로컬 updatedAt | 서버 updatedAt | 기대 |
|--------|---------------|---------------|------|
| 로컬 최신 | 2000 | 1000 | push (덮어쓰지 않음) |
| 서버 최신 | 1000 | 2000 | apply 서버 |
| 동률 | 1500 | 1500 | push (로컬 유지) |
| 레거시 로컬 | 0 | 1000 | apply 서버 |
| 서버 시간 없음 | 3000 | null | push |
