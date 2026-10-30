import { type Doc, docSchema } from "@novelist/shared";

export type Draft = { body: Doc; savedAt: number };

const key = (userId: string, chapterId: string) =>
	`novelist:draft:${userId}:${chapterId}`;

export function readDraft(userId: string, chapterId: string): Draft | null {
	try {
		const raw = localStorage.getItem(key(userId, chapterId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { body?: unknown; savedAt?: unknown };
		const body = docSchema.safeParse(parsed.body);
		if (!body.success || typeof parsed.savedAt !== "number") return null;
		return { body: body.data, savedAt: parsed.savedAt };
	} catch {
		return null;
	}
}

/** Returns the stored timestamp, or null when the browser refused the write (quota, private mode). */
export function writeDraft(
	userId: string,
	chapterId: string,
	body: Doc,
): number | null {
	const savedAt = Date.now();
	try {
		localStorage.setItem(
			key(userId, chapterId),
			JSON.stringify({ body, savedAt }),
		);
		return savedAt;
	} catch {
		return null;
	}
}

export function clearDraft(userId: string, chapterId: string) {
	try {
		localStorage.removeItem(key(userId, chapterId));
	} catch {
		// nothing stored, or storage unavailable
	}
}
