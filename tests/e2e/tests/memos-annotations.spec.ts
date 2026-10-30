import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

const password = "MemberPassword123!";
test.setTimeout(120_000);
test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });

async function approvedMember(page: Page) {
	const email = `memo-${randomUUID()}@example.com`;
	const signup = await page.request.post("/api/auth/signup", {
		data: { email, password },
	});
	expect(signup.status()).toBe(201);
	const user = await signup.json();
	const browser = page.context().browser();
	if (!browser) throw new Error("Browser fixture is required");
	const admin = await browser.newContext({ baseURL: "http://localhost:3100" });
	try {
		expect(
			(
				await admin.request.post("/api/auth/login", {
					data: { email: "admin@example.com", password: "AdminPassword123!" },
				})
			).ok(),
		).toBe(true);
		expect(
			(await admin.request.post(`/api/admin/members/${user.id}/approve`)).ok(),
		).toBe(true);
	} finally {
		await admin.close();
	}
	await page.goto("/novels");
	await expect(page.getByTestId("new-novel-button")).toBeVisible();
}

async function createNovel(page: Page) {
	await approvedMember(page);
	await page.getByTestId("new-novel-button").click();
	await page.getByTestId("new-novel-form-title").fill("별의 기록");
	await page.getByTestId("new-novel-form-description").fill("밤하늘의 이야기");
	await page.getByTestId("new-novel-form-submit").click();
	await page.getByTestId("novel-link-별의 기록").click();
	await expect(page.getByTestId("novel-title")).toHaveText("별의 기록");
	return page.url();
}

async function createChapter(page: Page) {
	const novelUrl = await createNovel(page);
	await page.getByTestId("new-chapter-button").click();
	await page.getByTestId("new-chapter-form-title").fill("첫 만남");
	await page.getByTestId("new-chapter-form-submit").click();
	await expect(page.getByTestId("editor-content")).toBeVisible();
	return { novelUrl, editorUrl: page.url() };
}

async function saveMemo(page: Page) {
	await page.getByTestId("memo-save").click();
	await expect(page.getByTestId("memo-save-status")).toHaveAttribute(
		"data-state",
		"saved",
	);
}

