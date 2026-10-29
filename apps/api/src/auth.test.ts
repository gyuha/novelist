import { sessions, users } from "@novelist/db";
import { describe, expect, test } from "vitest";
import { verifyPassword } from "./password";
import { ADMIN, COOKIE_NAME, PASSWORD, setup } from "./test-utils";

const DAY = 24 * 60 * 60 * 1000;

describe("가입 신청", () => {
	test("가입 신청은 pending 회원을 만들고 세션을 발급한다", async () => {
		const { call, db } = await setup();
		const r = await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		expect(r.status).toBe(201);
		expect(r.json).toMatchObject({
			email: "a@example.com",
			role: "member",
			status: "pending",
			mustChangePassword: false,
		});
		expect(r.cookie).toBeDefined();
		const [row] = db.select().from(users).all();
		expect(row?.passwordHash).not.toContain(PASSWORD);
		expect(await verifyPassword(PASSWORD, row?.passwordHash ?? "")).toBe(true);
	});

	test("이메일은 공백 제거 후 소문자로 정규화된다", async () => {
		const { call } = await setup();
		const r = await call("POST", "/api/auth/signup", {
			body: { email: "  Mixed@Example.COM ", password: PASSWORD },
		});
		expect(r.json.email).toBe("mixed@example.com");
	});

	test("같은 이메일 재가입은 409 email_taken (대소문자 무시)", async () => {
		const { call } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		const r = await call("POST", "/api/auth/signup", {
			body: { email: "A@example.com", password: PASSWORD },
		});
		expect(r.status).toBe(409);
		expect(r.json.code).toBe("email_taken");
	});

	test("비밀번호 길이 경계: 9자 거부, 10자 허용, 128자 허용, 129자 거부", async () => {
		const { call } = await setup();
		const sign = (n: number, i: number) =>
			call("POST", "/api/auth/signup", {
				body: { email: `u${i}@example.com`, password: "x".repeat(n) },
			});
		expect((await sign(9, 1)).json.code).toBe("validation_error");
		expect((await sign(10, 2)).status).toBe(201);
		expect((await sign(128, 3)).status).toBe(201);
		expect((await sign(129, 4)).status).toBe(400);
	});

	test("잘못된 이메일 형식은 400 validation_error", async () => {
		const { call } = await setup();
		const r = await call("POST", "/api/auth/signup", {
			body: { email: "not-an-email", password: PASSWORD },
		});
		expect(r.status).toBe(400);
		expect(r.json.code).toBe("validation_error");
	});
});

describe("로그인·로그아웃·내 정보", () => {
	test("세션 쿠키는 httpOnly·SameSite=Lax이고 DB에는 토큰 해시만 저장된다", async () => {
		const { call, db } = await setup();
		const r = await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		expect(r.setCookie).toMatch(/HttpOnly/i);
		expect(r.setCookie).toMatch(/SameSite=Lax/i);
		expect(r.setCookie).not.toMatch(/Secure/i);
		const token = r.cookie?.split("=")[1] ?? "";
		const [s] = db.select().from(sessions).all();
		expect(s?.id).not.toBe(token);
		expect(s?.id).toMatch(/^[0-9a-f]{64}$/);
	});

	test("운영 환경(NODE_ENV=production)에서는 쿠키에 Secure가 붙는다", async () => {
		const { call } = await setup();
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			const r = await call("POST", "/api/auth/signup", {
				body: { email: "a@example.com", password: PASSWORD },
			});
			expect(r.setCookie).toMatch(/Secure/i);
		} finally {
			process.env.NODE_ENV = prev;
		}
	});

	test("로그인 후 /me가 내 정보를 돌려준다", async () => {
		const { call, login } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		const l = await login("a@example.com", PASSWORD);
		expect(l.status).toBe(200);
		const me = await call("GET", "/api/auth/me", { cookie: l.cookie });
		expect(me.status).toBe(200);
		expect(me.json).toMatchObject({
			email: "a@example.com",
			status: "pending",
		});
	});

	test("쿠키 없이 /me는 401 unauthorized", async () => {
		const { call } = await setup();
		const r = await call("GET", "/api/auth/me");
		expect(r.status).toBe(401);
		expect(r.json.code).toBe("unauthorized");
	});

	test("로그아웃은 세션을 삭제하고 이후 /me는 401", async () => {
		const { call, login, db } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		const l = await login("a@example.com", PASSWORD);
		const out = await call("POST", "/api/auth/logout", { cookie: l.cookie });
		expect(out.status).toBe(204);
		expect(db.select().from(sessions).all()).toHaveLength(1); // 가입 때 받은 다른 세션만 남음
		expect(
			(await call("GET", "/api/auth/me", { cookie: l.cookie })).status,
		).toBe(401);
	});

	test("로그인 실패: 틀린 비밀번호와 없는 이메일은 같은 401 invalid_credentials", async () => {
		const { call, login } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		const wrongPw = await login("a@example.com", "wrong-password-1");
		const noUser = await login("nobody@example.com", PASSWORD);
		expect(wrongPw.status).toBe(401);
		expect(noUser.status).toBe(401);
		expect(wrongPw.json).toEqual(noUser.json);
		expect(wrongPw.json.code).toBe("invalid_credentials");
	});

	test("정지 회원은 비밀번호가 맞을 때만 account_suspended 안내, 틀리면 invalid_credentials", async () => {
		const { call, login, adminCookie, activeMember } = await setup();
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		await call("POST", `/api/admin/members/${m.id}/suspend`, { cookie: admin });
		const ok = await login("m@example.com", PASSWORD);
		expect(ok.status).toBe(403);
		expect(ok.json.code).toBe("account_suspended");
		expect(ok.cookie).toBeUndefined();
		const bad = await login("m@example.com", "wrong-password-1");
		expect(bad.json.code).toBe("invalid_credentials");
	});
});

