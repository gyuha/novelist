import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPassword123!";
const MEMBER_PASSWORD = "MemberPassword123!";
const BASE_URL = "http://localhost:3100";

function uniqueEmail(label: string) {
	return `${label}-${randomUUID()}@example.com`.toLowerCase();
}

async function login(page: Page, email: string, password: string) {
	await page.goto("/login");
	await page.getByTestId("login-email").fill(email);
	await page.getByTestId("login-password").fill(password);
	await page.getByTestId("login-submit").click();
}

async function signup(page: Page, email: string, password = MEMBER_PASSWORD) {
	await page.goto("/signup");
	await page.getByTestId("signup-email").fill(email);
	await page.getByTestId("signup-password").fill(password);
	await page.getByTestId("signup-confirm").fill(password);
	await page.getByTestId("signup-submit").click();
	await page.waitForURL("/pending");
	await expect(page.getByTestId("pending-email")).toHaveText(email);
}

async function openAdmin(page: Page, tab: "pending" | "members" = "pending") {
	await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
	await page.waitForURL("/");
	await page.goto("/admin");
	if (tab === "members") await page.getByTestId("tab-members").click();
}

async function approve(page: Page, email: string) {
	await expect(page.getByTestId(`pending-row-${email}`)).toBeVisible();
	await page.getByTestId(`approve-${email}`).click();
	await expect(page.getByTestId(`pending-row-${email}`)).toBeHidden();
}

async function createActiveMember(
	memberPage: Page,
	adminPage: Page,
	email: string,
) {
	await signup(memberPage, email);
	await openAdmin(adminPage);
	await approve(adminPage, email);
	await memberPage.getByTestId("logout-button").click();
	await memberPage.waitForURL("/login");
}

async function openMemberAction(page: Page, email: string, action: string) {
	await page.getByTestId(`member-menu-${email}`).click();
	await page.getByTestId(`${action}-${email}`).click();
}

test.describe.configure({ mode: "serial" });

test("sign-up, pending, admin approval, and member login", async ({
	browser,
}) => {
	const email = uniqueEmail("approve");
	const member = await browser.newPage({ baseURL: BASE_URL });
	const admin = await browser.newPage({ baseURL: BASE_URL });
	await signup(member, email);
	await member.getByTestId("pending-check").click();
	await expect(member.getByTestId("pending-still")).toBeVisible();
	await openAdmin(admin);
	await approve(admin, email);
	await member.getByTestId("logout-button").click();
	await login(member, email, MEMBER_PASSWORD);
	await member.waitForURL("/");
	await expect(member.getByTestId("account-menu-button")).toBeVisible();
	await member.close();
	await admin.close();
});

test("admin rejects an application and the email can apply again", async ({
	browser,
}) => {
	const email = uniqueEmail("reject");
	const applicant = await browser.newPage({ baseURL: BASE_URL });
	const admin = await browser.newPage({ baseURL: BASE_URL });
	await signup(applicant, email);
	await openAdmin(admin);
	await admin.getByTestId(`reject-${email}`).click();
	await expect(admin.getByTestId("reject-dialog")).toBeVisible();
	await admin.getByTestId("reject-dialog-confirm").click();
	await expect(admin.getByTestId(`pending-row-${email}`)).toBeHidden();
	await applicant.getByTestId("logout-button").click();
	await signup(applicant, email);
	await expect(applicant.getByTestId("pending-email")).toHaveText(email);
	await applicant.close();
	await admin.close();
});

test("suspension ends the member session and unsuspension restores login", async ({
	browser,
}) => {
	const email = uniqueEmail("suspend");
	const member = await browser.newPage({ baseURL: BASE_URL });
	const admin = await browser.newPage({ baseURL: BASE_URL });
	await createActiveMember(member, admin, email);
	await login(member, email, MEMBER_PASSWORD);
	await member.waitForURL("/");
	await admin.getByTestId("tab-members").click();
	await openMemberAction(admin, email, "suspend");
	await admin.getByTestId("suspend-dialog-confirm").click();
	await expect(admin.getByTestId(`member-status-${email}`)).toHaveText("정지");
	await member.reload();
	await member.waitForURL("/login");
	await login(member, email, MEMBER_PASSWORD);
	await expect(member.getByTestId("login-suspended")).toBeVisible();
	await openMemberAction(admin, email, "unsuspend");
	await expect(admin.getByTestId(`member-status-${email}`)).toHaveText("활성");
	await login(member, email, MEMBER_PASSWORD);
	await member.waitForURL("/");
	await member.close();
	await admin.close();
});

