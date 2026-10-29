import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	role: text("role", { enum: ["member", "admin"] })
		.notNull()
		.default("member"),
	status: text("status", { enum: ["pending", "active", "suspended"] })
		.notNull()
		.default("pending"),
	mustChangePassword: integer("must_change_password", { mode: "boolean" })
		.notNull()
		.default(false),
	createdAt: integer("created_at").notNull(),
	approvedAt: integer("approved_at"),
});

export const sessions = sqliteTable(
	"sessions",
	{
		// 세션 토큰의 SHA-256 해시. 토큰 원문은 저장하지 않는다.
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		expiresAt: integer("expires_at").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(t) => [index("sessions_user_id_idx").on(t.userId)],
);
