import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

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

export const novels = sqliteTable(
	"novels",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		description: text("description"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(t) => [index("novels_user_id_idx").on(t.userId)],
);

export const chapters = sqliteTable(
	"chapters",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		novelId: text("novel_id")
			.notNull()
			.references(() => novels.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		position: integer("position").notNull(),
		// ProseMirror JSON(문자열). 형식 검증은 shared 문서 모델이 맡는다.
		body: text("body").notNull(),
		createdAt: integer("created_at").notNull(),
		// 본문 저장 때만 갱신한다(저장 충돌 판정용).
		updatedAt: integer("updated_at").notNull(),
	},
	(t) => [
		index("chapters_user_id_idx").on(t.userId),
		index("chapters_novel_id_position_idx").on(t.novelId, t.position),
	],
);

export const chapterSnapshots = sqliteTable(
	"chapter_snapshots",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		chapterId: text("chapter_id")
			.notNull()
			.references(() => chapters.id, { onDelete: "cascade" }),
		body: text("body").notNull(),
		kind: text("kind", { enum: ["auto", "manual"] }).notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(t) => [
		index("chapter_snapshots_user_id_idx").on(t.userId),
		index("chapter_snapshots_chapter_id_idx").on(t.chapterId),
	],
);

export const memos = sqliteTable(
	"memos",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: ["novel", "chapter", "free"] }).notNull(),
		novelId: text("novel_id").references(() => novels.id, {
			onDelete: "cascade",
		}),
		chapterId: text("chapter_id").references(() => chapters.id, {
			onDelete: "cascade",
		}),
		// 선택 입력, 최대 200자. 비면 목록에는 본문 첫 줄을 보여준다.
		title: text("title"),
		// ProseMirror JSON(문자열). 챕터와 같은 문서 모델에서 주석 마크를 뺀 것.
		body: text("body").notNull(),
		aiReference: integer("ai_reference", { mode: "boolean" })
			.notNull()
			.default(false),
		createdAt: integer("created_at").notNull(),
		// 메모 저장마다 갱신(저장 충돌 판정용).
		updatedAt: integer("updated_at").notNull(),
	},
	(t) => [
		index("memos_user_id_idx").on(t.userId),
		index("memos_novel_id_idx").on(t.novelId),
		index("memos_chapter_id_idx").on(t.chapterId),
		check(
			"memos_kind_owner_check",
			sql`(${t.kind} = 'free' AND ${t.novelId} IS NULL AND ${t.chapterId} IS NULL)
				OR (${t.kind} = 'novel' AND ${t.novelId} IS NOT NULL AND ${t.chapterId} IS NULL)
				OR (${t.kind} = 'chapter' AND ${t.novelId} IS NOT NULL AND ${t.chapterId} IS NOT NULL)`,
		),
		check(
			"memos_title_length_check",
			sql`${t.title} IS NULL OR length(${t.title}) <= 200`,
		),
	],
);

export const annotations = sqliteTable(
	"annotations",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		chapterId: text("chapter_id")
			.notNull()
			.references(() => chapters.id, { onDelete: "cascade" }),
		// 본문 주석 마크의 id. 챕터 안에서 유일.
		markId: text("mark_id").notNull(),
		body: text("body").notNull(),
		state: text("state", { enum: ["anchored", "orphaned"] })
			.notNull()
			.default("anchored"),
		// 걸려 있던 텍스트(위치를 잃어도 남김)
		quote: text("quote").notNull(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(t) => [
		index("annotations_user_id_idx").on(t.userId),
		uniqueIndex("annotations_chapter_id_mark_id_idx").on(t.chapterId, t.markId),
	],
);
