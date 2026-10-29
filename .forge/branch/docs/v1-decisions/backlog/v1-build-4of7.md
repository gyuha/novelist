<!-- forge-slug: v1-build-4of7 -->
<!-- task: 4 -->
<!-- part: 4/7 -->
# v1 구축 4/7 — 메모·주석·캐릭터

> 범위만 적은 초안이다. 실행 전에 fg-ask로 슬라이스·완료 기준·TDD 여부를 다시 다듬는다(1번 결과로 생긴 실제 구조에 맞추기 위해). 실행 주체: Paseo 역할 팀.

## 목표 / 범위 밖
- 목표: 소설·챕터·자유 메모와 'AI 참고' 표시, 본문 주석(TipTap 마크, 위치 잃은 주석 보존), 소설별 캐릭터 항목(이름·외형 묘사·참조 이미지 업로드)을 만든다.
- 범위 밖: AI가 메모·캐릭터를 읽는 처리(5번), 삽화 생성(6번)

## 기준 문서
- 용어집: .forge/CONTEXT.md
- 결정 문서: docs/v1-decisions.md
- 관련 ADR: .forge/adr/261030-004034-characters-separate-from-memos.md, .forge/adr/261030-004647-tiptap-json-body.md
- 완료 정의(DoD): 메모 4종 작성, 주석 추적·위치 잃은 주석 보존, 캐릭터 참조 이미지 업로드가 E2E로 통과 (다듬을 때 실행 가능한 명령으로 구체화)

## 작업 슬라이스
- [ ] S1. [backend] memos·annotations·characters·character_reference_images 테이블과 API, 이미지 업로드 저장(볼륨 경로) — 완료 기준: API 통합 테스트 통과
- [ ] S2. [frontend] 메모 패널·주석 마크·위치 잃은 주석 목록·캐릭터 화면 — 완료 기준: 화면 명세대로 동작 (depends: S1)
- [ ] S3. [qa] 메모·주석·캐릭터 E2E — 완료 기준: E2E 통과 (depends: S1, S2)
