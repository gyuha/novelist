<!-- forge-slug: v1-build-3of7 -->
<!-- task: 3 -->
<!-- part: 3/7 -->
# v1 구축 3/7 — 소설·챕터·에디터

> 범위만 적은 초안이다. 실행 전에 fg-ask로 슬라이스·완료 기준·TDD 여부를 다시 다듬는다(1번 결과로 생긴 실제 구조에 맞추기 위해). 실행 주체: Paseo 역할 팀.

## 목표 / 범위 밖
- 목표: 회원이 소설 여러 편과 챕터를 만들고 TipTap 에디터로 쓰며, 챕터 스냅샷 저장·복원, 본인용 리더 뷰, 소설 단위 txt·마크다운 내보내기를 쓴다. 모바일은 리더 뷰 대응.
- 범위 밖: AI 기능(5번), 메모·주석(4번), 버전 비교 화면, epub

## 기준 문서
- 용어집: .forge/CONTEXT.md
- 결정 문서: docs/v1-decisions.md
- 관련 ADR: .forge/adr/261030-004647-tiptap-json-body.md
- 완료 정의(DoD): 소설 생성 → 챕터 작성 → 스냅샷 복원 → 리더 뷰 → 내보내기가 E2E로 통과 (다듬을 때 실행 가능한 명령으로 구체화)

## 작업 슬라이스
- [ ] S1. [backend] novels·chapters·chapter_snapshots 테이블과 API, ProseMirror JSON → 순수 텍스트 변환, 내보내기 — 완료 기준: API 통합 테스트 통과
- [ ] S2. [frontend] 소설 목록·챕터 목록·에디터·리더 뷰 — 완료 기준: 화면 명세대로 동작 (depends: S1)
- [ ] S3. [qa] 소설·챕터·스냅샷·리더·내보내기 E2E — 완료 기준: E2E 통과 (depends: S1, S2)
