import { describe, expect, test } from "vitest";
import {
	createChapterRequestSchema,
	createNovelRequestSchema,
	moveChapterRequestSchema,
	saveChapterBodyRequestSchema,
	updateNovelRequestSchema,
} from "./novel";

describe("소설·챕터 요청 스키마", () => {
	test("소설 설명은 선택이며 1,000자까지 허용한다", () => {
		expect(createNovelRequestSchema.safeParse({ title: "제목" }).success).toBe(
			true,
		);
		expect(
			createNovelRequestSchema.safeParse({
				title: "제목",
				description: "가".repeat(1000),
			}).success,
		).toBe(true);
		expect(
			createNovelRequestSchema.safeParse({
				title: "제목",
				description: "가".repeat(1001),
			}).success,
		).toBe(false);
	});

	test("제목은 공백만으로 이루어질 수 없다", () => {
		expect(createNovelRequestSchema.safeParse({ title: "  " }).success).toBe(
			false,
		);
		expect(createChapterRequestSchema.safeParse({ title: "" }).success).toBe(
			false,
		);
	});

	test("소설 수정은 한 필드 이상 필요하고 설명 null로 지울 수 있다", () => {
		expect(updateNovelRequestSchema.safeParse({}).success).toBe(false);
		expect(
			updateNovelRequestSchema.safeParse({ description: null }).success,
		).toBe(true);
	});

	test("본문 저장 요청은 문서와 expectedUpdatedAt을 함께 받는다", () => {
		const ok = {
			body: { type: "doc", content: [{ type: "paragraph" }] },
			expectedUpdatedAt: 1,
		};
		expect(saveChapterBodyRequestSchema.safeParse(ok).success).toBe(true);
		expect(
			saveChapterBodyRequestSchema.safeParse({ body: ok.body }).success,
		).toBe(false);
	});

	test("이동 방향은 up 또는 down", () => {
		expect(
			moveChapterRequestSchema.safeParse({ direction: "up" }).success,
		).toBe(true);
		expect(
			moveChapterRequestSchema.safeParse({ direction: "left" }).success,
		).toBe(false);
	});
});
