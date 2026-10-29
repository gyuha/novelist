import { sessions, users } from "@novelist/db";
import { describe, expect, test } from "vitest";
import { ADMIN, PASSWORD, setup } from "./test-utils";

describe("관리자 API 접근", () => {
	test("일반 회원은 관리자 API에 403 forbidden", async () => {
		const { call, adminCookie, activeMember } = await setup();
		const m = await activeMember("m@example.com", await adminCookie());
		for (const [method, path] of [
			["GET", "/api/admin/pending"],
			["GET", "/api/admin/members"],
			["POST", `/api/admin/members/${m.id}/suspend`],
			["DELETE", `/api/admin/members/${m.id}`],
		] as const) {
			const r = await call(method, path, { cookie: m.cookie });
			expect(r.status, `${method} ${path}`).toBe(403);
			expect(r.json.code).toBe("forbidden");
		}
	});

	test("비로그인은 관리자 API에 401", async () => {
		const { call } = await setup();
		expect((await call("GET", "/api/admin/members")).status).toBe(401);
	});

	test("대기 회원은 관리자 API에 403 pending_approval", async () => {
		const { call } = await setup();
		const s = await call("POST", "/api/auth/signup", {
			body: { email: "p@example.com", password: PASSWORD },
		});
		const r = await call("GET", "/api/admin/members", { cookie: s.cookie });
		expect(r.status).toBe(403);
		expect(r.json.code).toBe("pending_approval");
	});
});

describe("가입 승인·거절", () => {
	test("대기 목록에는 pending 신청자만 나오고 승인하면 active로 바뀌어 목록에서 사라진다", async () => {
		const { call, adminCookie, clock } = await setup();
		const admin = await adminCookie();
		const s = await call("POST", "/api/auth/signup", {
			body: { email: "p@example.com", password: PASSWORD },
		});
		const pending = await call("GET", "/api/admin/pending", { cookie: admin });
		expect(pending.json.members).toHaveLength(1);
		expect(pending.json.members[0]).toMatchObject({
			email: "p@example.com",
			status: "pending",
		});
		expect(pending.json.members[0]).not.toHaveProperty("passwordHash");

		const ok = await call("POST", `/api/admin/members/${s.json.id}/approve`, {
			cookie: admin,
		});
		expect(ok.status).toBe(200);
		expect(ok.json).toMatchObject({
			status: "active",
			approvedAt: clock.now(),
		});
		expect(
			(await call("GET", "/api/admin/pending", { cookie: admin })).json.members,
		).toHaveLength(0);
		// 승인 후 기존 세션으로 바로 /me 가 active
		expect(
			(await call("GET", "/api/auth/me", { cookie: s.cookie })).json.status,
		).toBe("active");
	});

	test("승인 대상이 pending이 아니면 409 invalid_state", async () => {
		const { call, adminCookie, activeMember } = await setup();
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		const r = await call("POST", `/api/admin/members/${m.id}/approve`, {
			cookie: admin,
		});
		expect(r.status).toBe(409);
		expect(r.json.code).toBe("invalid_state");
	});

	test("거절하면 신청 행이 삭제되고(세션 포함) 같은 이메일로 재신청할 수 있다", async () => {
		const { call, adminCookie, db } = await setup();
		const admin = await adminCookie();
		const s = await call("POST", "/api/auth/signup", {
			body: { email: "p@example.com", password: PASSWORD },
		});
		const r = await call("POST", `/api/admin/members/${s.json.id}/reject`, {
			cookie: admin,
		});
		expect(r.status).toBe(204);
		expect(
			db
				.select()
				.from(users)
				.all()
				.map((u) => u.email),
		).toEqual([ADMIN.email]);
		expect(
			(await call("GET", "/api/auth/me", { cookie: s.cookie })).status,
		).toBe(401);
		const again = await call("POST", "/api/auth/signup", {
			body: { email: "p@example.com", password: PASSWORD },
		});
		expect(again.status).toBe(201);
	});

	test("active 회원을 거절(reject)하려 하면 409이고 삭제되지 않는다", async () => {
		const { call, adminCookie, activeMember, db } = await setup();
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		expect(
			(
				await call("POST", `/api/admin/members/${m.id}/reject`, {
					cookie: admin,
				})
			).status,
		).toBe(409);
		expect(db.select().from(users).all()).toHaveLength(2);
	});

	test("없는 회원 id는 404 not_found", async () => {
		const { call, adminCookie } = await setup();
		const r = await call("POST", "/api/admin/members/nope/approve", {
			cookie: await adminCookie(),
		});
		expect(r.status).toBe(404);
		expect(r.json.code).toBe("not_found");
	});
});

