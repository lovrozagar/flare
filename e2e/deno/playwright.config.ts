import { defineConfig } from "@playwright/test"

const mode = process.env.TEST_MODE ?? "dev"
const isDev = mode === "dev"
const PORT = isDev ? "4106" : "4107"
process.env.PORT = PORT

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
		command: isDev
			? "deno run -A npm:vite dev --port 4106"
			: "bun run build && deno run -A npm:vite preview --port 4107",
		cwd: "../app",
		env: { PORT },
		port: Number(PORT),
		reuseExistingServer: false,
		timeout: isDev ? 30_000 : 180_000,
	},
})
