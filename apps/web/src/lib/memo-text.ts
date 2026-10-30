import { type Memo, toPlainText } from "@novelist/shared";

/** List title: the title, else the first non-empty body line, else a placeholder. */
export function memoListTitle(memo: Memo): string {
	if (memo.title) return memo.title;
	const first = toPlainText(memo.body)
		.split("\n")
		.find((line) => line.trim() !== "" && line.trim() !== "* * *");
	return first?.trim() || "(내용 없음)";
}

export function memoMatches(memo: Memo, term: string): boolean {
	if (!term) return true;
	const haystack = `${memo.title ?? ""}\n${toPlainText(memo.body)}`;
	return haystack.toLowerCase().includes(term);
}
