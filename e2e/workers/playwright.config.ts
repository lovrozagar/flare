import { defineConfig } from "@playwright/test"

const PORT = "4104"
process.env.PORT = PORT

const mode = process.env.TEST_MODE ?? "dev"
const isDev = mode === "dev"

export default defineConfig({
	expect: { timeout: 10_000 },
	forbidOnly: true,
	grepInvert: isDev ? /@prod-only/ : /@dev-only/,
	retries: 1,
	testDir: "../app/e2e",
	timeout: 45_000,
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "on-first-retry",
	},
	webServer: {
		command: `bunx vite dev --port ${PORT} --config vite.workers.config.ts`,
		cwd: "../app",
		env: { PORT },
		port: Number(PORT),
		reuseExistingServer: false,
		timeout: 60_000,
	},
})
