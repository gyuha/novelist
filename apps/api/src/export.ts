import {
	type Doc,
	type ExportFormat,
	escapeMarkdown,
	toMarkdown,
	toPlainText,
} from "@novelist/shared";

type ExportNovel = { title: string; description: string | null };
type ExportChapter = { title: string; body: Doc };

/** 소설 제목 → 설명(있으면) → 챕터마다 제목 + 본문. 블록은 빈 줄로 구분하고 빈 챕터도 제목은 남긴다. */
export function buildNovelExport(
	format: ExportFormat,
	novel: ExportNovel,
	chapters: ExportChapter[],
): string {
	const md = format === "md";
	const text = (s: string) => (md ? escapeMarkdown(s) : s);
	const blocks = [md ? `# ${text(novel.title)}` : novel.title];
	if (novel.description) blocks.push(text(novel.description));
	for (const ch of chapters) {
		blocks.push(md ? `## ${text(ch.title)}` : ch.title);
		const body = md ? toMarkdown(ch.body) : toPlainText(ch.body);
		if (body) blocks.push(body);
	}
	return `${blocks.join("\n\n")}\n`;
}

// 파일 시스템 금지 문자와 제어 문자
// biome-ignore lint/suspicious/noControlCharactersInRegex: 제어 문자 제거가 목적
const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** 소설 제목에서 금지 문자를 제거한 파일명(확장자 포함). 남는 게 없으면 `novel`. */
export function exportFilename(title: string, format: ExportFormat): string {
	const base =
		title
			.replace(FORBIDDEN_FILENAME_CHARS, "")
			.replace(/\s+/g, " ")
			.trim()
			.replace(/\.+$/, "") || "novel";
	return `${base}.${format}`;
}

/** 비ASCII 제목은 `filename*`(RFC 5987)로 보내고, `filename`에는 ASCII 대체 이름을 둔다. */
export function contentDisposition(filename: string): string {
	const ext = filename.slice(filename.lastIndexOf("."));
	const ascii = filename.replace(/[^\x20-\x7e]/g, "").replace(/"/g, "");
	const fallback = ascii.trim() === ext || !ascii ? `novel${ext}` : ascii;
	const encoded = encodeURIComponent(filename).replace(
		/['()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
