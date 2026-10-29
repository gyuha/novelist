<!-- forge-slug: v1-build-3of7 -->
<!-- task: 3 -->
<!-- part: 3/7 -->
<!-- priority: high -->
<!-- tdd: on -->
# v1 구축 3/7 — 소설·챕터·에디터

> 실행 주체: Paseo 역할 팀(오케스트레이터가 슬라이스를 역할별로 넘김). fg-run으로 실행하지 않는다. TDD는 backend 슬라이스(S2·S4)에 적용한다.

## 목표 / 범위 밖
- 목표: 회원이 소설 여러 편(설명 포함)과 챕터를 만들고, TipTap 에디터로 쓰고 명시적으로 저장하며(로컬 백업·충돌 감지 포함), 챕터 스냅샷을 남기고 복원하고, 본인용 리더 뷰로 읽고, 소설 단위 TXT·Markdown으로 내보낸다. 본문 형식은 shared 문서 모델 한 곳에서 정의하고 서버가 검증한다.
- 범위 밖: AI 기능과 챕터 요약(5번), 메모·주석(4번 — 단 문서 모델은 주석 마크를 추가할 수 있게 확장 가능한 구조로 둔다), 버전 비교(diff), epub, 드래그 정렬, 서버 자동 저장.

## 기준 문서
- 용어집: .forge/CONTEXT.md — 회원, 소설, 회원별 공간
- 결정 문서: docs/v1-decisions.md (글쓰기)
- 관련 ADR: .forge/adr/261030-004647-tiptap-json-body.md, .forge/adr/261030-005014-separate-web-and-api.md
- 설계 근거: packages/db/SCHEMA.md(novels, chapters, chapter_snapshots), design/DESIGN.md(소설 목록, 챕터 목록, 에디터, 스냅샷·오류·모바일, 리더 뷰)
- 이번 그릴링에서 정한 것:
  - 문서 모델: `packages/shared`에 허용 노드의 Zod 스키마(`doc`, `paragraph`, `text`, `bold` 마크, `horizontalRule`=장면 전환)와 순수 변환 함수 `toPlainText`·`toMarkdown`. API는 본문 저장 시 이 스키마로 검증(위반 400). 4번에서 주석 마크를 이 모듈에 추가, 5번 AI 컨텍스트도 `toPlainText` 사용. TipTap 에디터 설정은 web에 둔다.
  - 저장: 명시적 저장(버튼·Cmd/Ctrl+S) 유지 + 브라우저 로컬 백업(입력 후 수 초 간격으로 localStorage에 초안 저장, 다시 열 때 서버 본문보다 최신이면 복구/버리기 안내)
  - 저장 충돌: 저장 요청에 불러온 버전(`updated_at`)을 함께 보내고, 서버 버전과 다르면 409 → UI에서 덮어쓰기/다시 불러오기 선택
  - 스냅샷: 수동 생성·목록·복원. 복원 직전 현재 본문을 `auto` 스냅샷("복원 전 자동 저장")으로 남김. 보관은 수동 무제한, `auto`는 챕터당 최근 20개(초과 시 가장 오래된 `auto`부터 삭제)
  - 소설 설명: novels에 선택 입력 `description`(최대 1,000자) 추가, 목록·챕터 목록에 표시. AI 컨텍스트 포함 여부는 5번에서 결정
  - 챕터 순서: 위로/아래로 버튼만(인접 챕터와 `position` 교환), 새 챕터는 맨 끝에 추가
  - 내보내기: 소설 제목 → 설명(있으면) → 챕터마다 챕터 제목 + 본문. 장면 전환은 TXT·Markdown 모두 `* * *`, Markdown은 `#` 소설 제목·`##` 챕터 제목·`**강조**`, TXT는 강조 표시 없음. 주석 제외, 빈 챕터도 제목 포함, UTF-8, 파일명은 소설 제목에서 금지 문자 제거
  - 본문 크기: 챕터 본문 JSON 1MB 상한, 초과 시 413과 에디터 안내
  - 소유권: 다른 회원의 소설·챕터·스냅샷 접근은 404(존재 여부 비노출)
  - 로그인 후 이동 위치를 `/`에서 `/novels`로 변경(`apps/web/src/lib/route-guard.ts`의 `HOME_PATH`)