describe("로그인 시도 제한", () => {
	test("같은 이메일 6번째 로그인 시도는 올바른 비밀번호여도 429 too_many_attempts로 차단", async () => {
		const { call, login } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		for (let i = 0; i < 5; i++) {
			expect((await login("a@example.com", "wrong-password-1")).status).toBe(
				401,
			);
		}
		const sixth = await login("a@example.com", PASSWORD);
		expect(sixth.status).toBe(429);
		expect(sixth.json.code).toBe("too_many_attempts");
	});

	test("차단은 15분 뒤 풀리고, 다른 이메일에는 영향이 없다", async () => {
		const { call, login, clock } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		await call("POST", "/api/auth/signup", {
			body: { email: "b@example.com", password: PASSWORD },
		});
		for (let i = 0; i < 5; i++)
			await login("a@example.com", "wrong-password-1");
		expect((await login("b@example.com", PASSWORD)).status).toBe(200);
		clock.advance(15 * 60 * 1000 - 1);
		expect((await login("a@example.com", PASSWORD)).status).toBe(429);
		clock.advance(2);
		expect((await login("a@example.com", PASSWORD)).status).toBe(200);
	});

	test("15분 창 밖의 실패는 누적되지 않는다", async () => {
		const { call, login, clock } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		for (let i = 0; i < 4; i++)
			await login("a@example.com", "wrong-password-1");
		clock.advance(15 * 60 * 1000 + 1);
		await login("a@example.com", "wrong-password-1");
		expect((await login("a@example.com", PASSWORD)).status).toBe(200);
	});

	test("로그인 성공은 실패 횟수를 초기화한다", async () => {
		const { call, login } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		for (let i = 0; i < 4; i++)
			await login("a@example.com", "wrong-password-1");
		expect((await login("a@example.com", PASSWORD)).status).toBe(200);
		for (let i = 0; i < 4; i++)
			await login("a@example.com", "wrong-password-1");
		expect((await login("a@example.com", PASSWORD)).status).toBe(200);
	});
});

