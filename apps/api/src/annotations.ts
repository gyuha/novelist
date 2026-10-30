import { annotations, type Db, eq } from "@novelist/db";
import {
	ANNOTATION_QUOTE_MAX_LENGTH,
	annotationIds,
	annotationQuote,
	type Doc,
	stripAnnotations,
} from "@novelist/shared";

type DbLike = Pick<Db, "select" | "update">;

export const quoteOf = (doc: Doc, markId: string) =>
	annotationQuote(doc, markId).slice(0, ANNOTATION_QUOTE_MAX_LENGTH);

/**
 * 챕터 본문 저장·스냅샷 복원 때 호출한다. 행이 없는 주석 마크를 본문에서 제거하고,
 * 그 챕터의 주석 행마다 마크가 본문에 있으면 anchored(인용문 갱신), 없으면 orphaned(인용문 유지)로 맞춘다.
 * 저장해야 할 본문(마크 제거 후)을 돌려준다. 저장과 같은 트랜잭션에서 불러야 한다.
 */
export function reconcileAnnotations(
	db: DbLike,
	now: () => number,
	chapterId: string,
	doc: Doc,
): Doc {
	const rows = db
		.select()
		.from(annotations)
		.where(eq(annotations.chapterId, chapterId))
		.all();
	const known = new Set(rows.map((r) => r.markId));
	const clean = stripAnnotations(doc, (id) => known.has(id));
	const present = annotationIds(clean);
	for (const row of rows) {
		const anchored = present.has(row.markId);
		const state = anchored ? "anchored" : "orphaned";
		const quote = anchored
			? quoteOf(clean, row.markId) || row.quote
			: row.quote;
		if (state !== row.state || quote !== row.quote)
			db.update(annotations)
				.set({ state, quote, updatedAt: now() })
				.where(eq(annotations.id, row.id))
				.run();
	}
	return clean;
}
