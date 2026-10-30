import { z } from "zod";

/**
 * 챕터 본문 문서 모델(ProseMirror/TipTap JSON). 허용 노드는 doc·paragraph·text·horizontalRule(장면 전환)뿐이고,
 * 마크는 bold뿐이다. TipTap 에디터 설정은 web에 있으며 이 스키마가 서버 검증의 기준이다.
 */

export const boldMarkSchema = z.strictObject({ type: z.literal("bold") });

// 4번(주석)은 여기에 주석 마크 스키마를 만들어 이 배열에 추가한다. toMarkdown/toPlainText는 모르는 마크를 무시한다.
export const markSchema = z.discriminatedUnion("type", [boldMarkSchema]);

export const textNodeSchema = z.strictObject({
	type: z.literal("text"),
	text: z.string().min(1),
	marks: z.array(markSchema).optional(),
});

export const paragraphNodeSchema = z.strictObject({
	type: z.literal("paragraph"),
	content: z.array(textNodeSchema).optional(),
});

/** 장면 전환 */
export const horizontalRuleNodeSchema = z.strictObject({
	type: z.literal("horizontalRule"),
});

export const blockNodeSchema = z.discriminatedUnion("type", [
	paragraphNodeSchema,
	horizontalRuleNodeSchema,
]);

export const docSchema = z.strictObject({
	type: z.literal("doc"),
	content: z.array(blockNodeSchema).optional(),
});

export type Mark = z.infer<typeof markSchema>;
export type TextNode = z.infer<typeof textNodeSchema>;
export type BlockNode = z.infer<typeof blockNodeSchema>;
export type Doc = z.infer<typeof docSchema>;

/** 새 챕터의 본문(빈 문단 하나) */
export const emptyDoc = (): Doc => ({
	type: "doc",
	content: [{ type: "paragraph" }],
});

export const SCENE_BREAK = "* * *";

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
