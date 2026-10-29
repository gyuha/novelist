import { type Db, eq, sessions, users } from "@novelist/db";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { decideAccess } from "./access";
import { fail } from "./errors";
import {
	COOKIE_NAME,
	hashToken,
	SESSION_TTL_MS,
	SLIDE_THRESHOLD_MS,
	writeSessionCookie,
} from "./session";

export type UserRow = typeof users.$inferSelect;
export type AppEnv = {
	Variables: { auth: { user: UserRow; sessionId: string } | null };
};

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** 상태 변경 요청은 Origin이 요청 호스트(프록시 뒤라면 X-Forwarded-Host)와 같을 때만 허용한다. */
export const originCheck: MiddlewareHandler = async (c, next) => {
	if (!MUTATING.has(c.req.method)) return next();
	const origin = c.req.header("Origin");
	if (origin) {
		const host =
			c.req.header("X-Forwarded-Host")?.split(",")[0]?.trim() ??
			c.req.header("Host") ??
			new URL(c.req.url).host;
		let originHost: string | null = null;
		try {
			originHost = new URL(origin).host;
		} catch {}
		if (originHost !== host) return fail(c, 403, "invalid_origin");
	} else {
		const site = c.req.header("Sec-Fetch-Site");
		if (site === "cross-site" || site === "same-site")
			return fail(c, 403, "invalid_origin");
	}
	return next();
};

/** 세션 조회(만료 정리·슬라이딩 연장)와 상태별 접근 판정을 한 곳에서 처리한다. */
export function sessionMiddleware(
	db: Db,
	now: () => number,
): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		c.set("auth", null);
		const token = getCookie(c, COOKIE_NAME);
		if (token) {
			const id = hashToken(token);
			const found = db
				.select({ expiresAt: sessions.expiresAt, user: users })
				.from(sessions)
				.innerJoin(users, eq(sessions.userId, users.id))
				.where(eq(sessions.id, id))
				.get();
			if (found) {
				const t = now();
				if (found.expiresAt <= t) {
					db.delete(sessions).where(eq(sessions.id, id)).run();
				} else {
					if (found.expiresAt - t < SLIDE_THRESHOLD_MS) {
						db.update(sessions)
							.set({ expiresAt: t + SESSION_TTL_MS })
							.where(eq(sessions.id, id))
							.run();
						writeSessionCookie(c, token);
					}
					c.set("auth", { user: found.user, sessionId: id });
				}
			}
		}
		const denied = decideAccess(
			c.req.method,
			c.req.path,
			c.var.auth?.user ?? null,
		);
		if (denied) return fail(c, denied === "unauthorized" ? 401 : 403, denied);
		return next();
	};
}