describe("회원 목록·정지", () => {
	test("회원 목록은 pending을 제외하고 관리자 행에 role=admin을 표시한다", async () => {
		const { call, adminCookie, activeMember } = await setup();
		const admin = await adminCookie();
		await activeMember("m@example.com", admin);
		await call("POST", "/api/auth/signup", {
			body: { email: "p@example.com", password: PASSWORD },
		});
		const list = await call("GET", "/api/admin/members", { cookie: admin });
		expect(
			list.json.members
				.map((m: { email: string; role: string }) => [m.email, m.role])
				.sort(),
		).toEqual([
			[ADMIN.email, "admin"],
			["m@example.com", "member"],
		]);
	});

	test("정지하면 기존 세션이 모두 무효가 되고 로그인이 막히며, 해제하면 다시 로그인된다", async () => {
		const { call, login, adminCookie, activeMember, db } = await setup();
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		const second = await login("m@example.com", PASSWORD);
		const r = await call("POST", `/api/admin/members/${m.id}/suspend`, {
			cookie: admin,
		});
		expect(r.json.status).toBe("suspended");
		expect(
			(await call("GET", "/api/auth/me", { cookie: m.cookie })).status,
		).toBe(401);
		expect(
			(await call("GET", "/api/auth/me", { cookie: second.cookie })).status,
		).toBe(401);
		expect(
			db
				.select()
				.from(sessions)
				.all()
				.filter((s) => s.userId === m.id),
		).toHaveLength(0);
		expect((await login("m@example.com", PASSWORD)).status).toBe(403);

		const un = await call("POST", `/api/admin/members/${m.id}/unsuspend`, {
			cookie: admin,
		});
		expect(un.json.status).toBe("active");
		expect((await login("m@example.com", PASSWORD)).status).toBe(200);
	});

	test("정지 해제·정지는 상태가 맞지 않으면 409 invalid_state", async () => {
		const { call, adminCookie, activeMember } = await setup();
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		expect(
			(
				await call("POST", `/api/admin/members/${m.id}/unsuspend`, {
					cookie: admin,
				})
			).status,
		).toBe(409);
		await call("POST", `/api/admin/members/${m.id}/suspend`, { cookie: admin });
		expect(
			(
				await call("POST", `/api/admin/members/${m.id}/suspend`, {
					cookie: admin,
				})
			).status,
		).toBe(409);
	});
});

describe("비밀번호 초기화", () => {
	test("임시 비밀번호를 1회 돌려주고, 세션 전부 무효, 임시 비밀번호로만 로그인되며 변경이 강제된다", async () => {
		const { call, login, adminCookie, activeMember } = await setup();
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		const r = await call("POST", `/api/admin/members/${m.id}/reset-password`, {
			cookie: admin,
		});
		expect(r.status).toBe(200);
		const temp = r.json.temporaryPassword as string;
		expect(temp.length).toBeGreaterThanOrEqual(10);
		expect(
			(await call("GET", "/api/auth/me", { cookie: m.cookie })).status,
		).toBe(401);
		expect((await login("m@example.com", PASSWORD)).status).toBe(401);

		const l = await login("m@example.com", temp);
		expect(l.status).toBe(200);
		expect(l.json.mustChangePassword).toBe(true);

		const change = await call("POST", "/api/auth/password", {
			cookie: l.cookie,
			body: { currentPassword: temp, newPassword: "my-own-new-password" },
		});
		expect(change.status).toBe(204);
		expect(
			(await call("GET", "/api/auth/me", { cookie: l.cookie })).json
				.mustChangePassword,
		).toBe(false);
		expect((await login("m@example.com", "my-own-new-password")).status).toBe(
			200,
		);
	});

	test("임시 비밀번호는 호출마다 다르다", async () => {
		const { call, adminCookie, activeMember } = await setup();
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		const a = await call("POST", `/api/admin/members/${m.id}/reset-password`, {
			cookie: admin,
		});
		const b = await call("POST", `/api/admin/members/${m.id}/reset-password`, {
			cookie: admin,
		});
		expect(a.json.temporaryPassword).not.toBe(b.json.temporaryPassword);
	});

	test("변경 필요 상태에서는 비밀번호 변경·내 정보·로그아웃 외 API를 거부한다 (403 password_change_required)", async () => {
		const { call, login, app, adminCookie, activeMember } = await setup();
		app.get("/probe", (c) => c.json({ ok: true })); // 이후 라우트가 규칙을 상속하는지 확인용
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		const temp = (
			await call("POST", `/api/admin/members/${m.id}/reset-password`, {
				cookie: admin,
			})
		).json.temporaryPassword;
		const l = await login("m@example.com", temp);
		const probe = await call("GET", "/api/probe", { cookie: l.cookie });
		expect(probe.status).toBe(403);
		expect(probe.json.code).toBe("password_change_required");
		expect(
			(await call("GET", "/api/admin/members", { cookie: l.cookie })).json.code,
		).toBe("password_change_required");
		expect(
			(await call("GET", "/api/auth/me", { cookie: l.cookie })).status,
		).toBe(200);
		expect(
			(await call("POST", "/api/auth/logout", { cookie: l.cookie })).status,
		).toBe(204);
	});

	test("정지 회원도 초기화할 수 있고 pending 회원은 409", async () => {
		const { call, adminCookie, activeMember } = await setup();
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		await call("POST", `/api/admin/members/${m.id}/suspend`, { cookie: admin });
		expect(
			(
				await call("POST", `/api/admin/members/${m.id}/reset-password`, {
					cookie: admin,
				})
			).status,
		).toBe(200);
		const p = await call("POST", "/api/auth/signup", {
			body: { email: "p@example.com", password: PASSWORD },
		});
		expect(
			(
				await call("POST", `/api/admin/members/${p.json.id}/reset-password`, {
					cookie: admin,
				})
			).status,
		).toBe(409);
	});
});

