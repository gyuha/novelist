import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const password = "MemberPassword123!";
test.setTimeout(120_000);
test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });

async function member(page: Page) {
	const email = `editor-${randomUUID()}@example.com`;
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
	await expect(page.getByTestId("new-novel-button")).toBeVisible({
		timeout: 60_000,
	});
}

async function novel(page: Page) {
	await member(page);
	await page.getByTestId("new-novel-button").click();
	await page.getByTestId("new-novel-form-title").fill("별의 기록");
	await page
		.getByTestId("new-novel-form-description")
		.fill("밤하늘을 여행하는 이야기");
	await page.getByTestId("new-novel-form-submit").click();
	await page.getByTestId("novel-link-별의 기록").click();
	await expect(page.getByTestId("novel-description")).toHaveText(
		"밤하늘을 여행하는 이야기",
	);
	return page.url();
}

async function chapter(page: Page, title = "첫 만남") {
	await page.getByTestId("new-chapter-button").click();
	await page.getByTestId("new-chapter-form-title").fill(title);
	await page.getByTestId("new-chapter-form-submit").click();
	await expect(page.getByTestId("editor-content")).toBeVisible({
		timeout: 60_000,
	});
	return page.url();
}

async function save(page: Page, shortcut = false) {
	if (shortcut)
		await page.getByTestId("editor-content").press("ControlOrMeta+s");
	else await page.getByTestId("save-button").click();
	await expect(page.getByTestId("save-status")).toHaveAttribute(
		"data-state",
		"saved",
	);
}

async function richBody(page: Page) {
	const editor = page.getByTestId("editor-content");
	await editor.fill("별빛이 내렸다. ");
	await editor.press("End");
	await page.getByTestId("tool-bold").click();
	await page.keyboard.insertText("강조된 약속");
	await page.getByTestId("tool-bold").click();
	await page.getByTestId("tool-scene-break").click();
	await page.keyboard.insertText("새로운 아침이었다.");
	await expect(editor.locator("strong")).toHaveText("강조된 약속");
	await expect(editor.locator("hr")).toHaveCount(1);
}

test("keyboard shortcut saves rich chapter and clears the dirty state", async ({
	page,
}) => {
	await novel(page);
	await chapter(page);
	await richBody(page);
	await save(page, true);
	await page.reload();
	await expect(page.getByTestId("editor-content")).toContainText(
		"새로운 아침이었다.",
	);
	await expect(page.getByTestId("editor-content").locator("strong")).toHaveText(
		"강조된 약속",
	);
	await expect(page.getByTestId("editor-content").locator("hr")).toHaveCount(1);
});

test("novel description and rich chapter persist after save button and reload", async ({
	page,
}) => {
	await novel(page);
	await chapter(page);
	await richBody(page);
	await save(page);
	await page.reload();
	await expect(page.getByTestId("editor-content")).toContainText(
		"새로운 아침이었다.",
	);
	await expect(page.getByTestId("editor-content").locator("strong")).toHaveText(
		"강조된 약속",
	);
	await expect(page.getByTestId("editor-content").locator("hr")).toHaveCount(1);
});

test("manual snapshot restores body and preserves the previous body as an automatic snapshot", async ({
	page,
}) => {
	await novel(page);
	await chapter(page);
	await page.getByTestId("editor-content").fill("스냅샷의 본문");
	await save(page);
	await page.getByTestId("snapshot-toggle").click();
	await page.getByTestId("snapshot-create").click();
	await expect(page.getByTestId("snapshot-item-manual")).toBeVisible();
	await page.getByTestId("editor-content").fill("복원 직전 본문");
	await save(page);
	await page.getByTestId("snapshot-item-manual").click();
	await expect(page.getByTestId("snapshot-preview")).toHaveText(
		"스냅샷의 본문",
	);
	await page.getByTestId("snapshot-restore").click();
	await page.getByTestId("restore-dialog-confirm").click();
	await expect(page.getByTestId("editor-content")).toHaveText("스냅샷의 본문");
	await expect(page.getByTestId("snapshot-item-auto")).toContainText(
		"복원 전 자동 저장",
	);
	await page.getByTestId("snapshot-item-auto").click();
	await expect(page.getByTestId("snapshot-preview")).toHaveText(
		"복원 직전 본문",
	);
	await page.reload();
	await expect(page.getByTestId("editor-content")).toHaveText("스냅샷의 본문");
});

