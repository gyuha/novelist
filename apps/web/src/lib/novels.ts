import {
	chapterListResponseSchema,
	chapterSchema,
	type Doc,
	type ExportFormat,
	novelListResponseSchema,
	novelSchema,
	saveChapterBodyResponseSchema,
	snapshotListResponseSchema,
	snapshotSchema,
} from "@novelist/shared";
import { api, request } from "./api";

const novels = api.api.novels;

export async function listNovels() {
	const res = await request(novels.$get());
	return novelListResponseSchema.parse(await res.json()).novels;
}

export async function getNovel(novelId: string) {
	const res = await request(novels[":novelId"].$get({ param: { novelId } }));
	return novelSchema.parse(await res.json());
}

export async function createNovel(json: {
	title: string;
	description?: string;
}) {
	const res = await request(novels.$post({ json }));
	return novelSchema.parse(await res.json());
}

export async function updateNovel(
	novelId: string,
	json: { title?: string; description?: string | null },
) {
	await request(novels[":novelId"].$patch({ param: { novelId }, json }));
}

export async function deleteNovel(novelId: string) {
	await request(novels[":novelId"].$delete({ param: { novelId } }));
}

export async function listChapters(novelId: string) {
	const res = await request(
		novels[":novelId"].chapters.$get({ param: { novelId } }),
	);
	return chapterListResponseSchema.parse(await res.json()).chapters;
}

export async function createChapter(novelId: string, title: string) {
	const res = await request(
		novels[":novelId"].chapters.$post({ param: { novelId }, json: { title } }),
	);
	return chapterSchema.parse(await res.json());
}

const chapterRoute = novels[":novelId"].chapters[":chapterId"];

export async function getChapter(novelId: string, chapterId: string) {
	const res = await request(
		chapterRoute.$get({ param: { novelId, chapterId } }),
	);
	return chapterSchema.parse(await res.json());
}

export async function renameChapter(
	novelId: string,
	chapterId: string,
	title: string,
) {
	await request(
		chapterRoute.$patch({ param: { novelId, chapterId }, json: { title } }),
	);
}

export async function deleteChapter(novelId: string, chapterId: string) {
	await request(chapterRoute.$delete({ param: { novelId, chapterId } }));
}

export async function moveChapter(
	novelId: string,
	chapterId: string,
	direction: "up" | "down",
) {
	const res = await request(
		chapterRoute.move.$post({
			param: { novelId, chapterId },
			json: { direction },
		}),
	);
	return chapterListResponseSchema.parse(await res.json()).chapters;
}

/** The body route has no request validator, so the JSON goes through `init`. */
export async function saveChapterBody(
	novelId: string,
	chapterId: string,
	body: Doc,
	expectedUpdatedAt: number,
) {
	const res = await request(
		chapterRoute.body.$put(
			{ param: { novelId, chapterId } },
			{
				init: {
					body: JSON.stringify({ body, expectedUpdatedAt }),
					headers: { "Content-Type": "application/json" },
				},
			},
		),
	);
	return saveChapterBodyResponseSchema.parse(await res.json()).updatedAt;
}

export async function listSnapshots(novelId: string, chapterId: string) {
	const res = await request(
		chapterRoute.snapshots.$get({ param: { novelId, chapterId } }),
	);
	return snapshotListResponseSchema.parse(await res.json()).snapshots;
}

export async function createSnapshot(novelId: string, chapterId: string) {
	await request(
		chapterRoute.snapshots.$post({ param: { novelId, chapterId } }),
	);
}

export async function getSnapshot(
	novelId: string,
	chapterId: string,
	snapshotId: string,
) {
	const res = await request(
		chapterRoute.snapshots[":snapshotId"].$get({
			param: { novelId, chapterId, snapshotId },
		}),
	);
	return snapshotSchema.parse(await res.json());
}

export async function restoreSnapshot(
	novelId: string,
	chapterId: string,
	snapshotId: string,
) {
	const res = await request(
		chapterRoute.snapshots[":snapshotId"].restore.$post({
			param: { novelId, chapterId, snapshotId },
		}),
	);
	return chapterSchema.parse(await res.json());
}

/** Downloads the novel export through the browser's save mechanism. */
export async function downloadExport(novelId: string, format: ExportFormat) {
	const res = await request(
		novels[":novelId"].export.$get({ param: { novelId }, query: { format } }),
	);
	const blob = await res.blob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filenameFrom(res.headers.get("Content-Disposition"), format);
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

function filenameFrom(header: string | null, format: ExportFormat): string {
	const encoded = header && /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
	if (encoded) {
		try {
			return decodeURIComponent(encoded);
		} catch {
			// fall through to the default name
		}
	}
	return `novel.${format}`;
}
