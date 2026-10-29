import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["list"], ["html", { open: "never" }]],
	use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			command: "pnpm --filter @novelist/api dev",
			cwd: "../..",
			env: {
				DATABASE_PATH: "./tests/e2e/.data/e2e.db",
				ENABLE_TEST_ENDPOINTS: "1",
			},
			url: "http://localhost:3001/api/health",
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
		{
			command: "pnpm --filter @novelist/web dev",
			cwd: "../..",
			url: "http://localhost:3000",
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
	],
});
