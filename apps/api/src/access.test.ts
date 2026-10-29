import { describe, expect, test } from "vitest";
import { PASSWORD, setup } from "./test-utils";

describe("상태별 접근 규칙 (공통 미들웨어)", () => {
	test("대기 회원은 내 정보·로그아웃만 되고, 그 외 API는 403 pending_approval", async () => {
		const { call, app } = await setup();
		app.get("/probe", (c) => c.json({ ok: true })); // 이후 라우트가 규칙을 상속하는지 확인용
		const s = await call("POST", "/api/auth/signup", {
			body: { email: "p@example.com", password: PASSWORD },
		});
		const probe = await call("GET", "/api/probe", { cookie: s.cookie });
		expect(probe.status).toBe(403);
		expect(probe.json.code).toBe("pending_approval");
		expect(
			(await call("GET", "/api/auth/me", { cookie: s.cookie })).status,
		).toBe(200);
		expect(
			(await call("POST", "/api/auth/logout", { cookie: s.cookie })).status,
		).toBe(204);
	});

	test("활성 회원은 등록된 일반 API를 쓸 수 있고, 비로그인은 401 unauthorized", async () => {
		const { call, app, adminCookie, activeMember } = await setup();
		app.get("/probe", (c) => c.json({ ok: true }));
		const m = await activeMember("m@example.com", await adminCookie());
		expect((await call("GET", "/api/probe", { cookie: m.cookie })).status).toBe(
			200,
		);
		const anon = await call("GET", "/api/probe");
		expect(anon.status).toBe(401);
		expect(anon.json.code).toBe("unauthorized");
	});

	test("공개 API(health·signup·login)는 비로그인으로 접근된다", async () => {
		const { call } = await setup();
		expect((await call("GET", "/api/health")).status).toBe(200);
	});
});

describe("Origin 검사", () => {
	test("Origin이 다른 POST는 403 invalid_origin", async () => {
		const { call } = await setup();
		const r = await call("POST", "/api/auth/signup", {
			origin: "http://evil.example",
			body: { email: "a@example.com", password: PASSWORD },
		});
		expect(r.status).toBe(403);
		expect(r.json.code).toBe("invalid_origin");
	});

	test("Origin 불일치는 PATCH·PUT·DELETE도 거부하고, GET은 검사하지 않는다", async () => {
		const { call } = await setup();
		for (const method of ["PATCH", "PUT", "DELETE"]) {
			expect(
				(await call(method, "/api/anything", { origin: "http://evil.example" }))
					.status,
				method,
			).toBe(403);
		}
		expect(
			(await call("GET", "/api/health", { origin: "http://evil.example" }))
				.status,
		).toBe(200);
	});

	test("같은 출처 Origin은 허용된다 (X-Forwarded-Host 우선)", async () => {
		const { app } = await setup();
		const res = await app.request("/api/auth/login", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "https://novelist.example",
				"X-Forwarded-Host": "novelist.example",
			},
			body: JSON.stringify({ email: "a@example.com", password: "x" }),
		});
		expect(res.status).toBe(401); // Origin 통과, 자격 증명만 틀림
	});

	test("Origin이 없고 Sec-Fetch-Site가 cross-site인 변경 요청은 거부한다", async () => {
		const { app } = await setup();
		const res = await app.request("/api/auth/login", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Sec-Fetch-Site": "cross-site",
			},
			body: JSON.stringify({ email: "a@example.com", password: "x" }),
		});
		expect(res.status).toBe(403);
	});
});
