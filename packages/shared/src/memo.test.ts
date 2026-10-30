import { describe, expect, test } from "vitest";
import type { Doc } from "./document";
import {
	annotationBodySchema,
	createAnnotationRequestSchema,
	createMemoRequestSchema,
	MEMO_BODY_MAX_BYTES,
	MEMO_TITLE_MAX_LENGTH,
	memoListQuerySchema,
	updateMemoRequestSchema,
} from "./memo";

const docOf = (marks?: unknown[]): Doc =>
	({
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text: "글", ...(marks && { marks }) }],
			},
		],
	}) as Doc;

describe("MEMO_BODY_MAX_BYTES", () => {
	test("200KB다", () => {
		expect(MEMO_BODY_MAX_BYTES).toBe(200 * 1024);
	});
});

describe("createMemoRequestSchema", () => {
	test("종류와 소속이 맞으면 통과한다", () => {
		for (const v of [
			{ kind: "free" },
			{ kind: "novel", novelId: "n1" },
			{ kind: "chapter", chapterId: "c1" },
			{ kind: "chapter", novelId: "n1", chapterId: "c1" },
		])
			expect(createMemoRequestSchema.safeParse(v).success).toBe(true);
	});

	test.each([
		["free + novelId", { kind: "free", novelId: "n1" }],
		["free + chapterId", { kind: "free", chapterId: "c1" }],
		["novel에 novelId 없음", { kind: "novel" }],
		["novel + chapterId", { kind: "novel", novelId: "n1", chapterId: "c1" }],
		["chapter에 chapterId 없음", { kind: "chapter", novelId: "n1" }],
		["알 수 없는 kind", { kind: "other" }],
	])("종류-소속 불일치(%s)는 거부한다", (_n, v) => {
		expect(createMemoRequestSchema.safeParse(v).success).toBe(false);
	});

	test("제목은 200자까지, 본문은 메모 문서 스키마", () => {
		const ok = createMemoRequestSchema.safeParse({
			kind: "free",
			title: "가".repeat(MEMO_TITLE_MAX_LENGTH),
		});
		expect(ok.success).toBe(true);
		expect(
			createMemoRequestSchema.safeParse({
				kind: "free",
				title: "가".repeat(MEMO_TITLE_MAX_LENGTH + 1),
			}).success,
		).toBe(false);
		expect(
			createMemoRequestSchema.safeParse({ kind: "free", body: docOf() })
				.success,
		).toBe(true);
	});

	test("본문의 주석 마크는 거부한다", () => {
		const r = createMemoRequestSchema.safeParse({
			kind: "free",
			body: docOf([{ type: "annotation", attrs: { id: "a" } }]),
		});
		expect(r.success).toBe(false);
	});
});

describe("updateMemoRequestSchema", () => {
	test("expectedUpdatedAt와 바꿀 항목이 하나 이상 있어야 한다", () => {
		expect(updateMemoRequestSchema.safeParse({ title: "x" }).success).toBe(
			false,
		);
		expect(
			updateMemoRequestSchema.safeParse({ expectedUpdatedAt: 1 }).success,
		).toBe(false);
		expect(
			updateMemoRequestSchema.safeParse({ title: null, expectedUpdatedAt: 1 })
				.success,
		).toBe(true);
		expect(
			updateMemoRequestSchema.safeParse({
				aiReference: true,
				expectedUpdatedAt: 1,
			}).success,
		).toBe(true);
	});

	test("소속 변경(scope)도 종류-소속 일치를 요구한다", () => {
		const base = { expectedUpdatedAt: 1 };
		expect(
			updateMemoRequestSchema.safeParse({
				...base,
				scope: { kind: "novel", novelId: "n1" },
			}).success,
		).toBe(true);
		expect(
			updateMemoRequestSchema.safeParse({ ...base, scope: { kind: "free" } })
				.success,
		).toBe(true);
		expect(
			updateMemoRequestSchema.safeParse({ ...base, scope: { kind: "novel" } })
				.success,
		).toBe(false);
		expect(
			updateMemoRequestSchema.safeParse({
				...base,
				scope: { kind: "free", novelId: "n1" },
			}).success,
		).toBe(false);
	});

	test("본문의 주석 마크는 거부한다", () => {
		expect(
			updateMemoRequestSchema.safeParse({
				expectedUpdatedAt: 1,
				body: docOf([{ type: "annotation", attrs: { id: "a" } }]),
			}).success,
		).toBe(false);
	});
});

describe("memoListQuerySchema", () => {
	test("scope 기본값은 all", () => {
		expect(memoListQuerySchema.parse({}).scope).toBe("all");
		expect(memoListQuerySchema.safeParse({ scope: "x" }).success).toBe(false);
	});
});

describe("annotation 요청", () => {
	test("생성 요청은 markId·본문·챕터 본문·버전을 가진다", () => {
		const v = {
			markId: "m1",
			body: "주석",
			chapterBody: docOf([{ type: "annotation", attrs: { id: "m1" } }]),
			expectedUpdatedAt: 1,
		};
		expect(createAnnotationRequestSchema.safeParse(v).success).toBe(true);
		expect(
			createAnnotationRequestSchema.safeParse({ ...v, markId: "" }).success,
		).toBe(false);
	});

	test("주석 본문은 공백만이면 거부한다", () => {
		expect(annotationBodySchema.safeParse("   ").success).toBe(false);
		expect(annotationBodySchema.safeParse("내용").success).toBe(true);
	});
});
