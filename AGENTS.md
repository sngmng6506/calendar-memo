# AGENTS.md

Daymark는 빠르게 수정하고 화면에서 확인하는 작은 데스크톱 앱이다. 과도한 명세와 선행 문서 작업보다 실제 동작과 짧은 피드백 주기를 우선한다.

## 작업 원칙

- 요청한 범위만 작게 수정한다.
- 기존 데이터와 핵심 동작을 의도 없이 깨뜨리지 않는다.
- 변경과 직접 관련된 테스트만 실행한다.
- 큰 구조 변경이나 데이터 마이그레이션이 있을 때만 전체 테스트를 실행한다.
- README와 별도 명세는 사용법이 달라질 때만 수정한다.
- DB, API 키, 캐시, 빌드 결과는 커밋하지 않는다.

## 기본 검증

일반적인 UI·문구 수정:

```bash
python -m compileall src
python -m unittest <관련 테스트 모듈>
```

릴리스, 저장소 구조 변경, DB 또는 WorkerW 변경:

```bash
python scripts/check.py
```

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
