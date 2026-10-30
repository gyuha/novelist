import { describe, expect, test } from "vitest";
import {
	type Doc,
	docSchema,
	emptyDoc,
	toMarkdown,
	toPlainText,
} from "./document";

const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, bold = false) => ({
	type: "text" as const,
	text,
	...(bold ? { marks: [{ type: "bold" as const }] } : {}),
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
