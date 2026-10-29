<!-- forge-slug: v1-build-2of7 -->
<!-- task: 2 -->
<!-- part: 2/7 -->
<!-- priority: high -->
<!-- tdd: on -->
# v1 구축 2/7 — 계정·관리자

> 실행 주체: Paseo 역할 팀(오케스트레이터가 슬라이스를 역할별로 넘김). fg-run으로 실행하지 않는다. TDD는 backend 슬라이스(S4)에 적용한다.

## 목표 / 범위 밖
- 목표: 회원가입 신청 → 관리자 승인/거절 → 로그인 흐름, 회원 본인의 비밀번호 변경, 관리자 기능(승인·거절·정지/해제·비밀번호 초기화·회원 삭제)을 만든다. 상태별 접근 규칙을 API 공통 미들웨어 한 곳에서 판정해 이후 부분 계획의 API도 자동으로 따르게 한다.
- 범위 밖: 사용량 조회(5번), 메일 발송, 관리자 승격, IP 기준 시도 제한(7번 프록시 설정 이후), 회원 삭제 시 이미지 파일 삭제(파일이 생기는 4·6번에서 처리).

## 기준 문서
- 용어집: .forge/CONTEXT.md — 회원, 관리자
- 결정 문서: docs/v1-decisions.md (계정·인증·관리자)
- 관련 ADR: .forge/adr/261030-005014-separate-web-and-api.md
- 설계 근거: packages/db/SCHEMA.md(users, sessions), design/DESIGN.md(로그인·가입, 승인 대기, 관리자)
- 이번 그릴링에서 정한 것:
  - 비밀번호 해시: Node 내장 `crypto.scrypt`
  - 비밀번호 규칙: 10~128자, 문자 조합 요구 없음. `packages/shared` Zod 스키마 한 곳에서 정의, 이메일은 소문자 정규화
  - 세션: 랜덤 토큰을 httpOnly 쿠키(SameSite=Lax, 운영 Secure)로, DB에는 토큰 해시만. 30일 슬라이딩(남은 기간 15일 미만일 때 30일로 연장)
  - CSRF: SameSite=Lax + 상태 변경 요청(POST·PATCH·PUT·DELETE)은 Origin이 같을 때만 허용
  - 비밀번호 초기화: 시스템이 임시 비밀번호 생성 → 관리자 화면에 1회 표시 → 회원은 다음 로그인 때 변경 강제(`must_change_password`). 초기화 시 해당 회원 세션 전부 무효
  - 회원 본인 비밀번호 변경: 계정 메뉴에서 현재 비밀번호 확인 후 변경, 현재 세션 외 세션 무효
  - 가입 거절: 대기 중인 신청 행을 즉시 삭제(같은 이메일 재신청 가능, `rejected` 상태 없음)
  - 관리자 범위: 관리자는 `seed:admin` CLI로만 생성. 정지·초기화·삭제는 일반 회원에게만 적용(자기 자신·관리자 대상 거부), 승격 기능 없음
  - 로그인 시도 제한: 같은 이메일 15분 내 5회 실패 시 15분 차단, API 프로세스 메모리 기록. 실패 메시지는 "이메일 또는 비밀번호가 올바르지 않습니다" 하나로 통일, 비밀번호가 맞을 때만 대기·정지 안내
  - 관리자 시드: `ADMIN_EMAIL`·`ADMIN_PASSWORD` + `pnpm --filter @novelist/api seed:admin` — 없으면 생성, 있으면 비밀번호 갱신(관리자 비밀번호 복구 경로 겸용)
  - 상태별 접근 규칙(공통 미들웨어):
    - `pending`: 로그인 가능(세션 발급), 내 정보·로그아웃 API만
    - `active`: 전부(관리자 API는 `role=admin`만)
    - 변경 필요(`must_change_password`): 비밀번호 변경·내 정보·로그아웃 API만
    - `suspended`: 로그인 거부(정지 안내), 정지 시점에 기존 세션 전부 무효
