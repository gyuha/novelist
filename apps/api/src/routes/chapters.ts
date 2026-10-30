import {
	and,
	asc,
	chapterSnapshots,
	chapters,
	type Db,
	desc,
	eq,
	sql,
} from "@novelist/db";
import {
	CHAPTER_BODY_MAX_BYTES,
	type Chapter,
	type ChapterListResponse,
	type ChapterSummary,
	createChapterRequestSchema,
	type Doc,
	emptyDoc,
	moveChapterRequestSchema,
	type SaveChapterBodyResponse,
	type Snapshot,
	type SnapshotListResponse,
	type SnapshotSummary,
	saveChapterBodyRequestSchema,
	updateChapterRequestSchema,
} from "@novelist/shared";
import { type Context, Hono } from "hono";
import { fail } from "../errors";
import type { AppEnv } from "../middleware";
import { addSnapshot } from "../snapshots";
import { validateJson } from "../validate";
import { findNovel } from "./novels";

type ChapterRow = typeof chapters.$inferSelect;
type SnapshotRow = typeof chapterSnapshots.$inferSelect;

const toSummary = (r: ChapterRow): ChapterSummary => ({
	id: r.id,
	novelId: r.novelId,
	title: r.title,
	position: r.position,
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
});
const toChapter = (r: ChapterRow): Chapter => ({
	...toSummary(r),
	body: JSON.parse(r.body) as Doc,
});
const toSnapshotSummary = (r: SnapshotRow): SnapshotSummary => ({
	id: r.id,
	chapterId: r.chapterId,
	kind: r.kind,
	createdAt: r.createdAt,
});

const byteLength = (s: string) => Buffer.byteLength(s, "utf8");
// 요청 본문 전체에 대한 거친 상한: 문서 1MB에 expectedUpdatedAt 등 봉투 여유만 더한다.
const REQUEST_SLACK_BYTES = 1024;

