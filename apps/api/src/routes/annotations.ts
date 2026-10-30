import { and, annotations, chapters, type Db, eq, sql } from "@novelist/db";
import {
	type Annotation,
	type AnnotationListResponse,
	annotationIds,
	annotationListQuerySchema,
	CHAPTER_BODY_MAX_BYTES,
	type CreateAnnotationResponse,
	createAnnotationRequestSchema,
	hasOverlappingAnnotations,
	updateAnnotationRequestSchema,
} from "@novelist/shared";
import { type Context, Hono } from "hono";
import { quoteOf, reconcileAnnotations } from "../annotations";
import { readJsonWithDocLimit } from "../body-limit";
import { fail } from "../errors";
import type { AppEnv } from "../middleware";
import { validateJson, validateQuery } from "../validate";
import { findChapterOf } from "./chapters";

type AnnotationRow = typeof annotations.$inferSelect;

const toAnnotation = (r: AnnotationRow): Annotation => ({
	id: r.id,
	chapterId: r.chapterId,
	markId: r.markId,
	body: r.body,
	state: r.state,
	quote: r.quote,
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
});

export function annotationRoutes(db: Db, now: () => number) {
	const path = "/:novelId/chapters/:chapterId/annotations";
	/** 챕터 소유권을 확인한 뒤 그 챕터의 주석을 찾는다. 남의 것·없는 것은 구분하지 않는다. */
	const findAnnotation = (chapterId: string, c: Context<AppEnv>) =>
		db
			.select()
			.from(annotations)
			.where(
				and(
					eq(annotations.id, c.req.param("annotationId") ?? ""),
					eq(annotations.chapterId, chapterId),
				),
			)
			.get();

	return (
		new Hono<AppEnv>()
			.get(path, validateQuery(annotationListQuerySchema), (c) => {
				const chapter = findChapterOf(db, c);
				if (!chapter) return fail(c, 404, "not_found");
				const { state } = c.req.valid("query");
				const rows = db
					.select()
					.from(annotations)
					.where(
						and(
							eq(annotations.chapterId, chapter.id),
							state ? eq(annotations.state, state) : undefined,
						),
					)
					.orderBy(annotations.createdAt, sql`rowid`)
					.all();
				return c.json<AnnotationListResponse>(
					{ annotations: rows.map(toAnnotation) },
					200,
				);
			})
			// 새 마크가 든 챕터 본문 저장과 주석 행 생성을 한 트랜잭션으로 처리한다.
			.post(path, async (c) => {
				const chapter = findChapterOf(db, c);
				if (!chapter) return fail(c, 404, "not_found");
				const read = await readJsonWithDocLimit(
					c,
					"chapterBody",
					CHAPTER_BODY_MAX_BYTES,
				);
				if ("error" in read) return read.error;
				const parsed = createAnnotationRequestSchema.safeParse(read.json);
				if (!parsed.success) return fail(c, 400, "validation_error");
				const { markId, body, chapterBody, expectedUpdatedAt } = parsed.data;
				if (chapter.updatedAt !== expectedUpdatedAt)
					return fail(c, 409, "version_conflict", {
						currentUpdatedAt: chapter.updatedAt,
					});
				if (!annotationIds(chapterBody).has(markId))
					return fail(c, 400, "validation_error");
				if (hasOverlappingAnnotations(chapterBody))
					return fail(c, 400, "validation_error", {
						reason: "annotation_overlap",
						message: "이미 주석이 걸린 범위는 선택할 수 없습니다.",
					});
				const duplicate = db
					.select({ id: annotations.id })
					.from(annotations)
					.where(
						and(
							eq(annotations.chapterId, chapter.id),
							eq(annotations.markId, markId),
						),
					)
					.get();
				if (duplicate) return fail(c, 400, "validation_error");

				const t = now();
				const updatedAt = Math.max(t, chapter.updatedAt + 1);
				const id = crypto.randomUUID();
				const created = db.transaction((tx) => {
					tx.insert(annotations)
						.values({
							id,
							userId: chapter.userId,
							chapterId: chapter.id,
							markId,
							body,
							state: "anchored",
							quote: quoteOf(chapterBody, markId),
							createdAt: t,
							updatedAt: t,
						})
						.run();
					const clean = reconcileAnnotations(tx, now, chapter.id, chapterBody);
					tx.update(chapters)
						.set({ body: JSON.stringify(clean), updatedAt })
						.where(eq(chapters.id, chapter.id))
						.run();
					return tx
						.select()
						.from(annotations)
						.where(eq(annotations.id, id))
						.get() as AnnotationRow;
				});
				return c.json<CreateAnnotationResponse>(
					{ annotation: toAnnotation(created), updatedAt },
					201,
				);
			})
			.patch(
				`${path}/:annotationId`,
				validateJson(updateAnnotationRequestSchema),
				(c) => {
					const chapter = findChapterOf(db, c);
					const found = chapter && findAnnotation(chapter.id, c);
					if (!found) return fail(c, 404, "not_found");
					const updated = db
						.update(annotations)
						.set({ body: c.req.valid("json").body, updatedAt: now() })
						.where(eq(annotations.id, found.id))
						.returning()
						.get();
					return c.json(toAnnotation(updated), 200);
				},
			)
			// 행만 지운다. 본문의 마크는 다음 저장 때 제거된다.
			.delete(`${path}/:annotationId`, (c) => {
				const chapter = findChapterOf(db, c);
				const found = chapter && findAnnotation(chapter.id, c);
				if (!found) return fail(c, 404, "not_found");
				db.delete(annotations).where(eq(annotations.id, found.id)).run();
				return c.body(null, 204);
			})
	);
}
