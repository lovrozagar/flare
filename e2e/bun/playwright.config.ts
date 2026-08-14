import { defineConfig } from "@playwright/test"

const mode = process.env.TEST_MODE ?? "dev"
const isDev = mode === "dev"
const PORT = isDev ? "4103" : "4105"
process.env.PORT = PORT

export default defineConfig({
	expect: { timeout: 10_000 },
	forbidOnly: true,
	grepInvert: isDev ? /@prod-only/ : /@dev-only/,
	retries: 1,
	testDir: "../app/e2e",
	timeout: 30_000,
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "on-first-retry",
	},
	webServer: {
		command: isDev
			? "bunx --bun vite dev --port 4103"
			: "bun run build && bunx --bun vite preview --port 4105",
		cwd: "../app",
		env: { PORT },
		port: Number(PORT),
		reuseExistingServer: false,
		timeout: isDev ? 30_000 : 180_000,
	},
})
