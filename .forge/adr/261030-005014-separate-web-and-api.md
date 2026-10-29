---
author: gyuha
decided: 2026-10-30 00:50
---
# 웹(Next.js)과 API 서버를 분리한다

SQLite를 쓰는 소규모 승인제 서비스이므로 Next.js 단일 앱(Route Handler가 API와 스트리밍 담당)이 더 단순하다는 추천이 있었지만, apps/web(Next.js)과 apps/api(별도 API 서버)로 분리하기로 했다. 결정자가 이유를 따로 밝히지는 않았으며, 이 구조는 .agents/team.json의 frontend(apps/web)·backend(apps/api·packages) 폴더 분담과 일치한다. 대가로 컨테이너가 두 개가 되고, 쿠키 인증을 두 서비스에 걸쳐 맞춰야 하며, AI 스트리밍은 API 서버를 거쳐 중계된다. SQLite 쓰기는 API 서버 한 프로세스만 담당한다.
