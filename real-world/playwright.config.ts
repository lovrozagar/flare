import { defineConfig, devices } from "@playwright/test"

const mode = process.env.TEST_MODE ?? "dev"
const isDev = mode === "dev"

export default defineConfig({
	expect: { timeout: 10_000 },
	forbidOnly: true,
	grepInvert: isDev ? /@prod-only/ : /@dev-only/,
	maxFailures: isDev ? 10 : 0,
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	retries: 0,
	testDir: "./e2e",
	timeout: 30_000,
	use: {
		baseURL: "http://localhost:5001",
		bypassCSP: true,
		trace: "on-first-retry",
		userAgent:
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
	},
	webServer: {
		command: isDev ? "bunx --bun vite dev --port 5001" : "bunx --bun vite preview --port 5001",
		port: 5001,
		reuseExistingServer: true,
		timeout: 30_000,
	},
})