describe("세션 수명", () => {
	test("세션은 30일 뒤 만료되어 401이 되고 행이 삭제된다", async () => {
		const { call, login, clock, db } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		const l = await login("a@example.com", PASSWORD);
		clock.advance(30 * DAY - 1);
		expect(
			(await call("GET", "/api/auth/me", { cookie: l.cookie })).status,
		).toBe(200);
		clock.advance(30 * DAY);
		expect(
			(await call("GET", "/api/auth/me", { cookie: l.cookie })).status,
		).toBe(401);
		expect(db.select().from(sessions).all()).toHaveLength(1); // 쓴 세션만 삭제, 가입 세션은 남음
	});

	test("남은 기간이 15일 미만이면 30일로 연장하고 쿠키를 다시 내려준다 (슬라이딩)", async () => {
		const { call, login, clock, db } = await setup();
		await call("POST", "/api/auth/signup", {
			body: { email: "a@example.com", password: PASSWORD },
		});
		const l = await login("a@example.com", PASSWORD);
		const expiresAt = () =>
			db
				.select()
				.from(sessions)
				.all()
				.map((s) => s.expiresAt)
				.sort()
				.at(-1) ?? 0;

		clock.advance(10 * DAY); // 남은 20일: 연장 없음
		const early = await call("GET", "/api/auth/me", { cookie: l.cookie });
		expect(early.setCookie).toBe("");
		expect(expiresAt()).toBe(clock.now() - 10 * DAY + 30 * DAY);

		clock.advance(6 * DAY); // 남은 14일: 연장
		const late = await call("GET", "/api/auth/me", { cookie: l.cookie });
		expect(late.setCookie).toContain(COOKIE_NAME);
		expect(expiresAt()).toBe(clock.now() + 30 * DAY);
	});
});

describe("비밀번호 변경", () => {
	async function activeLogin() {
		const ctx = await setup();
		const admin = await ctx.adminCookie();
		const m = await ctx.activeMember("m@example.com", admin);
		return { ...ctx, admin, m };
	}

	test("현재 비밀번호가 틀리면 400 invalid_current_password", async () => {
		const { call, m } = await activeLogin();
		const r = await call("POST", "/api/auth/password", {
			cookie: m.cookie,
			body: {
				currentPassword: "wrong-password-1",
				newPassword: "brand-new-password",
			},
		});
		expect(r.status).toBe(400);
		expect(r.json.code).toBe("invalid_current_password");
	});

	test("새 비밀번호 길이 규칙을 따른다", async () => {
		const { call, m } = await activeLogin();
		const r = await call("POST", "/api/auth/password", {
			cookie: m.cookie,
			body: { currentPassword: PASSWORD, newPassword: "short" },
		});
		expect(r.json.code).toBe("validation_error");
	});

	test("변경하면 새 비밀번호로 로그인되고 현재 세션 외 세션은 무효가 된다", async () => {
		const { call, login, m } = await activeLogin();
		const other = await login("m@example.com", PASSWORD);
		const r = await call("POST", "/api/auth/password", {
			cookie: m.cookie,
			body: { currentPassword: PASSWORD, newPassword: "brand-new-password" },
		});
		expect(r.status).toBe(204);
		expect(
			(await call("GET", "/api/auth/me", { cookie: m.cookie })).status,
		).toBe(200);
		expect(
			(await call("GET", "/api/auth/me", { cookie: other.cookie })).status,
		).toBe(401);
		expect((await login("m@example.com", PASSWORD)).status).toBe(401);
		expect((await login("m@example.com", "brand-new-password")).status).toBe(
			200,
		);
	});

	test("대기 회원은 비밀번호를 바꿀 수 없다", async () => {
		const { call } = await setup();
		const s = await call("POST", "/api/auth/signup", {
			body: { email: "p@example.com", password: PASSWORD },
		});
		const r = await call("POST", "/api/auth/password", {
			cookie: s.cookie,
			body: { currentPassword: PASSWORD, newPassword: "brand-new-password" },
		});
		expect(r.status).toBe(403);
	});
});

describe("seed:admin", () => {
	test("관리자가 없으면 만들고, 있으면 비밀번호만 갱신하며 변경 필요·세션을 정리한다", async () => {
		const { db, login, call } = await setup();
		const { ensureAdmin } = await import("./seed");
		expect(await ensureAdmin(db, ADMIN)).toBe("created");
		const first = await login(ADMIN.email, ADMIN.password);
		expect(first.json).toMatchObject({ role: "admin", status: "active" });
		expect(
			await ensureAdmin(db, {
				email: ADMIN.email,
				password: "another-password-2",
			}),
		).toBe("updated");
		expect((await login(ADMIN.email, ADMIN.password)).status).toBe(401);
		expect((await login(ADMIN.email, "another-password-2")).status).toBe(200);
		expect(
			(await call("GET", "/api/auth/me", { cookie: first.cookie })).status,
		).toBe(401);
	});
});
