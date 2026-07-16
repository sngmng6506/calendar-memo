# AGENTS.md

Daymark는 현재 Windows 전용 데스크톱 앱이다. 빠르게 수정하고 실제 화면에서 확인하는 짧은 피드백 주기를 우선한다.

## 작업 원칙

- 요청한 범위만 작게 수정한다.
- 기존 데이터와 핵심 동작을 의도 없이 깨뜨리지 않는다.
- 변경과 직접 관련된 테스트만 실행한다.
- DB, WorkerW, 저장 구조 변경 때만 전체 검사를 실행한다.
- README는 사용법이 달라질 때만 수정한다.
- DB, API 키, 캐시, 빌드 결과는 커밋하지 않는다.

## 기본 검증

일반 수정:

```bash
python -m compileall src
python -m unittest <관련 테스트 모듈>
```

DB, WorkerW, 릴리스 변경:

```bash
python scripts/check.py
```

CI는 Windows Python 3.12만 사용한다.

## 커밋 규칙

하나의 커밋에는 가능한 한 하나의 논리적 변경을 담는다.

```text
feat: add calendar interaction
fix: preserve desktop opacity
chore: simplify CI
```

커밋 본문에는 변경 이유와 결정을 짧게 남긴다.

```text
Why: 사용자가 겪은 문제 또는 기존 구조의 한계
Decision: 적용한 해결 방식과 중요한 선택
```

필요 이상의 테스트, 문서, 추상화는 추가하지 않는다.
