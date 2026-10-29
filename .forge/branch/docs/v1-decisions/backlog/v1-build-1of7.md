<!-- forge-slug: v1-build-1of7 -->
<!-- task: 1 -->
<!-- part: 1/7 -->
<!-- priority: high -->
<!-- tdd: off -->
# v1 구축 1/7 — 기반 (모노레포·DB 파이프라인·API/웹 골격·디자인 명세·CI)

> 실행 주체: Paseo 역할 팀(오케스트레이터가 슬라이스를 역할별로 넘김). fg-run으로 실행하지 않는다.
> 선행 작업(0번, 이 계획 밖): `.agents/team.json` 역할 메모를 docs/v1-decisions.md에 맞게 고치고, API 계약 규칙을 "frontend는 packages/shared와 apps/api의 `AppType` 타입만 참조"로 바꾸고, 루트 설정 파일을 backend가 맡는 예외를 넣는다.

## 목표 / 범위 밖
- 목표: 이후 2~7번 부분 계획이 기능을 붙일 수 있는 실행 가능한 골격을 만든다. 웹 → `/api` → SQLite까지 한 번 관통하고, CI가 검사·빌드·E2E 스모크를 돌린다. v1 전체 ERD와 화면 명세를 미리 설계한다.
- 범위 밖: 도메인 테이블 생성(각 부분 계획에서 추가), 인증, `packages/ai`, 운영용 Docker·Caddy·Litestream(7번), 실제 기능 화면 구현.

## 기준 문서
- 용어집: .forge/CONTEXT.md — 회원, 관리자, 소설, 메모, 주석, AI 참고 메모, 캐릭터, 삽화, 참조 이미지, 챕터 요약, AI 초안
- 관련 ADR: .forge/adr/261030-005014-separate-web-and-api.md, .forge/adr/261030-004647-tiptap-json-body.md, .forge/adr/261030-004034-characters-separate-from-memos.md
- 결정 문서: docs/v1-decisions.md
- 이번 그릴링에서 정한 것: pnpm workspaces만(Turborepo 없음) · Drizzle + better-sqlite3 · Biome · Vitest(단위)·Playwright(E2E) · Node 24 LTS 고정(.nvmrc + engines) · packages/shared에는 Zod 스키마·공용 타입만, web은 apps/api의 `AppType` 타입만 import · 브라우저는 같은 출처 `/api/*`로 접속(개발: Next.js rewrites, 운영: Caddy) · 1번은 테이블 없이 마이그레이션 파이프라인 + ERD 문서만
- 완료 정의(DoD):
  1. `pnpm install --frozen-lockfile && pnpm check && pnpm typecheck && pnpm test && pnpm build` → 종료 코드 0
  2. 빈 DB 경로로 `pnpm --filter @novelist/db migrate` → 종료 코드 0
  3. `for e in users sessions novels chapters chapter_snapshots chapter_summaries memos annotations characters character_reference_images illustrations ai_usage_logs; do grep -q "$e" packages/db/SCHEMA.md || echo "missing $e"; done` → 출력 없음
  4. design/DESIGN.md에 화면 9종(로그인·가입, 승인 대기, 관리자, 소설 목록, 챕터 목록, 에디터, 주석, 삽화, 리더 뷰)과 앱 셸 명세가 모두 섹션으로 있음(오케스트레이터가 읽고 확인)
  5. `pnpm e2e` → 스모크 2개 통과(홈에 health 정상 표시 · rewrites 경유 SSE 이벤트가 한꺼번에가 아니라 시간차를 두고 도착)
  6. GitHub Actions 워크플로가 이 작업의 PR에서 성공
  - 작성 시점 사전 상태(2026-10-30 측정): 저장소에는 README.md와 docs/만 있고 package.json이 없음 — `pnpm check`가 `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`로 실패. 1~6 모두 미충족 상태에서 시작(이미 통과하는 항목 없음).

## 작업 슬라이스
- [ ] S1. [backend] 루트 스캐폴드 — `pnpm-workspace.yaml`(apps/*, packages/*), 루트 package.json 스크립트(`check`·`typecheck`·`test`·`build`·`e2e`·`dev`), `biome.json`, `tsconfig.base.json`, `.nvmrc`(24), `engines.node`(>=24 <25), 루트 `.gitignore`(node_modules, .next, dist, *.db, .env*) — 완료 기준: `pnpm install && pnpm check && pnpm typecheck` 종료 코드 0
- [ ] S2. [backend] `packages/shared`(@novelist/shared) — Zod 의존성, health 응답 스키마와 타입 내보내기 — 완료 기준: `pnpm --filter @novelist/shared typecheck` 종료 코드 0 (depends: S1)
- [ ] S3. [backend] `packages/db`(@novelist/db) — better-sqlite3 연결(WAL, `foreign_keys=ON`, 경로는 `DATABASE_PATH` 환경변수), drizzle-kit 설정, `migrate` 스크립트, v1 전체 ERD 설계 문서 `SCHEMA.md`(엔티티 12개, 모든 회원 소유 데이터의 소유자 컬럼과 회원 삭제 시 `ON DELETE CASCADE` 경로, 이미지 파일 삭제는 앱 레벨 처리 명시) — 완료 기준: DoD 2·3 충족 (depends: S1)
- [ ] S4. [backend] `apps/api`(@novelist/api) Hono — `basePath('/api')`, `GET /api/health`(DB `SELECT 1` 결과 포함, 응답은 shared 스키마), `ENABLE_TEST_ENDPOINTS=1`일 때만 열리는 테스트용 SSE 엔드포인트(300ms 간격 이벤트 3개), `export type AppType`, Vitest health 테스트 — 완료 기준: `pnpm --filter @novelist/api test` 통과 (depends: S2, S3)
- [ ] S5. [design] 디자인 토큰(`apps/web/src/styles`: 색·타이포·간격·다크 모드) + `design/DESIGN.md`(원칙, 앱 셸 명세, 화면 9종 와이어프레임 수준 레이아웃 — 에디터는 AI 초안·메모·캐릭터 패널 포함, 모바일은 읽기·메모만) — 완료 기준: DoD 4 충족
- [ ] S6. [frontend] `apps/web` Next.js App Router — `/api/*` → `API_URL` rewrites, S5 토큰 적용, DESIGN.md대로 앱 셸 구현, 홈에서 `hc<AppType>`로 health 호출해 "API 정상" 표시 — 완료 기준: `pnpm --filter @novelist/web build` 통과 + 개발 서버 홈에 "API 정상" 표시 (depends: S4, S5)
- [ ] S7. [qa] `tests/e2e` Playwright 스모크 2개(DoD 5) + `.github/workflows/ci.yml`(PR·main 푸시: 설치 → Biome → 타입체크 → Vitest → 빌드 → Playwright, Node는 .nvmrc) — 완료 기준: DoD 5·6 충족. SSE 스모크가 실패하면 결과를 오케스트레이터에게 보고(개발 환경도 Caddy로 바꾸는 판단 필요) (depends: S6)
