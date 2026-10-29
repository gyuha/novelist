<!-- forge-slug: v1-build-7of7 -->
<!-- task: 7 -->
<!-- part: 7/7 -->
# v1 구축 7/7 — 운영 배포·백업

> 범위만 적은 초안이다. 실행 전에 fg-ask로 슬라이스·완료 기준·TDD 여부를 다시 다듬는다(1번 결과로 생긴 실제 구조에 맞추기 위해). 실행 주체: Paseo 역할 팀.

## 목표 / 범위 밖
- 목표: 운영용 Docker Compose(web·api·Caddy, 볼륨에 SQLite·이미지), Caddy의 `/api` 분기와 HTTPS, Litestream 로컬 복제본, VPS 밖 PC·NAS로 가져가는 백업 pull 스크립트, 배포·복구 문서.
- 범위 밖: 객체 스토리지, 서버리스 배포

## 기준 문서
- 용어집: .forge/CONTEXT.md
- 결정 문서: docs/v1-decisions.md
- 관련 ADR: .forge/adr/261030-005014-separate-web-and-api.md
- 완료 정의(DoD): VPS에 배포된 상태에서 E2E 스모크가 통과하고, 백업에서 DB·이미지를 복원하는 리허설이 성공함 (다듬을 때 실행 가능한 명령으로 구체화)

## 작업 슬라이스
- [ ] S1. [backend] Dockerfile(web·api), docker-compose, Caddyfile, Litestream 설정, 백업 pull 스크립트 — 완료 기준: 로컬에서 compose up 후 스모크 통과
- [ ] S2. [qa] 배포 환경 대상 스모크와 CI 이미지 빌드 — 완료 기준: 배포 스모크 통과 (depends: S1)
