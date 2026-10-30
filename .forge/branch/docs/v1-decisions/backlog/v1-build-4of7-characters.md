<!-- forge-slug: v1-build-4of7-characters -->
<!-- task: 8 -->
<!-- priority: high -->
# v1 구축 4-2/7 — 캐릭터·참조 이미지

> 범위만 적은 초안이다. 실행 전에 fg-ask로 슬라이스·완료 기준·TDD 여부를 다시 다듬는다. 4-1(메모·주석, `v1-build-4of7`) 다음에 진행한다. 실행 주체: Paseo 역할 팀.

## 목표 / 범위 밖
- 목표: 소설별 캐릭터 항목(이름·외형 묘사)과 참조 이미지 업로드·조회·삭제를 만든다. 이 프로젝트의 첫 파일 저장이므로 볼륨 저장 경로, 형식·크기 제한, 인증된 이미지 제공, 캐릭터·소설·회원 삭제 시 파일 삭제(앱 레벨)를 함께 정한다. 6번 삽화가 같은 파일 저장 구조를 재사용한다.
- 범위 밖: 삽화 생성과 등장 캐릭터 자동 선택(6번), AI 텍스트 컨텍스트에 캐릭터 넣기(5번).

## 기준 문서
- 용어집: .forge/CONTEXT.md — 캐릭터, 참조 이미지
- 결정 문서: docs/v1-decisions.md (메모·주석·캐릭터, 삽화, 아키텍처·운영)
- 관련 ADR: .forge/adr/261030-004034-characters-separate-from-memos.md
- 설계 근거: packages/db/SCHEMA.md(characters, character_reference_images), design/DESIGN.md(메모·캐릭터 보조 화면, 메모·캐릭터 패널)
- 완료 정의(DoD): 캐릭터 생성→참조 이미지 업로드→조회→삭제, 소설·회원 삭제 시 파일까지 삭제가 API 테스트와 E2E로 통과 (다듬을 때 실행 가능한 명령으로 구체화)

## 작업 슬라이스
- [ ] S1. [backend] characters·character_reference_images 테이블, 캐릭터 API, 이미지 업로드·제공·삭제와 파일 정리 — 완료 기준: API 통합 테스트 통과
- [ ] S2. [frontend] 소설 캐릭터 화면과 에디터 캐릭터 탭 — 완료 기준: 화면 명세대로 동작 (depends: S1)
- [ ] S3. [qa] 캐릭터·참조 이미지 E2E — 완료 기준: E2E 통과 (depends: S1, S2)
