import { describe, expect, test } from "vitest";
import {
	annotationIds,
	annotationQuote,
	chapterDocSchema,
	type Doc,
	docSchema,
	emptyDoc,
	hasOverlappingAnnotations,
	memoDocSchema,
	stripAnnotations,
	toMarkdown,
	toPlainText,
} from "./document";

const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, bold = false) => ({
	type: "text" as const,
	text,
	...(bold ? { marks: [{ type: "bold" as const }] } : {}),
});
const ann = (id: string) => ({ type: "annotation" as const, attrs: { id } });
const ta = (text: string, ...ids: string[]) => ({
	type: "text" as const,
	text,
	marks: ids.map(ann),
});
const hr = { type: "horizontalRule" as const };
const doc = (...content: unknown[]) => ({ type: "doc", content }) as Doc;

describe("docSchema", () => {
	test("문단·강조·장면 전환으로 이루어진 문서를 허용한다", () => {
		const d = doc(p(t("안녕"), t("강조", true)), hr, p(t("끝")));
		expect(docSchema.safeParse(d).success).toBe(true);
	});

	test("빈 문단과 빈 문서(emptyDoc)를 허용한다", () => {
		expect(docSchema.safeParse(emptyDoc()).success).toBe(true);
		expect(docSchema.safeParse(doc({ type: "paragraph" })).success).toBe(true);
	});

	test.each([
		["제목(heading) 노드", doc({ type: "heading", attrs: { level: 1 } })],
		["hardBreak 노드", doc(p({ type: "hardBreak" }))],
		[
			"허용되지 않은 마크",
			doc(p({ type: "text", text: "a", marks: [{ type: "italic" }] })),
		],
		["빈 text 노드", doc(p({ type: "text", text: "" }))],
		["알 수 없는 속성", doc({ type: "paragraph", attrs: { align: "left" } })],
		["doc이 아닌 루트", { type: "paragraph" }],
		["문단 안의 문단", doc(p(p(t("x")) as never))],
	])("%s는 거부한다", (_name, value) => {
		expect(docSchema.safeParse(value).success).toBe(false);
	});
});

describe("toPlainText", () => {
	test("문단은 빈 줄로 구분하고 강조 표시는 없다", () => {
		const d = doc(p(t("첫 "), t("강조", true), t(" 문장")), p(t("둘째")));
		expect(toPlainText(d)).toBe("첫 강조 문장\n\n둘째");
	});

	test("장면 전환은 * * * 한 줄이다", () => {
		expect(toPlainText(doc(p(t("가")), hr, p(t("나"))))).toBe(
			"가\n\n* * *\n\n나",
		);
	});

	test("빈 문단은 건너뛰고 빈 문서는 빈 문자열이다", () => {
		expect(
			toPlainText(doc(p(t("가")), { type: "paragraph" }, p(t("나")))),
		).toBe("가\n\n나");
		expect(toPlainText(emptyDoc())).toBe("");
	});
});

describe("toMarkdown", () => {
	test("강조는 **로 감싸고 장면 전환은 * * * 이다", () => {
		const d = doc(p(t("첫 "), t("강조", true), t(" 문장")), hr, p(t("끝")));
		expect(toMarkdown(d)).toBe("첫 **강조** 문장\n\n* * *\n\n끝");
	});

	test("이어진 강조 노드는 하나로 합치고 공백은 ** 바깥으로 뺀다", () => {
		const d = doc(p(t("a", true), t("b ", true), t("c")));
		expect(toMarkdown(d)).toBe("**ab** c");
	});

	test("마크다운 특수문자는 이스케이프한다", () => {
		expect(toMarkdown(doc(p(t("*별* _밑줄_ `코드`"))))).toBe(
			"\\*별\\* \\_밑줄\\_ \\`코드\\`",
		);
		expect(toMarkdown(doc(p(t("# 제목처럼"))))).toBe("\\# 제목처럼");
		expect(toMarkdown(doc(p(t("1. 목록처럼"))))).toBe("1\\. 목록처럼");
		expect(toMarkdown(doc(p(t("* * *"))))).toBe("\\* \\* \\*");
	});

	test("빈 문서는 빈 문자열이다", () => {
		expect(toMarkdown(emptyDoc())).toBe("");
	});
});

