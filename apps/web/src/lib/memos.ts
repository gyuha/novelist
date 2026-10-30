import {
	type Annotation,
	annotationListResponseSchema,
	annotationSchema,
	type Chapter,
	createAnnotationResponseSchema,
	type Doc,
	deletePreviewResponseSchema,
	type MemoDoc,
	type MemoKind,
	memoListResponseSchema,
	memoSchema,
	stripAnnotations,
} from "@novelist/shared";
import { api, request } from "./api";

const memos = api.api.memos;
const novels = api.api.novels;

export type MemoScope = {
	kind: MemoKind;
	novelId?: string;
	chapterId?: string;
};

export type MemoFilter = {
	scope: "all" | "free" | "novel" | "chapter";
	novelId?: string;
	chapterId?: string;
};

export async function listMemos(filter: MemoFilter) {
	const query: Record<string, string> = { scope: filter.scope };
	if (filter.novelId) query.novelId = filter.novelId;
	if (filter.chapterId) query.chapterId = filter.chapterId;
	const res = await request(memos.$get({ query }));
	return memoListResponseSchema.parse(await res.json()).memos;
}

export async function getMemo(memoId: string) {
	const res = await request(memos[":memoId"].$get({ param: { memoId } }));
	return memoSchema.parse(await res.json());
}

const jsonInit = (payload: unknown) => ({
	init: {
		body: JSON.stringify(payload),
		headers: { "Content-Type": "application/json" },
	},
});

/** Memo routes have no request validator, so the JSON goes through `init`. */
export async function createMemo(
	scope: MemoScope,
	input: { title?: string; body: MemoDoc; aiReference: boolean },
) {
	const res = await request(memos.$post({}, jsonInit({ ...scope, ...input })));
	return memoSchema.parse(await res.json());
}

export async function updateMemo(
	memoId: string,
	input: {
		scope?: MemoScope;
		title?: string | null;
		body?: MemoDoc;
		aiReference?: boolean;
		expectedUpdatedAt: number;
	},
) {
	const res = await request(
		memos[":memoId"].$patch({ param: { memoId } }, jsonInit(input)),
	);
	return memoSchema.parse(await res.json());
}

export async function deleteMemo(memoId: string) {
	await request(memos[":memoId"].$delete({ param: { memoId } }));
}

export async function novelDeletePreview(novelId: string) {
	const res = await request(
		novels[":novelId"]["delete-preview"].$get({ param: { novelId } }),
	);
	return deletePreviewResponseSchema.parse(await res.json()).memoCount;
}

export async function chapterDeletePreview(novelId: string, chapterId: string) {
	const res = await request(
		novels[":novelId"].chapters[":chapterId"]["delete-preview"].$get({
			param: { novelId, chapterId },
		}),
	);
	return deletePreviewResponseSchema.parse(await res.json()).memoCount;
}

const annotationsRoute = novels[":novelId"].chapters[":chapterId"].annotations;

export async function listAnnotations(novelId: string, chapterId: string) {
	const res = await request(
		annotationsRoute.$get({ param: { novelId, chapterId }, query: {} }),
	);
	return annotationListResponseSchema.parse(await res.json()).annotations;
}

/** Saves the chapter body (already carrying the new mark) and the annotation row in one request. */
export async function createAnnotation(
	novelId: string,
	chapterId: string,
	input: {
		markId: string;
		body: string;
		chapterBody: Doc;
		expectedUpdatedAt: number;
	},
) {
	const res = await request(
		annotationsRoute.$post({ param: { novelId, chapterId } }, jsonInit(input)),
	);
	return createAnnotationResponseSchema.parse(await res.json());
}

export async function updateAnnotation(
	novelId: string,
	chapterId: string,
	annotationId: string,
	body: string,
): Promise<Annotation> {
	const res = await request(
		annotationsRoute[":annotationId"].$patch({
			param: { novelId, chapterId, annotationId },
			json: { body },
		}),
	);
	return annotationSchema.parse(await res.json());
}

export async function deleteAnnotation(
	novelId: string,
	chapterId: string,
	annotationId: string,
) {
	await request(
		annotationsRoute[":annotationId"].$delete({
			param: { novelId, chapterId, annotationId },
		}),
	);
}

/** Marks whose annotation row is gone (deleted, not yet stripped by a save) are not shown. */
export async function withLiveMarks(
	novelId: string,
	chapter: Chapter,
): Promise<Chapter> {
	try {
		const rows = await listAnnotations(novelId, chapter.id);
		const live = new Set(rows.map((r) => r.markId));
		return {
			...chapter,
			body: stripAnnotations(chapter.body, (id) => live.has(id)),
		};
	} catch {
		return chapter;
	}
}