test("chapter move up and down changes order and reader previous and next follow it", async ({
	page,
}) => {
	const url = await novel(page);
	await chapter(page, "첫 챕터");
	await page.goto(url);
	const second = await chapter(page, "둘째 챕터");
	const id = second.split("/").at(-2);
	await page.goto(url);
	await page.getByTestId(`move-up-${id}`).click();
	await expect(page.getByTestId("chapter-link-1")).toHaveText("둘째 챕터");
	await page.getByTestId(`move-down-${id}`).click();
	await expect(page.getByTestId("chapter-link-1")).toHaveText("첫 챕터");
	await expect(page.getByTestId("chapter-link-2")).toHaveText("둘째 챕터");
	await page.getByTestId("read-novel").click();
	await expect(page.getByTestId("reader-chapter-title")).toHaveText("첫 챕터");
	await page.getByTestId("reader-next").click();
	await expect(page.getByTestId("reader-chapter-title")).toHaveText(
		"둘째 챕터",
	);
	await page.getByTestId("reader-prev").click();
	await expect(page.getByTestId("reader-chapter-title")).toHaveText("첫 챕터");
});

test("TXT and Markdown downloads contain titles description scene breaks and format-specific emphasis", async ({
	page,
}) => {
	const url = await novel(page);
	await chapter(page);
	await richBody(page);
	await save(page);
	await page.goto(url);
	await chapter(page, "빈 챕터");
	await page.goto(url);
	for (const format of ["txt", "md"]) {
		await page.getByTestId("export-button").click();
		const event = page.waitForEvent("download");
		await page.getByTestId(`export-${format}`).click();
		const download = await event;
		expect(await download.failure()).toBeNull();
		expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
		const path = await download.path();
		if (!path) throw new Error("Download path is missing");
		const content = await readFile(path, "utf8");
		for (const text of [
			"별의 기록",
			"밤하늘을 여행하는 이야기",
			"첫 만남",
			"빈 챕터",
			"* * *",
			"새로운 아침이었다.",
		])
			expect(content).toContain(text);
		if (format === "md") {
			expect(content).toContain("# 별의 기록");
			expect(content).toContain("## 첫 만남");
			expect(content).toContain("**강조된 약속**");
		} else {
			expect(content).toContain("강조된 약속");
			expect(content).not.toContain("**");
		}
	}
});

test("two pages saving the same chapter produce a real 409 conflict and retain input", async ({
	page,
	context,
}) => {
	await novel(page);
	const url = await chapter(page);
	const other = await context.newPage();
	await other.goto(url);
	await expect(other.getByTestId("editor-content")).toBeVisible();
	await page.getByTestId("editor-content").fill("먼저 저장한 본문");
	await save(page);
	await other.getByTestId("editor-content").fill("충돌한 본문");
	const response = other.waitForResponse(
		(res) => res.request().method() === "PUT" && res.status() === 409,
	);
	await other.getByTestId("save-button").click();
	await response;
	await expect(other.getByTestId("conflict-banner")).toBeVisible();
	await expect(other.getByTestId("save-status")).toHaveAttribute(
		"data-state",
		"conflict",
	);
	await expect(other.getByTestId("editor-content")).toHaveText("충돌한 본문");
});

test("unsaved local draft is offered after reload and restore recovers the text", async ({
	page,
}) => {
	await novel(page);
	await chapter(page);
	await page.getByTestId("editor-content").fill("서버에 저장하지 않은 초안");
	await expect(page.getByTestId("local-draft-status")).toContainText(
		"초안 보관됨",
		{ timeout: 15_000 },
	);
	await page.reload();
	await expect(page.getByTestId("recovery-banner")).toBeVisible();
	await page.getByTestId("recovery-restore").click();
	await expect(page.getByTestId("editor-content")).toHaveText(
		"서버에 저장하지 않은 초안",
	);
	await expect(page.getByTestId("save-status")).toHaveAttribute(
		"data-state",
		"dirty",
	);
});

test("another approved member cannot open the owner's novel URL or see its content", async ({
	page,
	browser,
}) => {
	const url = await novel(page);
	await chapter(page);
	await page
		.getByTestId("editor-content")
		.fill("소유자만 볼 수 있는 비밀 본문");
	await save(page);
	const context = await browser.newContext({
		baseURL: "http://localhost:3100",
	});
	try {
		const other = await context.newPage();
		await member(other);
		const response = other.waitForResponse(
			(res) => res.url().includes("/api/novels/") && res.status() === 404,
		);
		await other.goto(url);
		await response;
		await expect(other.getByTestId("chapters-error")).toContainText(
			"대상을 찾을 수 없습니다",
		);
		await expect(other.getByTestId("novel-title")).toHaveCount(0);
		await expect(other.getByText("소유자만 볼 수 있는 비밀 본문")).toHaveCount(
			0,
		);
	} finally {
		await context.close();
	}
});
