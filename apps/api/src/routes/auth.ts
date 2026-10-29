import { and, type Db, eq, ne, sessions, users } from "@novelist/db";
import {
	changePasswordRequestSchema,
	loginRequestSchema,
	type MeResponse,
	signupRequestSchema,
} from "@novelist/shared";
import { Hono } from "hono";
import { fail } from "../errors";
import type { LoginLimiter } from "../login-limiter";
import type { AppEnv, UserRow } from "../middleware";
import { hashPassword, verifyPassword } from "../password";
import {
	clearSessionCookie,
	createSession,
	writeSessionCookie,
} from "../session";
import { validateJson } from "../validate";

export const toMe = (u: UserRow): MeResponse => ({
	id: u.id,
	email: u.email,
	role: u.role,
	status: u.status,
	mustChangePassword: u.mustChangePassword,
});

// 이메일이 없을 때도 같은 시간이 걸리도록 쓰는 더미 해시 검증 대상
const DUMMY_HASH = `scrypt$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(64).toString("base64")}`;

export function authRoutes(db: Db, now: () => number, limiter: LoginLimiter) {
	return new Hono<AppEnv>()
		.post("/signup", validateJson(signupRequestSchema), async (c) => {
			const { email, password } = c.req.valid("json");
			const t = now();
			const user: UserRow = {
				id: crypto.randomUUID(),
				email,
				passwordHash: await hashPassword(password),
				role: "member",
				status: "pending",
				mustChangePassword: false,
				createdAt: t,
				approvedAt: null,
			};
			const inserted = db
				.insert(users)
				.values(user)
				.onConflictDoNothing()
				.run();
			if (inserted.changes === 0) return fail(c, 409, "email_taken");
			writeSessionCookie(c, createSession(db, user.id, t));
			return c.json(toMe(user), 201);
		})
		.post("/login", validateJson(loginRequestSchema), async (c) => {
			const { email, password } = c.req.valid("json");
			if (limiter.isBlocked(email)) return fail(c, 429, "too_many_attempts");
			const user = db.select().from(users).where(eq(users.email, email)).get();
			const ok = await verifyPassword(
				password,
				user?.passwordHash ?? DUMMY_HASH,
			);
			if (!user || !ok) {
				limiter.recordFailure(email);
				return fail(c, 401, "invalid_credentials");
			}
			limiter.reset(email);
			if (user.status === "suspended") return fail(c, 403, "account_suspended");
			writeSessionCookie(c, createSession(db, user.id, now()));
			return c.json(toMe(user), 200);
		})
		.post("/logout", (c) => {
			const auth = c.var.auth;
			if (auth)
				db.delete(sessions).where(eq(sessions.id, auth.sessionId)).run();
			clearSessionCookie(c);
			return c.body(null, 204);
		})
		.get("/me", (c) =>
			c.json(toMe((c.var.auth as NonNullable<typeof c.var.auth>).user), 200),
		)
		.post("/password", validateJson(changePasswordRequestSchema), async (c) => {
			const auth = c.var.auth as NonNullable<typeof c.var.auth>;
			const { currentPassword, newPassword } = c.req.valid("json");
			if (!(await verifyPassword(currentPassword, auth.user.passwordHash))) {
				return fail(c, 400, "invalid_current_password");
			}
			db.update(users)
				.set({
					passwordHash: await hashPassword(newPassword),
					mustChangePassword: false,
				})
				.where(eq(users.id, auth.user.id))
				.run();
			db.delete(sessions)
				.where(
					and(
						eq(sessions.userId, auth.user.id),
						ne(sessions.id, auth.sessionId),
					),
				)
				.run();
			return c.body(null, 204);
		});
}
