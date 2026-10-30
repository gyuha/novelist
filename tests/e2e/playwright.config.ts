import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	timeout: 120_000,
	expect: { timeout: 30_000 },
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["list"], ["html", { open: "never" }]],
	use: { baseURL: "http://localhost:3100", trace: "on-first-retry" },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			command:
				"rm -f ./tests/e2e/.data/e2e.db ./tests/e2e/.data/e2e.db-shm ./tests/e2e/.data/e2e.db-wal && pnpm --filter @novelist/api seed:admin && pnpm --filter @novelist/api dev",
			cwd: "../..",
			env: {
				DATABASE_PATH: "./tests/e2e/.data/e2e.db",
				ENABLE_TEST_ENDPOINTS: "1",
				PORT: "3101",
				ADMIN_EMAIL: "admin@example.com",
				ADMIN_PASSWORD: "AdminPassword123!",
			},
			url: "http://localhost:3101/api/health",
			reuseExistingServer: false,
			timeout: 120_000,
		},
		{
			command: "pnpm --filter @novelist/web exec next dev -p 3100",
			cwd: "../..",
			env: { API_URL: "http://localhost:3101" },
			url: "http://localhost:3100",
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