async function chapterMemo(page: Page, title = "챕터 아이디어") {
	await page.getByTestId("memo-toggle").click();
	const panel = page.getByTestId("memo-panel");
	await panel.getByTestId("memo-new").click();
	await panel.getByTestId("memo-title").fill(title);
	await panel.getByTestId("memo-content").fill("다음 장면을 위한 메모");
	await expect(panel.getByTestId("memo-scope-chapter")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await saveMemo(page);
	await expect(panel.getByTestId("memo-title")).toHaveValue(title);
}

async function addAnnotation(page: Page) {
	const editor = page.getByTestId("editor-content");
	await editor.fill("주석을 붙일 문장");
	await editor.press("ControlOrMeta+a");
	await expect(page.getByTestId("annotation-add")).toBeEnabled();
	await page.getByTestId("annotation-add").click();
	await expect(page.getByTestId("annotation-add-quote")).toHaveText(
		"주석을 붙일 문장",
	);
	await page.getByTestId("annotation-add-body").fill("문장에 대한 기록");
	await page.getByTestId("annotation-add-submit").click();
	await expect(page.getByTestId("annotation-item")).toHaveCount(1);
	await expect(page.getByTestId("annotation-state")).toHaveText("연결됨");
	await expect(page.getByTestId("save-status")).toHaveAttribute(
		"data-state",
		"saved",
	);
}

test("free memo moves to a novel and becomes an AI reference", async ({
	page,
}) => {
	const novelUrl = await createNovel(page);
	await page.goto("/memos");
	await page.getByTestId("memo-new").click();
	await page.getByTestId("memo-title").fill("떠오른 생각");
	await page.getByTestId("memo-content").fill("별을 따라간다");
	await expect(page.getByTestId("memo-scope-free")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await saveMemo(page);
	await page.getByTestId("memo-scope-novel").click();
	await page
		.getByTestId("memo-scope-novel-select")
		.selectOption({ label: "별의 기록" });
	await page.getByTestId("memo-ai-reference").check();
	await saveMemo(page);
	await page.reload();
	await page
		.getByTestId("memo-item")
		.filter({ hasText: "떠오른 생각" })
		.click();
	await expect(page.getByTestId("memo-scope-novel")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	const novelId = novelUrl.split("/").at(-1);
	if (!novelId) throw new Error("Novel URL has no ID");
	await expect(page.getByTestId("memo-scope-novel-select")).toHaveValue(
		novelId,
	);
	await expect(page.getByTestId("memo-ai-reference")).toBeChecked();
});

test("chapter memo can be written in the editor memo tab", async ({ page }) => {
	await createChapter(page);
	await chapterMemo(page);
	await page.reload();
	await page.getByTestId("memo-toggle").click();
	await expect(page.getByTestId("memo-item-title")).toHaveText("챕터 아이디어");
});

test("reader shows this chapter's memo", async ({ page }) => {
	await createChapter(page);
	await chapterMemo(page, "리더에서 볼 메모");
	await page.getByTestId("to-reader").click();
	await expect(page.getByTestId("reader-memos")).toContainText("이 챕터 메모");
	await expect(page.getByTestId("reader-memo-item")).toHaveText(
		"리더에서 볼 메모",
	);
});

test("annotation survives reload with its body and quote", async ({ page }) => {
	await createChapter(page);
	await addAnnotation(page);
	await page.reload();
	await page.getByTestId("annotation-toggle").click();
	await expect(page.getByTestId("annotation-state")).toHaveText("연결됨");
	await expect(page.getByTestId("annotation-quote")).toHaveText(
		"주석을 붙일 문장",
	);
	await expect(page.getByTestId("annotation-body")).toHaveText(
		"문장에 대한 기록",
	);
});

test("deleting annotated text leaves an orphan with its quote", async ({
	page,
}) => {
	await createChapter(page);
	await addAnnotation(page);
	await page.getByTestId("editor-content").fill("새 문장");
	await page.getByTestId("save-button").click();
	await expect(page.getByTestId("save-status")).toHaveAttribute(
		"data-state",
		"saved",
	);
	await expect(page.getByTestId("annotation-state")).toHaveText("위치 잃음");
	await expect(page.getByTestId("annotation-quote")).toHaveText(
		"주석을 붙일 문장",
	);
	await expect(page.getByTestId("annotation-orphan-note")).toBeVisible();
});

test("restoring the marked snapshot reconnects an orphaned annotation", async ({
	page,
}) => {
	await createChapter(page);
	await addAnnotation(page);
	await page.getByTestId("snapshot-toggle").click();
	await page.getByTestId("snapshot-create").click();
	await expect(page.getByTestId("snapshot-item-manual")).toBeVisible();
	await page.getByTestId("editor-content").fill("표시 없는 문장");
	await page.getByTestId("save-button").click();
	await expect(page.getByTestId("save-status")).toHaveAttribute(
		"data-state",
		"saved",
	);
	await page.getByTestId("annotation-toggle").click();
	await expect(page.getByTestId("annotation-state")).toHaveText("위치 잃음");
	await page.getByTestId("snapshot-toggle").click();
	await page.getByTestId("snapshot-item-manual").click();
	await page.getByTestId("snapshot-restore").click();
	await page.getByTestId("restore-dialog-confirm").click();
	await page.getByTestId("annotation-toggle").click();
	await expect(page.getByTestId("annotation-state")).toHaveText("연결됨");
	await expect(page.getByTestId("editor-content")).toContainText(
		"주석을 붙일 문장",
	);
});

test("saving one memo from two tabs shows a real 409 conflict", async ({
	page,
	context,
}) => {
	await createNovel(page);
	await page.goto("/memos");
	await page.getByTestId("memo-new").click();
	await page.getByTestId("memo-title").fill("공유 메모");
	await page.getByTestId("memo-content").fill("원본 내용");
	await saveMemo(page);
	const other = await context.newPage();
	await other.goto("/memos");
	await other.getByTestId("memo-item").filter({ hasText: "공유 메모" }).click();
	await expect(other.getByTestId("memo-content")).toContainText("원본 내용");
	await page.getByTestId("memo-content").fill("첫 탭의 수정");
	await saveMemo(page);
	await other.getByTestId("memo-content").fill("두 번째 탭의 수정");
	const conflict = other.waitForResponse(
		(res) => res.request().method() === "PATCH" && res.status() === 409,
	);
	await other.getByTestId("memo-save").click();
	await conflict;
	await expect(other.getByTestId("memo-conflict-banner")).toBeVisible();
	await expect(other.getByTestId("memo-save-status")).toHaveAttribute(
		"data-state",
		"conflict",
	);
	await expect(other.getByTestId("memo-content")).toContainText(
		"두 번째 탭의 수정",
	);
});

test("chapter deletion shows memo count and removes its memos", async ({
	page,
}) => {
	const { novelUrl } = await createChapter(page);
	await chapterMemo(page, "삭제될 챕터 메모");
	await page.goto(novelUrl);
	await page.getByTestId("chapter-more-1").click();
	await page.getByTestId("chapter-delete-1").click();
	const dialog = page.getByTestId("delete-chapter-dialog");
	await expect(dialog.getByTestId("delete-memo-count")).toHaveText(
		"메모 1개도 함께 삭제됩니다",
	);
	await dialog.getByTestId("delete-chapter-dialog-confirm").click();
	await expect(page.getByTestId("chapter-list")).toHaveCount(0);
	await page.goto("/memos");
	await expect(page.getByTestId("memo-item-title")).toHaveCount(0);
});