- 완료 정의(DoD):
  1. 루트에서 `pnpm install --frozen-lockfile && pnpm check && pnpm typecheck && pnpm test && pnpm build` → 종료 코드 0
  2. `rm -rf /tmp/v1-3 && DATABASE_PATH=/tmp/v1-3/x.db pnpm --filter @novelist/db migrate && sqlite3 /tmp/v1-3/x.db ".tables"` → 출력에 `novels`, `chapters`, `chapter_snapshots`가 모두 있음
  3. `pnpm --filter @novelist/shared test`(문서 모델 변환)와 `pnpm --filter @novelist/api test` 통과, 그리고 다음 조건이 각각 1개 이상의 테스트로 존재(오케스트레이터가 테스트 목록을 읽어 확인): 다른 회원의 소설·챕터·스냅샷 접근 404 · 허용되지 않은 노드가 든 본문 400 · 1MB 초과 본문 413 · 버전 불일치 저장 409 · 위/아래 이동과 맨 위·맨 아래 경계 · 복원 시 복원 전 `auto` 스냅샷 생성 · `auto` 21번째 생성 시 가장 오래된 `auto` 삭제와 `manual` 보존 · 소설 삭제 시 챕터·스냅샷 CASCADE · TXT·Markdown 출력이 기대 문자열과 일치(장면 전환 `* * *`, 강조 처리)
  4. `pnpm e2e` 통과, 다음 시나리오 포함: 소설 생성(설명 포함)→챕터 생성→본문 작성·저장→새로고침 후 유지 · 수동 스냅샷→수정→복원→"복원 전 자동 저장"이 목록에 있음 · 챕터 위/아래 이동 · 리더 뷰 이전/다음 이동 · TXT·Markdown 다운로드 내용 확인 · 두 탭 저장 시 409 안내 · 저장하지 않고 새로고침 시 로컬 초안 복구 안내 · 다른 회원은 소설 URL에 접근 불가
  5. 이 작업의 PR에서 GitHub Actions 성공
  - 작성 시점 사전 상태(2026-10-30 측정): DoD 1은 이미 통과 — 기존 결과를 지키는 회귀 확인이므로 정상. DoD 2는 미충족(`.tables` 출력이 `__drizzle_migrations sessions users`). DoD 3은 미충족(shared에 `auth.ts`·`health.ts`만 있고 문서 모델·소설 API 없음). DoD 4는 미충족(`tests/e2e/tests/`에 `auth-admin.spec.ts`·`smoke.spec.ts`만 있음). DoD 5는 PR 전이라 미충족.

## 작업 슬라이스
- [ ] S1. [design] design/DESIGN.md 보강 — 저장 충돌(409) 시 덮어쓰기/다시 불러오기 선택 UI, 로컬 초안 복구 안내(복구/버리기), 1MB 초과 저장 안내, 스냅샷 목록의 "복원 전 자동 저장" 표시, 챕터 위로/아래로 이동 버튼(맨 위·맨 아래 비활성), 소설 설명 입력·표시 — 완료 기준: 위 여섯 항목이 DESIGN.md에 명시되고 토큰 이름만 참조
- [ ] S2. [backend, TDD] packages/shared — 문서 모델(허용 노드 Zod 스키마, `toPlainText`, `toMarkdown`)과 소설·챕터·스냅샷·내보내기 요청/응답 스키마. 변환은 테스트 먼저 — 완료 기준: `pnpm --filter @novelist/shared test`와 typecheck 통과
- [ ] S3. [backend] packages/db — novels(`description` 포함)·chapters(`position`, 본문 JSON, `updated_at`)·chapter_snapshots(`kind` auto|manual) 테이블과 생성된 마이그레이션, SCHEMA.md 갱신 — 완료 기준: DoD 2 충족 (depends: S2)
- [ ] S4. [backend, TDD] apps/api — 소설 CRUD, 챕터 CRUD, 위/아래 이동, 본문 저장(문서 모델 검증·1MB 413·버전 409), 스냅샷(수동 생성·목록·조회·복원, 복원 전 auto, auto 최근 20개), TXT·Markdown 내보내기, 소유권 404. 모든 라우트는 2번의 상태별 접근 미들웨어를 그대로 따른다 — 완료 기준: DoD 3 충족 (depends: S2, S3)
- [ ] S5. [frontend] apps/web — `/novels`(목록·새 소설·이름 변경·삭제), `/novels/:novelId`(챕터 목록·새 챕터·위/아래 이동·내보내기), 에디터(TipTap 문단·강조·장면 전환, 명시 저장과 Ctrl+S, 로컬 백업·복구, 409 처리, 1MB 안내, 미저장 이탈 경고), 스냅샷 패널, 리더 뷰(읽기 설정·목차·이전/다음, 모바일), `HOME_PATH`를 `/novels`로 — 완료 기준: `pnpm --filter @novelist/web build` 종료 코드 0이고 각 화면이 DESIGN.md 명세대로 동작 (depends: S1, S4)
- [ ] S6. [qa] tests/e2e — DoD 4 시나리오 추가(전용 포트·새 DB 구성 유지, 다른 회원 시나리오용 회원은 관리자 승인 흐름이나 API로 준비) — 완료 기준: DoD 4 충족 (depends: S4, S5)
