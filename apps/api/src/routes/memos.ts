import {
	and,
	chapters,
	type Db,
	desc,
	eq,
	memos,
	novels,
	sql,
} from "@novelist/db";
import {
	createMemoRequestSchema,
	type DeletePreviewResponse,
	emptyDoc,
	MEMO_BODY_MAX_BYTES,
	type Memo,
	type MemoDoc,
	type MemoKind,
	type MemoListResponse,
	memoListQuerySchema,
	updateMemoRequestSchema,
} from "@novelist/shared";
import { type Context, Hono } from "hono";
import { readJsonWithDocLimit } from "../body-limit";
import { fail } from "../errors";
import type { AppEnv } from "../middleware";
import { validateQuery } from "../validate";
import { findChapterOf } from "./chapters";
import { findNovel } from "./novels";

type MemoRow = typeof memos.$inferSelect;

const toMemo = (r: MemoRow): Memo => ({
	id: r.id,
	kind: r.kind,
	novelId: r.novelId,
	chapterId: r.chapterId,
	title: r.title,
	body: JSON.parse(r.body) as MemoDoc,
	aiReference: r.aiReference,
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
});

const TOO_LARGE = "메모 본문이 너무 큽니다. 200KB 이하로 줄여 주세요.";
const userIdOf = (c: Context<AppEnv>) =>
	(c.var.auth as NonNullable<typeof c.var.auth>).user.id;

export function memoRoutes(db: Db, now: () => number) {
	/**
	 * 종류-소속을 실제 소유 데이터로 풀어낸다. 남의 소설·챕터는 404, 챕터와 다른 novelId는 400.
	 * chapter는 novelId를 챕터에서 채운다. (스키마가 kind와 id 유무의 일치는 이미 검증했다.)
	 */
	function resolveScope(
		c: Context<AppEnv>,
		scope: { kind: MemoKind; novelId?: string; chapterId?: string },
	):
		| { kind: MemoKind; novelId: string | null; chapterId: string | null }
		| { error: Response } {
		const userId = userIdOf(c);
		if (scope.kind === "free")
			return { kind: "free", novelId: null, chapterId: null };
		if (scope.kind === "novel") {
			const novel = db
				.select({ id: novels.id })
				.from(novels)
				.where(
					and(
						eq(novels.id, scope.novelId as string),
						eq(novels.userId, userId),
					),
				)
				.get();
			if (!novel) return { error: fail(c, 404, "not_found") };
			return { kind: "novel", novelId: novel.id, chapterId: null };
		}
		const chapter = db
			.select({ id: chapters.id, novelId: chapters.novelId })
			.from(chapters)
			.where(
				and(
					eq(chapters.id, scope.chapterId as string),
					eq(chapters.userId, userId),
				),
			)
			.get();
		if (!chapter) return { error: fail(c, 404, "not_found") };
		if (scope.novelId !== undefined && scope.novelId !== chapter.novelId)
			return { error: fail(c, 400, "validation_error") };
		return { kind: "chapter", novelId: chapter.novelId, chapterId: chapter.id };
	}
	const findMemo = (c: Context<AppEnv>) =>
		db
			.select()
			.from(memos)
			.where(
				and(
					eq(memos.id, c.req.param("memoId") ?? ""),
					eq(memos.userId, userIdOf(c)),
				),
			)
			.get();

	return new Hono<AppEnv>()
		.get("/", validateQuery(memoListQuerySchema), (c) => {
			const { scope, novelId, chapterId } = c.req.valid("query");
			const rows = db
				.select()
				.from(memos)
				.where(
					and(
						eq(memos.userId, userIdOf(c)),
						scope === "all" ? undefined : eq(memos.kind, scope),
						novelId ? eq(memos.novelId, novelId) : undefined,
						chapterId ? eq(memos.chapterId, chapterId) : undefined,
					),
				)
				.orderBy(desc(memos.updatedAt), sql`rowid desc`)
				.all();
			return c.json<MemoListResponse>({ memos: rows.map(toMemo) }, 200);
		})
		.post("/", async (c) => {
			const read = await readJsonWithDocLimit(
				c,
				"body",
				MEMO_BODY_MAX_BYTES,
				TOO_LARGE,
			);
			if ("error" in read) return read.error;
			const parsed = createMemoRequestSchema.safeParse(read.json);
			if (!parsed.success) return fail(c, 400, "validation_error");
			const { title, body, aiReference, ...scope } = parsed.data;
			const resolved = resolveScope(c, scope);
			if ("error" in resolved) return resolved.error;
			const t = now();
			const row: MemoRow = {
				id: crypto.randomUUID(),
				userId: userIdOf(c),
				...resolved,
				title: title || null,
				body: JSON.stringify(body ?? emptyDoc()),
				aiReference: aiReference ?? false,
				createdAt: t,
				updatedAt: t,
			};
			db.insert(memos).values(row).run();
			return c.json(toMemo(row), 201);
		})
		.get("/:memoId", (c) => {
			const memo = findMemo(c);
			return memo ? c.json(toMemo(memo), 200) : fail(c, 404, "not_found");
		})
		.patch("/:memoId", async (c) => {
			const memo = findMemo(c);
			if (!memo) return fail(c, 404, "not_found");
			const read = await readJsonWithDocLimit(
				c,
				"body",
				MEMO_BODY_MAX_BYTES,
				TOO_LARGE,
			);
			if ("error" in read) return read.error;
			const parsed = updateMemoRequestSchema.safeParse(read.json);
			if (!parsed.success) return fail(c, 400, "validation_error");
			const { scope, title, body, aiReference, expectedUpdatedAt } =
				parsed.data;
			if (memo.updatedAt !== expectedUpdatedAt)
				return fail(c, 409, "version_conflict", {
					currentUpdatedAt: memo.updatedAt,
				});
			const resolved = scope && resolveScope(c, scope);
			if (resolved && "error" in resolved) return resolved.error;
			const updated = db
				.update(memos)
				.set({
					...resolved,
					...(title !== undefined && { title: title || null }),
					...(body !== undefined && { body: JSON.stringify(body) }),
					...(aiReference !== undefined && { aiReference }),
					updatedAt: Math.max(now(), memo.updatedAt + 1),
				})
				.where(eq(memos.id, memo.id))
				.returning()
				.get();
			return c.json(toMemo(updated), 200);
		})
		.delete("/:memoId", (c) => {
			const memo = findMemo(c);
			if (!memo) return fail(c, 404, "not_found");
			db.delete(memos).where(eq(memos.id, memo.id)).run();
			return c.body(null, 204);
		});
}

/** 챕터·소설 삭제 확인창에 보여줄, 함께 지워질 메모 수 */
export function deletePreviewRoutes(db: Db) {
	const count = (where: ReturnType<typeof eq>) =>
		(
			db
				.select({ n: sql<number>`count(*)` })
				.from(memos)
				.where(where)
				.get() as { n: number }
		).n;
	return new Hono<AppEnv>()
		.get("/:novelId/delete-preview", (c) => {
			const novel = findNovel(db, c, c.req.param("novelId"));
			if (!novel) return fail(c, 404, "not_found");
			return c.json<DeletePreviewResponse>(
				{ memoCount: count(eq(memos.novelId, novel.id)) },
				200,
			);
		})
		.get("/:novelId/chapters/:chapterId/delete-preview", (c) => {
			const chapter = findChapterOf(db, c);
			if (!chapter) return fail(c, 404, "not_found");
			return c.json<DeletePreviewResponse>(
				{ memoCount: count(eq(memos.chapterId, chapter.id)) },
				200,
			);
		});
}
