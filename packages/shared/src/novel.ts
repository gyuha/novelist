import { z } from "zod";
import { docSchema } from "./document";

export const NOVEL_TITLE_MAX_LENGTH = 200;
export const CHAPTER_TITLE_MAX_LENGTH = 200;
export const NOVEL_DESCRIPTION_MAX_LENGTH = 1000;
/** 챕터 본문 JSON 상한(바이트). 초과하면 413. */
export const CHAPTER_BODY_MAX_BYTES = 1024 * 1024;
/** 챕터당 보관하는 자동 스냅샷 수 */
export const AUTO_SNAPSHOT_LIMIT = 20;

const novelTitleSchema = z.string().trim().min(1).max(NOVEL_TITLE_MAX_LENGTH);
const chapterTitleSchema = z
	.string()
	.trim()
	.min(1)
	.max(CHAPTER_TITLE_MAX_LENGTH);
const descriptionSchema = z.string().trim().max(NOVEL_DESCRIPTION_MAX_LENGTH);

// 요청
export const createNovelRequestSchema = z.object({
	title: novelTitleSchema,
	description: descriptionSchema.optional(),
});
// description: null 또는 빈 문자열이면 지운다.
export const updateNovelRequestSchema = z
	.object({
		title: novelTitleSchema.optional(),
		description: descriptionSchema.nullable().optional(),
	})
	.refine((v) => v.title !== undefined || v.description !== undefined);
export const createChapterRequestSchema = z.object({
	title: chapterTitleSchema,
});
export const updateChapterRequestSchema = z.object({
	title: chapterTitleSchema,
});
export const moveChapterRequestSchema = z.object({
	direction: z.enum(["up", "down"]),
});
// expectedUpdatedAt: 불러온 챕터의 updatedAt. 서버 값과 다르면 409.
export const saveChapterBodyRequestSchema = z.object({
	body: docSchema,
	expectedUpdatedAt: z.number().int(),
});
export const exportQuerySchema = z.object({ format: z.enum(["txt", "md"]) });

export type CreateNovelRequest = z.infer<typeof createNovelRequestSchema>;
export type UpdateNovelRequest = z.infer<typeof updateNovelRequestSchema>;
export type CreateChapterRequest = z.infer<typeof createChapterRequestSchema>;
export type UpdateChapterRequest = z.infer<typeof updateChapterRequestSchema>;
export type MoveChapterRequest = z.infer<typeof moveChapterRequestSchema>;
export type SaveChapterBodyRequest = z.infer<
	typeof saveChapterBodyRequestSchema
>;
export type ExportFormat = z.infer<typeof exportQuerySchema>["format"];

// 응답
export const novelSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	createdAt: z.number(),
	updatedAt: z.number(),
});
export const novelListResponseSchema = z.object({
	novels: z.array(novelSchema),
});

export const chapterSummarySchema = z.object({
	id: z.string(),
	novelId: z.string(),
	title: z.string(),
	position: z.number(),
	createdAt: z.number(),
	// 본문 저장 때만 바뀐다(저장 충돌 판정용). 제목 변경·이동은 바꾸지 않는다.
	updatedAt: z.number(),
});
export const chapterSchema = chapterSummarySchema.extend({ body: docSchema });
export const chapterListResponseSchema = z.object({
	chapters: z.array(chapterSummarySchema),
});
export const saveChapterBodyResponseSchema = z.object({
	updatedAt: z.number(),
});

export const snapshotKindSchema = z.enum(["auto", "manual"]);
export const snapshotSummarySchema = z.object({
	id: z.string(),
	chapterId: z.string(),
	kind: snapshotKindSchema,
	createdAt: z.number(),
});
export const snapshotSchema = snapshotSummarySchema.extend({ body: docSchema });
export const snapshotListResponseSchema = z.object({
	snapshots: z.array(snapshotSummarySchema),
});

export type Novel = z.infer<typeof novelSchema>;
export type NovelListResponse = z.infer<typeof novelListResponseSchema>;
export type ChapterSummary = z.infer<typeof chapterSummarySchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type ChapterListResponse = z.infer<typeof chapterListResponseSchema>;
export type SaveChapterBodyResponse = z.infer<
	typeof saveChapterBodyResponseSchema
>;
export type SnapshotKind = z.infer<typeof snapshotKindSchema>;
export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type SnapshotListResponse = z.infer<typeof snapshotListResponseSchema>;
