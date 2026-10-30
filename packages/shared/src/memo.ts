import { z } from "zod";
import { chapterDocSchema, memoDocSchema } from "./document";

export const MEMO_TITLE_MAX_LENGTH = 200;
/** 메모 본문 JSON 상한(바이트). 초과하면 413. */
export const MEMO_BODY_MAX_BYTES = 200 * 1024;
export const ANNOTATION_BODY_MAX_LENGTH = 5000;
/** 서버가 저장하는 인용문(걸려 있던 텍스트)의 최대 길이 */
export const ANNOTATION_QUOTE_MAX_LENGTH = 1000;

export const memoKindSchema = z.enum(["novel", "chapter", "free"]);
export const annotationStateSchema = z.enum(["anchored", "orphaned"]);
export type MemoKind = z.infer<typeof memoKindSchema>;
export type AnnotationState = z.infer<typeof annotationStateSchema>;

const memoTitleSchema = z.string().trim().max(MEMO_TITLE_MAX_LENGTH);

// 종류-소속: free는 소속 없음, novel은 novelId만, chapter는 chapterId(novelId는 선택, 주면 챕터의 소설과 같아야 함)
const scopeFields = {
	kind: memoKindSchema,
	novelId: z.string().min(1).optional(),
	chapterId: z.string().min(1).optional(),
};
const scopeConsistent = (v: {
	kind: MemoKind;
	novelId?: string;
	chapterId?: string;
}) =>
	v.kind === "free"
		? v.novelId === undefined && v.chapterId === undefined
		: v.kind === "novel"
			? v.novelId !== undefined && v.chapterId === undefined
			: v.chapterId !== undefined;

export const memoScopeSchema = z
	.object(scopeFields)
	.refine(scopeConsistent, "kind와 소속이 맞지 않습니다.");

// 요청
export const createMemoRequestSchema = z
	.object({
		...scopeFields,
		title: memoTitleSchema.optional(),
		body: memoDocSchema.optional(),
		aiReference: z.boolean().optional(),
	})
	.refine(scopeConsistent, "kind와 소속이 맞지 않습니다.");
// title: null 또는 빈 문자열이면 지운다. expectedUpdatedAt: 불러온 메모의 updatedAt, 다르면 409.
export const updateMemoRequestSchema = z
	.object({
		scope: memoScopeSchema.optional(),
		title: memoTitleSchema.nullable().optional(),
		body: memoDocSchema.optional(),
		aiReference: z.boolean().optional(),
		expectedUpdatedAt: z.number().int(),
	})
	.refine(
		(v) =>
			v.scope !== undefined ||
			v.title !== undefined ||
			v.body !== undefined ||
			v.aiReference !== undefined,
	);
// scope로 종류를 거르고 novelId·chapterId는 추가 조건이다(all이면 종류 제한 없음).
export const memoListQuerySchema = z.object({
	scope: z.enum(["all", "free", "novel", "chapter"]).default("all"),
	novelId: z.string().min(1).optional(),
	chapterId: z.string().min(1).optional(),
});

export const annotationBodySchema = z
	.string()
	.trim()
	.min(1)
	.max(ANNOTATION_BODY_MAX_LENGTH);
// 주석 생성은 새 마크가 든 챕터 본문 저장을 겸한다(한 요청·한 트랜잭션).
export const createAnnotationRequestSchema = z.object({
	markId: z.string().min(1).max(64),
	body: annotationBodySchema,
	chapterBody: chapterDocSchema,
	expectedUpdatedAt: z.number().int(),
});
export const updateAnnotationRequestSchema = z.object({
	body: annotationBodySchema,
});
export const annotationListQuerySchema = z.object({
	state: annotationStateSchema.optional(),
});

export type CreateMemoRequest = z.infer<typeof createMemoRequestSchema>;
export type UpdateMemoRequest = z.infer<typeof updateMemoRequestSchema>;
export type MemoListQuery = z.infer<typeof memoListQuerySchema>;
export type CreateAnnotationRequest = z.infer<
	typeof createAnnotationRequestSchema
>;
export type UpdateAnnotationRequest = z.infer<
	typeof updateAnnotationRequestSchema
>;

// 응답
export const memoSchema = z.object({
	id: z.string(),
	kind: memoKindSchema,
	novelId: z.string().nullable(),
	chapterId: z.string().nullable(),
	title: z.string().nullable(),
	body: memoDocSchema,
	aiReference: z.boolean(),
	createdAt: z.number(),
	updatedAt: z.number(),
});
export const memoListResponseSchema = z.object({ memos: z.array(memoSchema) });

export const annotationSchema = z.object({
	id: z.string(),
	chapterId: z.string(),
	markId: z.string(),
	body: z.string(),
	state: annotationStateSchema,
	quote: z.string(),
	createdAt: z.number(),
	updatedAt: z.number(),
});
export const annotationListResponseSchema = z.object({
	annotations: z.array(annotationSchema),
});
// updatedAt: 저장된 챕터 본문의 새 버전
export const createAnnotationResponseSchema = z.object({
	annotation: annotationSchema,
	updatedAt: z.number(),
});
// 챕터·소설 삭제 확인창용
export const deletePreviewResponseSchema = z.object({ memoCount: z.number() });

export type Memo = z.infer<typeof memoSchema>;
export type MemoListResponse = z.infer<typeof memoListResponseSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type AnnotationListResponse = z.infer<
	typeof annotationListResponseSchema
>;
export type CreateAnnotationResponse = z.infer<
	typeof createAnnotationResponseSchema
>;
export type DeletePreviewResponse = z.infer<typeof deletePreviewResponseSchema>;
