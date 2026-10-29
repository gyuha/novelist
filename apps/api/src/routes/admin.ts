import { type Db, eq, users } from "@novelist/db";
import type { AdminMember } from "@novelist/shared";
import { type Context, Hono } from "hono";
import { fail } from "../errors";
import type { AppEnv, UserRow } from "../middleware";
import { generateTemporaryPassword, hashPassword } from "../password";
import { deleteUserSessions } from "../session";

const toMember = (u: UserRow): AdminMember => ({
	id: u.id,
	email: u.email,
	role: u.role,
	status: u.status,
	createdAt: u.createdAt,
	approvedAt: u.approvedAt,
});

export function adminRoutes(db: Db, now: () => number) {
	// 관리자 계정(자기 자신 포함)에는 어떤 조작도 적용하지 않는다.
	function guard(c: Context<AppEnv>, id: string) {
		const target = db.select().from(users).where(eq(users.id, id)).get();
		if (!target) return { res: fail(c, 404, "not_found") };
		if (target.role === "admin")
			return { res: fail(c, 403, "admin_target_forbidden") };
		return { target };
	}

	const update = (id: string, patch: Partial<typeof users.$inferInsert>) =>
		toMember(
			db
				.update(users)
				.set(patch)
				.where(eq(users.id, id))
				.returning()
				.get() as UserRow,
		);

	return new Hono<AppEnv>()
		.get("/pending", (c) =>
			c.json(
				{
					members: db
						.select()
						.from(users)
						.where(eq(users.status, "pending"))
						.all()
						.map(toMember),
				},
				200,
			),
		)
		.get("/members", (c) =>
			c.json(
				{
					members: db
						.select()
						.from(users)
						.all()
						.filter((u) => u.status !== "pending")
						.map(toMember),
				},
				200,
			),
		)
		.post("/members/:id/approve", (c) => {
			const { target, res } = guard(c, c.req.param("id"));
			if (!target) return res;
			if (target.status !== "pending") return fail(c, 409, "invalid_state");
			return c.json(
				update(target.id, { status: "active", approvedAt: now() }),
				200,
			);
		})
		.post("/members/:id/reject", (c) => {
			const { target, res } = guard(c, c.req.param("id"));
			if (!target) return res;
			if (target.status !== "pending") return fail(c, 409, "invalid_state");
			db.delete(users).where(eq(users.id, target.id)).run();
			return c.body(null, 204);
		})
		.post("/members/:id/suspend", (c) => {
			const { target, res } = guard(c, c.req.param("id"));
			if (!target) return res;
			if (target.status !== "active") return fail(c, 409, "invalid_state");
			const member = update(target.id, { status: "suspended" });
			deleteUserSessions(db, target.id);
			return c.json(member, 200);
		})
		.post("/members/:id/unsuspend", (c) => {
			const { target, res } = guard(c, c.req.param("id"));
			if (!target) return res;
			if (target.status !== "suspended") return fail(c, 409, "invalid_state");
			return c.json(update(target.id, { status: "active" }), 200);
		})
		.post("/members/:id/reset-password", async (c) => {
			const { target, res } = guard(c, c.req.param("id"));
			if (!target) return res;
			if (target.status === "pending") return fail(c, 409, "invalid_state");
			const temporaryPassword = generateTemporaryPassword();
			update(target.id, {
				passwordHash: await hashPassword(temporaryPassword),
				mustChangePassword: true,
			});
			deleteUserSessions(db, target.id);
			return c.json({ temporaryPassword }, 200);
		})
		.delete("/members/:id", (c) => {
			const { target, res } = guard(c, c.req.param("id"));
			if (!target) return res;
			db.delete(users).where(eq(users.id, target.id)).run(); // sessions는 ON DELETE CASCADE
			return c.body(null, 204);
		});
}
