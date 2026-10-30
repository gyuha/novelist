import {
	and,
	chapterSnapshots,
	type Db,
	desc,
	eq,
	inArray,
	sql,
} from "@novelist/db";
import { AUTO_SNAPSHOT_LIMIT, type SnapshotKind } from "@novelist/shared";

type DbLike = Pick<Db, "insert" | "select" | "delete">;

/** 챕터 본문 사본을 남긴다. auto는 챕터당 최근 20개만 남기고 오래된 것부터 지운다(manual은 지우지 않음). */
export function addSnapshot(
	db: DbLike,
	now: () => number,
	s: { userId: string; chapterId: string; body: string; kind: SnapshotKind },
) {
	const row = { id: crypto.randomUUID(), createdAt: now(), ...s };
	db.insert(chapterSnapshots).values(row).run();
	if (s.kind === "auto") {
		const stale = db
			.select({ id: chapterSnapshots.id })
			.from(chapterSnapshots)
			.where(
				and(
					eq(chapterSnapshots.chapterId, s.chapterId),
					eq(chapterSnapshots.kind, "auto"),
				),
			)
			.orderBy(desc(chapterSnapshots.createdAt), sql`rowid desc`)
			.all()
			.slice(AUTO_SNAPSHOT_LIMIT);
		if (stale.length > 0)
			db.delete(chapterSnapshots)
				.where(
					inArray(
						chapterSnapshots.id,
						stale.map((r) => r.id),
					),
				)
				.run();
	}
	return row;
}
