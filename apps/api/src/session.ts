import { createHash, randomBytes } from "node:crypto";
import { type Db, eq, sessions } from "@novelist/db";
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

export const COOKIE_NAME = "novelist_session";
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
export const SLIDE_THRESHOLD_MS = 15 * DAY_MS;

export const hashToken = (token: string) =>
	createHash("sha256").update(token).digest("hex");

export function writeSessionCookie(c: Context, token: string) {
	setCookie(c, COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: "Lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: SESSION_TTL_MS / 1000,
	});
}

export function clearSessionCookie(c: Context) {
	deleteCookie(c, COOKIE_NAME, { path: "/" });
}

/** 세션을 만들고 쿠키에 담을 토큰 원문을 돌려준다. DB에는 해시만 저장한다. */
export function createSession(db: Db, userId: string, now: number): string {
	const token = randomBytes(32).toString("base64url");
	db.insert(sessions)
		.values({
			id: hashToken(token),
			userId,
			expiresAt: now + SESSION_TTL_MS,
			createdAt: now,
		})
		.run();
	return token;
}

export function deleteUserSessions(db: Db, userId: string) {
	db.delete(sessions).where(eq(sessions.userId, userId)).run();
}