test("password reset forces a change and the new password works", async ({
	browser,
}) => {
	const email = uniqueEmail("reset");
	const newPassword = "ResetChanged123!";
	const member = await browser.newPage({ baseURL: BASE_URL });
	const admin = await browser.newPage({ baseURL: BASE_URL });
	await createActiveMember(member, admin, email);
	await admin.getByTestId("tab-members").click();
	await openMemberAction(admin, email, "reset");
	await admin.getByTestId("reset-dialog-confirm").click();
	await expect(admin.getByTestId("reset-result")).toBeVisible();
	const temporaryPassword = await admin
		.getByTestId("reset-temp-password")
		.textContent();
	if (!temporaryPassword)
		throw new Error("Temporary password was not displayed");
	await login(member, email, temporaryPassword);
	await member.waitForURL("/account/password");
	await expect(member.getByTestId("password-forced-notice")).toBeVisible();
	await member.getByTestId("password-current").fill(temporaryPassword);
	await member.getByTestId("password-new").fill(newPassword);
	await member.getByTestId("password-confirm").fill(newPassword);
	await member.getByTestId("password-submit").click();
	await member.waitForURL("/");
	await member.getByTestId("account-menu-button").click();
	await member.getByTestId("menu-logout").click();
	await login(member, email, newPassword);
	await member.waitForURL("/");
	await member.close();
	await admin.close();
});

test("member voluntarily changes password from the account menu", async ({
	browser,
}) => {
	const email = uniqueEmail("password");
	const newPassword = "VoluntaryNew123!";
	const member = await browser.newPage({ baseURL: BASE_URL });
	const admin = await browser.newPage({ baseURL: BASE_URL });
	await createActiveMember(member, admin, email);
	await login(member, email, MEMBER_PASSWORD);
	await member.waitForURL("/");
	await member.getByTestId("account-menu-button").click();
	await member.getByTestId("menu-change-password").click();
	await member.waitForURL("/account/password");
	await member.getByTestId("password-current").fill(MEMBER_PASSWORD);
	await member.getByTestId("password-new").fill(newPassword);
	await member.getByTestId("password-confirm").fill(newPassword);
	await member.getByTestId("password-submit").click();
	await expect(member.getByTestId("password-success")).toBeVisible();
	await member.getByTestId("password-back").click();
	await member.getByTestId("account-menu-button").click();
	await member.getByTestId("menu-logout").click();
	await login(member, email, newPassword);
	await member.waitForURL("/");
	await member.close();
	await admin.close();
});

test("admin deletes a member after email retype and login fails", async ({
	browser,
}) => {
	const email = uniqueEmail("delete");
	const member = await browser.newPage({ baseURL: BASE_URL });
	const admin = await browser.newPage({ baseURL: BASE_URL });
	await createActiveMember(member, admin, email);
	await admin.getByTestId("tab-members").click();
	await openMemberAction(admin, email, "delete");
	await admin.getByTestId("delete-dialog-retype").fill(email);
	await admin.getByTestId("delete-dialog-confirm").click();
	await expect(admin.getByTestId(`member-row-${email}`)).toBeHidden();
	await login(member, email, MEMBER_PASSWORD);
	await expect(member.getByTestId("login-error")).toBeVisible();
	await member.close();
	await admin.close();
});

test("non-admin sees the forbidden state without admin data", async ({
	browser,
}) => {
	const email = uniqueEmail("forbidden");
	const member = await browser.newPage({ baseURL: BASE_URL });
	const admin = await browser.newPage({ baseURL: BASE_URL });
	await createActiveMember(member, admin, email);
	await login(member, email, MEMBER_PASSWORD);
	await member.waitForURL("/");
	await member.goto("/admin");
	await expect(member.getByTestId("admin-forbidden")).toBeVisible();
	await expect(member.getByTestId("pending-list")).toHaveCount(0);
	await expect(member.getByTestId("members-list")).toHaveCount(0);
	await member.close();
	await admin.close();
});