describe("주석 마크", () => {
	test("챕터 문서 스키마는 주석 마크를 허용한다", () => {
		const d = doc(p(t("앞"), ta("걸린 글", "a1"), t("뒤")));
		expect(chapterDocSchema.safeParse(d).success).toBe(true);
		expect(docSchema.safeParse(d).success).toBe(true);
	});

	test("메모 문서 스키마는 주석 마크를 거부하고 문단·강조·장면 전환은 허용한다", () => {
		expect(
			memoDocSchema.safeParse(doc(p(t("앞"), ta("걸린 글", "a1")))).success,
		).toBe(false);
		expect(
			memoDocSchema.safeParse(doc(p(t("가"), t("나", true)), hr, p(t("다"))))
				.success,
		).toBe(true);
		expect(memoDocSchema.safeParse(emptyDoc()).success).toBe(true);
	});

	test.each([
		["id 없음", { type: "annotation" }],
		["빈 id", { type: "annotation", attrs: { id: "" } }],
		["숫자 id", { type: "annotation", attrs: { id: 1 } }],
		["알 수 없는 속성", { type: "annotation", attrs: { id: "a", x: 1 } }],
	])("주석 마크 %s는 거부한다", (_name, mark) => {
		const d = doc(p({ type: "text", text: "a", marks: [mark] }));
		expect(chapterDocSchema.safeParse(d).success).toBe(false);
	});

	test("toPlainText는 주석을 출력하지 않는다", () => {
		const d = doc(p(t("앞 "), ta("걸린 글", "a1"), t(" 뒤")));
		expect(toPlainText(d)).toBe("앞 걸린 글 뒤");
	});

	test("toMarkdown은 주석을 출력하지 않고 강조는 유지한다", () => {
		const d = doc(
			p(t("앞 "), ta("걸린 글", "a1"), t(" 뒤")),
			p({
				type: "text",
				text: "굵게",
				marks: [{ type: "bold" }, ann("a2")],
			}),
		);
		expect(toMarkdown(d)).toBe("앞 걸린 글 뒤\n\n**굵게**");
	});

	test("annotationIds는 본문에 있는 주석 마크 id를 모은다", () => {
		const d = doc(p(ta("a", "x"), t("b")), hr, p(ta("c", "y"), ta("d", "x")));
		expect([...annotationIds(d)].sort()).toEqual(["x", "y"]);
		expect(annotationIds(emptyDoc()).size).toBe(0);
	});

	test("stripAnnotations는 keep이 거짓인 id의 마크만 제거하고 다른 마크는 남긴다", () => {
		const d = doc(
			p(
				{
					type: "text",
					text: "가",
					marks: [{ type: "bold" }, ann("drop"), ann("keep")],
				},
				ta("나", "drop"),
			),
		);
		const out = stripAnnotations(d, (id) => id === "keep");
		expect(out).toEqual(
			doc(
				p(
					{
						type: "text",
						text: "가",
						marks: [{ type: "bold" }, ann("keep")],
					},
					{ type: "text", text: "나" },
				),
			),
		);
		// 원본은 바뀌지 않는다
		expect(annotationIds(d).has("drop")).toBe(true);
	});

	test("annotationQuote는 그 마크가 걸린 텍스트를 이어 붙인다", () => {
		const d = doc(
			p(t("앞"), ta("걸린 ", "a1"), ta("글", "a1", "a2")),
			p(t("뒤")),
		);
		expect(annotationQuote(d, "a1")).toBe("걸린 글");
		expect(annotationQuote(d, "a2")).toBe("글");
		expect(annotationQuote(d, "none")).toBe("");
	});

	test("hasOverlappingAnnotations는 한 텍스트에 주석 마크가 둘 이상이면 참이다", () => {
		expect(
			hasOverlappingAnnotations(doc(p(ta("a", "x"), t(" "), ta("b", "y")))),
		).toBe(false);
		expect(hasOverlappingAnnotations(doc(p(ta("a", "x", "y"))))).toBe(true);
	});
});