describe("회원 삭제", () => {
	test("삭제하면 회원과 세션이 CASCADE로 사라지고 로그인할 수 없다", async () => {
		const { call, login, adminCookie, activeMember, db } = await setup();
		const admin = await adminCookie();
		const m = await activeMember("m@example.com", admin);
		await login("m@example.com", PASSWORD);
		expect(
			db
				.select()
				.from(sessions)
				.all()
				.filter((s) => s.userId === m.id).length,
		).toBeGreaterThan(0);
		const r = await call("DELETE", `/api/admin/members/${m.id}`, {
			cookie: admin,
		});
		expect(r.status).toBe(204);
		expect(
			db
				.select()
				.from(sessions)
				.all()
				.filter((s) => s.userId === m.id),
		).toHaveLength(0);
		expect(
			db
				.select()
				.from(users)
				.all()
				.filter((u) => u.id === m.id),
		).toHaveLength(0);
		expect(
			(await call("GET", "/api/auth/me", { cookie: m.cookie })).status,
		).toBe(401);
		expect((await login("m@example.com", PASSWORD)).status).toBe(401);
	});
});

describe("관리자 계정 보호", () => {
	test("관리자 대상 정지·해제·초기화·삭제·승인·거절은 자기 자신 포함 403 admin_target_forbidden", async () => {
		const { call, db, adminCookie } = await setup();
		const admin = await adminCookie();
		const [row] = db.select().from(users).all();
		const id = row?.id ?? "";
		for (const [method, path] of [
			["POST", `/api/admin/members/${id}/suspend`],
			["POST", `/api/admin/members/${id}/unsuspend`],
			["POST", `/api/admin/members/${id}/reset-password`],
			["DELETE", `/api/admin/members/${id}`],
			["POST", `/api/admin/members/${id}/approve`],
			["POST", `/api/admin/members/${id}/reject`],
		] as const) {
			const r = await call(method, path, { cookie: admin });
			expect(r.status, `${method} ${path}`).toBe(403);
			expect(r.json.code).toBe("admin_target_forbidden");
		}
		expect(db.select().from(users).all()).toHaveLength(1);
		expect((await call("GET", "/api/auth/me", { cookie: admin })).status).toBe(
			200,
		);
	});

	test("다른 관리자 계정도 거부된다", async () => {
		const { call, db, adminCookie } = await setup();
		const admin = await adminCookie();
		const { ensureAdmin } = await import("./seed");
		await ensureAdmin(db, {
			email: "admin2@example.com",
			password: "admin-password-2",
		});
		const other = db
			.select()
			.from(users)
			.all()
			.find((u) => u.email === "admin2@example.com");
		const r = await call("DELETE", `/api/admin/members/${other?.id}`, {
			cookie: admin,
		});
		expect(r.json.code).toBe("admin_target_forbidden");
	});
});
