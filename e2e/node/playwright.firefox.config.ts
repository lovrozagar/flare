import { defineConfig, devices } from "@playwright/test"

const PORT = "4101"
process.env.PORT = PORT

export default defineConfig({
	expect: { timeout: 10_000 },
	forbidOnly: true,
	grepInvert: /@prod-only/,
	retries: 1,
	testDir: "../app/e2e",
	testMatch: ["smoke.test.ts", "gaps.test.ts", "not-found.test.ts"],
	timeout: 45_000,
	use: {
		...devices["Desktop Firefox"],
		baseURL: `http://localhost:${PORT}`,
		trace: "on-first-retry",
	},
	webServer: {
		command: "bunx vite dev --port 4101",
		cwd: "../app",
		env: { PORT },
		port: Number(PORT),
		reuseExistingServer: false,
		timeout: 30_000,
	},
})
