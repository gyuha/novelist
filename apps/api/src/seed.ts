import { type Db, eq, users } from "@novelist/db";
import { hashPassword } from "./password";
import { deleteUserSessions } from "./session";

/** 관리자가 없으면 만들고, 있으면 비밀번호를 갱신한다(복구 경로). 갱신 시 기존 세션은 무효화한다. */
export async function ensureAdmin(
	db: Db,
	{ email, password }: { email: string; password: string },
	now: () => number = Date.now,
): Promise<"created" | "updated"> {
	const normalized = email.trim().toLowerCase();
	const passwordHash = await hashPassword(password);
	const existing = db
		.select()
		.from(users)
		.where(eq(users.email, normalized))
		.get();
	if (!existing) {
		const t = now();
		db.insert(users)
			.values({
				id: crypto.randomUUID(),
				email: normalized,
				passwordHash,
				role: "admin",
				status: "active",
				mustChangePassword: false,
				createdAt: t,
				approvedAt: t,
			})
			.run();
		return "created";
	}
	db.update(users)
		.set({
			passwordHash,
			role: "admin",
			status: "active",
			mustChangePassword: false,
		})
		.where(eq(users.id, existing.id))
		.run();
	deleteUserSessions(db, existing.id);
	return "updated";
}