- 완료 정의(DoD):
  1. 루트에서 `pnpm install --frozen-lockfile && pnpm check && pnpm typecheck && pnpm test && pnpm build` → 종료 코드 0
  2. `rm -rf /tmp/v1-2 && DATABASE_PATH=/tmp/v1-2/x.db pnpm --filter @novelist/db migrate && sqlite3 /tmp/v1-2/x.db ".tables"` → 출력에 `users`와 `sessions`가 모두 있음
  3. `pnpm --filter @novelist/api test` 통과, 그리고 다음 경계 조건이 각각 1개 이상의 테스트로 존재(오케스트레이터가 테스트 목록을 읽어 확인): 대기 회원의 비허용 API 403 · 정지 시 기존 세션 무효 · 변경 필요 상태의 비허용 API 거부 · 일반 회원의 관리자 API 403 · 관리자 대상 정지/초기화/삭제 거부 · 같은 이메일 6번째 로그인 시도 차단 · Origin 불일치 POST 거부 · 회원 삭제 시 세션 CASCADE 삭제 · 세션 만료와 슬라이딩 연장 · 거절 시 신청 삭제
  4. `pnpm e2e` 통과, 다음 시나리오 포함: 가입 신청→승인 대기 화면→관리자 승인→로그인 · 관리자 거절 · 정지→로그인 거부 · 초기화→임시 비밀번호 로그인→강제 변경→새 비밀번호 로그인 · 본인 비밀번호 변경 · 회원 삭제→로그인 불가 · 일반 회원의 `/admin` 접근 차단
  5. 이 작업의 PR에서 GitHub Actions 성공
  - 작성 시점 사전 상태(2026-10-30 측정): DoD 1은 이미 통과 — 1번 결과를 지키는 회귀 확인이므로 정상. DoD 2는 미충족(`.tables` 출력이 `__drizzle_migrations`뿐). DoD 3은 미충족(api 테스트는 health·SSE 헤더 2개뿐). DoD 4는 미충족(`tests/e2e/tests/`에 `smoke.spec.ts`만 있음). DoD 5는 PR 전이라 미충족.

## 작업 슬라이스
- [ ] S1. [design] design/DESIGN.md 보강 — 비밀번호 변경 화면(강제 변경 진입과 계정 메뉴 진입 두 경우), 가입 대기 목록의 **거절** 버튼과 확인, 비밀번호 초기화 후 임시 비밀번호 1회 표시 패널, 관리자 계정 행에는 조작 메뉴 없음, 사용량 탭은 5번 전까지 숨김 — 완료 기준: 위 다섯 항목이 DESIGN.md에 명시되고 토큰 이름만 참조
- [ ] S2. [backend] packages/shared — 인증·관리자 Zod 스키마(비밀번호 10~128자, 이메일 소문자 정규화, 각 요청·응답, 에러 코드 목록) — 완료 기준: `pnpm --filter @novelist/shared typecheck` 종료 코드 0
- [ ] S3. [backend] packages/db — users(`email` UNIQUE, `password_hash`, `role`, `status`, `must_change_password`, `created_at`, `approved_at`)·sessions(`id`=토큰 해시, `user_id` CASCADE, `expires_at`, `created_at`) 테이블과 생성된 마이그레이션 — 완료 기준: DoD 2 충족 (depends: S2)
- [ ] S4. [backend, TDD] apps/api — 가입 신청·로그인·로그아웃·내 정보·비밀번호 변경 API, 세션 미들웨어(슬라이딩·상태별 접근 규칙), Origin 검사, 로그인 시도 제한, 관리자 API(대기 목록·승인·거절·회원 목록·정지/해제·초기화·삭제), `seed:admin` CLI. 각 규칙은 실패하는 테스트를 먼저 쓴 뒤 구현 — 완료 기준: DoD 3 충족 (depends: S2, S3)
- [ ] S5. [frontend] apps/web — 로그인·가입·승인 대기·비밀번호 변경·관리자(가입 대기/회원 탭) 화면, 상태별 리다이렉트(대기→승인 대기, 변경 필요→비밀번호 변경, 비로그인→로그인), 계정 메뉴(비밀번호 변경·로그아웃) — 완료 기준: `pnpm --filter @novelist/web build` 종료 코드 0이고 각 화면이 DESIGN.md 명세대로 동작 (depends: S1, S4)
- [ ] S6. [qa] tests/e2e·CI — DoD 4 시나리오 추가, E2E 시작 전에 `seed:admin` 실행(로컬·CI 모두) — 완료 기준: DoD 4 충족 (depends: S4, S5)