export function chapterRoutes(db: Db, now: () => number) {
	/** 소설 소유권을 확인한 뒤 챕터를 찾는다. 남의 것·없는 것·다른 소설의 챕터는 모두 같은 결과다. */
	function findChapter(c: Context<AppEnv>) {
		const novel = findNovel(db, c, c.req.param("novelId") ?? "");
		if (!novel) return undefined;
		return db
			.select()
			.from(chapters)
			.where(
				and(
					eq(chapters.id, c.req.param("chapterId") ?? ""),
					eq(chapters.novelId, novel.id),
				),
			)
			.get();
	}
	const listChapters = (novelId: string) =>
		db
			.select()
			.from(chapters)
			.where(eq(chapters.novelId, novelId))
			.orderBy(asc(chapters.position))
			.all();
	const nextVersion = (previous: number) => Math.max(now(), previous + 1);
	const listSnapshots = (chapterId: string) =>
		db
			.select()
			.from(chapterSnapshots)
			.where(eq(chapterSnapshots.chapterId, chapterId))
			.orderBy(desc(chapterSnapshots.createdAt), sql`rowid desc`)
			.all();

	return (
		new Hono<AppEnv>()
			.get("/:novelId/chapters", (c) => {
				const novel = findNovel(db, c, c.req.param("novelId"));
				if (!novel) return fail(c, 404, "not_found");
				return c.json<ChapterListResponse>(
					{ chapters: listChapters(novel.id).map(toSummary) },
					200,
				);
			})
			.post(
				"/:novelId/chapters",
				validateJson(createChapterRequestSchema),
				(c) => {
					const novel = findNovel(db, c, c.req.param("novelId"));
					if (!novel) return fail(c, 404, "not_found");
					const last = listChapters(novel.id).at(-1);
					const t = now();
					const row: ChapterRow = {
						id: crypto.randomUUID(),
						userId: novel.userId,
						novelId: novel.id,
						title: c.req.valid("json").title,
						position: last ? last.position + 1 : 0,
						body: JSON.stringify(emptyDoc()),
						createdAt: t,
						updatedAt: t,
					};
					db.insert(chapters).values(row).run();
					return c.json(toChapter(row), 201);
				},
			)
			.get("/:novelId/chapters/:chapterId", (c) => {
				const chapter = findChapter(c);
				return chapter
					? c.json(toChapter(chapter), 200)
					: fail(c, 404, "not_found");
			})
			.patch(
				"/:novelId/chapters/:chapterId",
				validateJson(updateChapterRequestSchema),
				(c) => {
					const chapter = findChapter(c);
					if (!chapter) return fail(c, 404, "not_found");
					// updatedAt은 본문 저장 버전이므로 제목 변경으로는 바꾸지 않는다.
					const updated = db
						.update(chapters)
						.set({ title: c.req.valid("json").title })
						.where(eq(chapters.id, chapter.id))
						.returning()
						.get();
					return c.json(toChapter(updated), 200);
				},
			)
			.delete("/:novelId/chapters/:chapterId", (c) => {
				const chapter = findChapter(c);
				if (!chapter) return fail(c, 404, "not_found");
				db.delete(chapters).where(eq(chapters.id, chapter.id)).run();
				return c.body(null, 204);
			})
			// 맨 위의 up, 맨 아래의 down은 순서를 바꾸지 않는 200 no-op이다(연타·경쟁에서도 오류가 나지 않게).
			.post(
				"/:novelId/chapters/:chapterId/move",
				validateJson(moveChapterRequestSchema),
				(c) => {
					const chapter = findChapter(c);
					if (!chapter) return fail(c, 404, "not_found");
					const { direction } = c.req.valid("json");
					const rows = listChapters(chapter.novelId);
					const index = rows.findIndex((r) => r.id === chapter.id);
					const neighbour = rows[index + (direction === "up" ? -1 : 1)];
					if (neighbour) {
						db.transaction((tx) => {
							tx.update(chapters)
								.set({ position: neighbour.position })
								.where(eq(chapters.id, chapter.id))
								.run();
							tx.update(chapters)
								.set({ position: chapter.position })
								.where(eq(chapters.id, neighbour.id))
								.run();
						});
					}
					return c.json<ChapterListResponse>(
						{ chapters: listChapters(chapter.novelId).map(toSummary) },
						200,
					);
				},
			)
			// 본문 크기(413)·형식(400)·버전(409) 검증을 위해 요청 본문을 직접 읽는다.
			.put("/:novelId/chapters/:chapterId/body", async (c) => {
				const chapter = findChapter(c);
				if (!chapter) return fail(c, 404, "not_found");
				const text = await c.req.text();
				if (byteLength(text) > CHAPTER_BODY_MAX_BYTES + REQUEST_SLACK_BYTES)
					return fail(c, 413, "payload_too_large");
				let json: unknown;
				try {
					json = JSON.parse(text);
				} catch {
					return fail(c, 400, "validation_error");
				}
				const rawBody = (json as { body?: unknown } | null)?.body;
				if (
					rawBody !== undefined &&
					byteLength(JSON.stringify(rawBody)) > CHAPTER_BODY_MAX_BYTES
				)
					return fail(c, 413, "payload_too_large");
				const parsed = saveChapterBodyRequestSchema.safeParse(json);
				if (!parsed.success) return fail(c, 400, "validation_error");
				const { body, expectedUpdatedAt } = parsed.data;
				if (chapter.updatedAt !== expectedUpdatedAt)
					return fail(c, 409, "version_conflict", {
						currentUpdatedAt: chapter.updatedAt,
					});
				const updatedAt = nextVersion(chapter.updatedAt);
				db.update(chapters)
					.set({ body: JSON.stringify(body), updatedAt })
					.where(eq(chapters.id, chapter.id))
					.run();
				return c.json<SaveChapterBodyResponse>({ updatedAt }, 200);
			})
			.get("/:novelId/chapters/:chapterId/snapshots", (c) => {
				const chapter = findChapter(c);
				if (!chapter) return fail(c, 404, "not_found");
				return c.json<SnapshotListResponse>(
					{ snapshots: listSnapshots(chapter.id).map(toSnapshotSummary) },
					200,
				);
			})
			.post("/:novelId/chapters/:chapterId/snapshots", (c) => {
				const chapter = findChapter(c);
				if (!chapter) return fail(c, 404, "not_found");
				const row = addSnapshot(db, now, {
					userId: chapter.userId,
					chapterId: chapter.id,
					body: chapter.body,
					kind: "manual",
				});
				return c.json(toSnapshotSummary(row), 201);
			})
			.get("/:novelId/chapters/:chapterId/snapshots/:snapshotId", (c) => {
				const chapter = findChapter(c);
				const snapshot =
					chapter && findSnapshot(chapter.id, c.req.param("snapshotId"));
				if (!snapshot) return fail(c, 404, "not_found");
				return c.json<Snapshot>(
					{
						...toSnapshotSummary(snapshot),
						body: JSON.parse(snapshot.body) as Doc,
					},
					200,
				);
			})
			// 복원 직전 본문을 auto 스냅샷으로 남긴 뒤 교체한다.
			.post(
				"/:novelId/chapters/:chapterId/snapshots/:snapshotId/restore",
				(c) => {
					const chapter = findChapter(c);
					const snapshot =
						chapter && findSnapshot(chapter.id, c.req.param("snapshotId"));
					if (!chapter || !snapshot) return fail(c, 404, "not_found");
					const restored = db.transaction((tx) => {
						addSnapshot(tx, now, {
							userId: chapter.userId,
							chapterId: chapter.id,
							body: chapter.body,
							kind: "auto",
						});
						return tx
							.update(chapters)
							.set({
								body: snapshot.body,
								updatedAt: nextVersion(chapter.updatedAt),
							})
							.where(eq(chapters.id, chapter.id))
							.returning()
							.get();
					});
					return c.json(toChapter(restored), 200);
				},
			)
	);

	function findSnapshot(chapterId: string, snapshotId: string) {
		return db
			.select()
			.from(chapterSnapshots)
			.where(
				and(
					eq(chapterSnapshots.id, snapshotId),
					eq(chapterSnapshots.chapterId, chapterId),
				),
			)
			.get();
	}
}
