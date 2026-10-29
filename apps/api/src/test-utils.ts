import { createDb, runMigrations } from "@novelist/db";
import { createApp } from "./app";
import { ensureAdmin } from "./seed";

export const COOKIE_NAME = "novelist_session";
export const ADMIN = {
	email: "admin@example.com",
	password: "admin-password-1",
};
export const PASSWORD = "correct-horse-1";

export async function setup() {
	const { db } = createDb(":memory:");
	runMigrations(db);
	let t = 1_700_000_000_000;
	const clock = {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		},
	};
	const app = createApp(db, { now: clock.now });

	type CallOptions = {
		body?: unknown;
		cookie?: string;
		origin?: string | null;
	};
	async function call(method: string, path: string, opts: CallOptions = {}) {
		const headers: Record<string, string> = {};
		if (opts.body !== undefined) headers["Content-Type"] = "application/json";
		if (opts.cookie) headers.Cookie = opts.cookie;
		if (opts.origin !== null)
			headers.Origin = opts.origin ?? "http://localhost";
		const res = await app.request(path, {
			method,
			headers,
			body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
		});
		const text = await res.text();
		const setCookie = res.headers.get("set-cookie") ?? "";
		const token = new RegExp(`${COOKIE_NAME}=([^;]*)`).exec(setCookie)?.[1];
		return {
			res,
			status: res.status,
			json: text ? JSON.parse(text) : undefined,
			setCookie,
			cookie: token ? `${COOKIE_NAME}=${token}` : undefined,
		};
	}

	async function login(email: string, password: string) {
		return call("POST", "/api/auth/login", { body: { email, password } });
	}

	async function adminCookie() {
		await ensureAdmin(db, ADMIN);
		const r = await login(ADMIN.email, ADMIN.password);
		return r.cookie as string;
	}

	/** 가입 신청 후 관리자가 승인한 활성 회원의 쿠키와 id를 돌려준다. */
	async function activeMember(email: string, admin: string) {
		const s = await call("POST", "/api/auth/signup", {
			body: { email, password: PASSWORD },
		});
		const id = s.json.id as string;
		await call("POST", `/api/admin/members/${id}/approve`, { cookie: admin });
		const l = await login(email, PASSWORD);
		return { id, cookie: l.cookie as string };
	}

	return { db, app, clock, call, login, adminCookie, activeMember };
}
