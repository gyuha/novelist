import { z } from "zod";

/**
 * 문서 모델(ProseMirror/TipTap JSON). 허용 노드는 doc·paragraph·text·horizontalRule(장면 전환)뿐이다.
 * 챕터 본문의 마크는 bold와 주석(annotation), 메모 본문의 마크는 bold뿐이다.
 * TipTap 에디터 설정은 web에 있으며 이 스키마가 서버 검증의 기준이다.
 */

export const boldMarkSchema = z.strictObject({ type: z.literal("bold") });

/** 본문 주석 마크. id는 annotations.mark_id와 같다. */
export const annotationMarkSchema = z.strictObject({
	type: z.literal("annotation"),
	attrs: z.strictObject({ id: z.string().min(1).max(64) }),
});

// toMarkdown/toPlainText는 모르는 마크를 무시하므로 주석은 출력되지 않는다.
export const markSchema = z.discriminatedUnion("type", [
	boldMarkSchema,
	annotationMarkSchema,
]);
const memoMarkSchema = z.discriminatedUnion("type", [boldMarkSchema]);

/** 장면 전환 */
export const horizontalRuleNodeSchema = z.strictObject({
	type: z.literal("horizontalRule"),
});

function buildDocSchemas<M extends z.ZodType>(mark: M) {
	const textNodeSchema = z.strictObject({
		type: z.literal("text"),
		text: z.string().min(1),
		marks: z.array(mark).optional(),
	});
	const paragraphNodeSchema = z.strictObject({
		type: z.literal("paragraph"),
		content: z.array(textNodeSchema).optional(),
	});
	const blockNodeSchema = z.discriminatedUnion("type", [
		paragraphNodeSchema,
		horizontalRuleNodeSchema,
	]);
	const docSchema = z.strictObject({
		type: z.literal("doc"),
		content: z.array(blockNodeSchema).optional(),
	});
	return { textNodeSchema, paragraphNodeSchema, blockNodeSchema, docSchema };
}

const chapterSchemas = buildDocSchemas(markSchema);
export const { textNodeSchema, paragraphNodeSchema, blockNodeSchema } =
	chapterSchemas;
export const docSchema = chapterSchemas.docSchema;
/** 챕터 본문 문서(주석 마크 허용). `docSchema`와 같다. */
export const chapterDocSchema = docSchema;
/** 메모 본문 문서(문단·강조·장면 전환만, 주석 마크 거부) */
export const memoDocSchema = buildDocSchemas(memoMarkSchema).docSchema;

export type Mark = z.infer<typeof markSchema>;
export type TextNode = z.infer<typeof textNodeSchema>;
export type BlockNode = z.infer<typeof blockNodeSchema>;
export type Doc = z.infer<typeof docSchema>;
export type MemoDoc = z.infer<typeof memoDocSchema>;

/** 새 챕터의 본문(빈 문단 하나) */
export const emptyDoc = (): Doc => ({
	type: "doc",
	content: [{ type: "paragraph" }],
});

export const SCENE_BREAK = "* * *";

/** 본문에 있는 주석 마크 id */
export function annotationIds(doc: Doc): Set<string> {
	const ids = new Set<string>();
	for (const block of doc.content ?? [])
		if (block.type === "paragraph")
			for (const n of block.content ?? [])
				for (const m of n.marks ?? [])
					if (m.type === "annotation") ids.add(m.attrs.id);
	return ids;
}

/** keep이 거짓인 id의 주석 마크를 제거한 새 문서(다른 마크·텍스트는 그대로) */
export function stripAnnotations(doc: Doc, keep: (id: string) => boolean): Doc {
	return {
		...doc,
		content: doc.content?.map((block) => {
			if (block.type !== "paragraph" || !block.content) return block;
			return {
				...block,
				content: block.content.map((n): TextNode => {
					if (!n.marks) return n;
					const marks = n.marks.filter(
						(m) => m.type !== "annotation" || keep(m.attrs.id),
					);
					if (marks.length === n.marks.length) return n;
					const { marks: _dropped, ...rest } = n;
					return marks.length > 0 ? { ...rest, marks } : rest;
				}),
			};
		}),
	};
}

/** 그 주석 마크가 걸린 텍스트(문단 사이는 공백 하나). 없으면 빈 문자열 */
export function annotationQuote(doc: Doc, id: string): string {
	const parts: string[] = [];
	for (const block of doc.content ?? []) {
		if (block.type !== "paragraph") continue;
		const text = (block.content ?? [])
			.filter((n) =>
				n.marks?.some((m) => m.type === "annotation" && m.attrs.id === id),
			)
			.map((n) => n.text)
			.join("");
		if (text) parts.push(text);
	}
	return parts.join(" ");
}

/** 한 텍스트에 주석 마크가 둘 이상 걸려 있으면(= 주석 범위가 겹치면) 참 */
export function hasOverlappingAnnotations(doc: Doc): boolean {
	for (const block of doc.content ?? [])
		if (block.type === "paragraph")
			for (const n of block.content ?? [])
				if ((n.marks ?? []).filter((m) => m.type === "annotation").length > 1)
					return true;
	return false;
}

const isBold = (n: TextNode) =>
	n.marks?.some((m) => m.type === "bold") ?? false;
const joinBlocks = (blocks: string[]) => blocks.join("\n\n");

/** 문단은 빈 줄로 구분하고 빈 문단은 건너뛴다. 장면 전환은 `* * *`, 강조 표시는 없다. */
export function toPlainText(doc: Doc): string {
	const blocks: string[] = [];
	for (const node of doc.content ?? []) {
		if (node.type === "horizontalRule") {
			blocks.push(SCENE_BREAK);
			continue;
		}
		const text = (node.content ?? []).map((n) => n.text).join("");
		if (text) blocks.push(text);
	}
	return joinBlocks(blocks);
}

/** 인라인 마크다운 특수문자와, 문단 첫머리에서 제목·목록·인용으로 읽힐 문자를 이스케이프한다. */
export function escapeMarkdown(text: string): string {
	return text
		.replace(/[\\`*_[\]<>]/g, "\\$&")
		.replace(/^([#+-])/, "\\$1")
		.replace(/^(\d+)([.)])/, "$1\\$2");
}

function paragraphToMarkdown(nodes: TextNode[]): string {
	// 이어진 같은 서식의 노드를 합쳐야 `**a****b**` 같은 출력이 나오지 않는다.
	const runs: { text: string; bold: boolean }[] = [];
	for (const n of nodes) {
		const bold = isBold(n);
		const last = runs[runs.length - 1];
		if (last && last.bold === bold) last.text += n.text;
		else runs.push({ text: n.text, bold });
	}
	const out = runs
		.map(({ text, bold }) => {
			if (!bold) return escapeMarkdown(text);
			// 여는/닫는 ** 안쪽 공백은 마크다운이 강조로 인식하지 않으므로 바깥으로 뺀다.
			const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) as RegExpExecArray;
			const [, lead, core, trail] = m;
			return core
				? `${lead}**${escapeMarkdown(core)}**${trail}`
				: escapeMarkdown(text);
		})
		.join("");
	return out;
}

/** `**강조**`, 장면 전환 `* * *`. 문단은 빈 줄로 구분하고 빈 문단은 건너뛴다. */
export function toMarkdown(doc: Doc): string {
	const blocks: string[] = [];
	for (const node of doc.content ?? []) {
		if (node.type === "horizontalRule") {
			blocks.push(SCENE_BREAK);
			continue;
		}
		const md = paragraphToMarkdown(node.content ?? []);
		if (md.trim()) blocks.push(md);
	}
	return joinBlocks(blocks);
}
